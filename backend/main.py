from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from swarm import DefenseAsset, HEIGHT, TerrainZone, WIDTH, make_battle, tick, serialize_state, DT
from tournament import tournament
from ai_client import complete, complete_system
import asyncio
import json
import re
from dotenv import load_dotenv

load_dotenv()
tournament_task: asyncio.Task | None = None
simulation_speed: float = 1.0

# ── LLM mutation callback ──────────────────────────────────

async def llm_mutation_callback(best_strategy) -> dict:
    summary = (
        f"Generation {tournament.generation}. "
        f"Best fitness: {best_strategy.fitness:.3f}. "
        f"Current params: {json.dumps(best_strategy.params)}. "
        f"Attack type: {best_strategy.params.get('type')}."
    )
    result = await complete(
        prompt=(
            f"{summary}\n\n"
            f"You are an adversarial AI red team analyst optimizing a drone swarm attack. "
            f"Based on the current fitness score and parameters, propose ONE specific parameter "
            f"mutation that would make this attack more effective against a defended position. "
            f"Valid params: type (direct/fragmentation/decoy), interceptor_cooldown (0.5-5.0), "
            f"decoy_radius (50-250), decoy_x (0-800), decoy_y (0-600). "
            f"Respond with JSON only, no markdown, no backticks: "
            f"{{\"param\": \"...\", \"new_value\": ..., \"reasoning\": \"...\"}}"
        ),
        model_key="analyst",
        max_tokens=200,
    )
    clean = result.strip()
    fence_match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", clean, re.DOTALL)
    if fence_match:
        clean = fence_match.group(1).strip()
    return json.loads(clean)

# ── broadcast helper ───────────────────────────────────────

async def broadcast_generation(record: dict):
    """Send generation update to all active battle sessions."""
    for session_id in list(manager.active.keys()):
        await manager.broadcast(session_id, {
            "type": "generation",
            "generation": record
        })

# ── lifespan: start tournament on boot ────────────────────

@asynccontextmanager
async def lifespan(app):
    global battle_paused
    battle_paused = True
    tournament.on_generation = broadcast_generation
    yield
    tournament.stop()
    if tournament_task:
        tournament_task.cancel()

app = FastAPI(title="WRAITH Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── connection manager ─────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, ws: WebSocket, session_id: str):
        await ws.accept()
        self.active.setdefault(session_id, []).append(ws)

    def disconnect(self, ws: WebSocket, session_id: str):
        if ws in self.active.get(session_id, []):
            self.active[session_id].remove(ws)
        if not self.active.get(session_id):
            self.active.pop(session_id, None)

    async def broadcast(self, session_id: str, data: dict):
        stale = []
        for ws in self.active.get(session_id, []):
            try:
                await ws.send_json(data)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws, session_id)

manager = ConnectionManager()
active_battles: dict[str, tuple] = {}
# Global pause flag (pauses all simulations when True)
battle_paused: bool = True

ASSET_RADII = {
    "jammer": 110.0,
    "interceptor": 60.0,
    "spoofer": 110.0,
}
TERRAIN_PRESETS = {
    "clear": [],
    "urban": [
        TerrainZone("urban_core", 260.0, 210.0, 280.0, 180.0, "urban", "Urban clutter"),
    ],
    "ridge": [
        TerrainZone("ridge_line", 120.0, 260.0, 560.0, 70.0, "ridge", "Ridgeline mask"),
    ],
    "rf_shadow": [
        TerrainZone("rf_shadow_north", 180.0, 120.0, 180.0, 220.0, "rf_shadow", "RF shadow"),
        TerrainZone("rf_shadow_south", 500.0, 300.0, 160.0, 180.0, "rf_shadow", "RF shadow"),
    ],
}
# ── routes ─────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "operational", "system": "WRAITH"}

@app.get("/api/tournament/status")
async def tournament_status():
    return tournament.get_status()

@app.post("/api/battle/start")
async def start_battle(n_drones: int = 30):
    # Use current best strategy from tournament
    params = tournament.best.params if tournament.best else None
    state, strategy = make_battle(n_drones=n_drones, strategy_params=params)
    active_battles[state.session_id] = (state, strategy)
    return {"session_id": state.session_id}


@app.post("/api/battle/pause")
async def pause_battle():
    global battle_paused
    battle_paused = True
    return {"status": "paused"}


@app.post("/api/battle/resume")
async def resume_battle():
    global battle_paused
    battle_paused = False
    return {"status": "resumed"}


@app.post("/api/battle/speed")
async def set_battle_speed(speed: float):
    global simulation_speed
    simulation_speed = clamp(speed, 0.25, 2.0)
    return {"status": "speed updated", "speed": simulation_speed}


@app.post("/api/tournament/pause")
async def pause_tournament():
    tournament.paused = True
    return {"status": "tournament paused"}


@app.post("/api/tournament/resume")
async def resume_tournament():
    tournament.paused = False
    await ensure_tournament_running()
    return {"status": "tournament resumed"}


@app.post("/api/tournament/restart")
async def restart_tournament_route():
    await restart_tournament()
    return {"status": "tournament restarted"}


@app.post("/api/system/reset")
async def reset_system():
    await reset_all_state()
    return {"status": "reset"}


async def reset_all_state():
    global battle_paused, tournament_task
    battle_paused = True

    if tournament_task:
        tournament.stop()
        tournament_task.cancel()
        try:
            await tournament_task
        except asyncio.CancelledError:
            pass

    tournament.reset_state()
    tournament.on_generation = broadcast_generation

    for session_id in list(active_battles.keys()):
        params = tournament.best.params if tournament.best else None
        state, strategy = make_battle(session_id=session_id, strategy_params=params)
        active_battles[session_id] = (state, strategy)
        await manager.broadcast(session_id, {"type": "reset"})
        await manager.broadcast(session_id, {
            "type": "hydrate",
            "history": [],
            "generation": 0,
        })
        await manager.broadcast(session_id, serialize_state(state))


async def ensure_tournament_running():
    global tournament_task
    if tournament.generation >= tournament.max_generations:
        await restart_tournament()
        return
    if tournament_task and not tournament_task.done() and tournament.running:
        return
    tournament.on_generation = broadcast_generation
    tournament_task = asyncio.create_task(tournament.run(llm_callback=llm_mutation_callback))


async def restart_tournament():
    global tournament_task
    if tournament_task:
        tournament.stop()
        tournament_task.cancel()
        try:
            await tournament_task
        except asyncio.CancelledError:
            pass

    tournament.reset_state()
    tournament.on_generation = broadcast_generation
    tournament_task = asyncio.create_task(tournament.run(llm_callback=llm_mutation_callback))
    for session_id in list(manager.active.keys()):
        await manager.broadcast(session_id, {
            "type": "hydrate",
            "history": [],
            "generation": 0,
            "replace": True,
        })


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def payload_radius(payload: dict, asset_type: str) -> float:
    try:
        radius = float(payload.get("radius"))
    except (TypeError, ValueError):
        return ASSET_RADII[asset_type]
    return round(clamp(radius, 20.0, 320.0), 1)


async def terrain_from_description(description: str) -> list[TerrainZone]:
    try:
        return await generate_terrain_with_llm(description)
    except Exception as e:
        print(f"Terrain generation failed, using fallback: {e}")
        return procedural_terrain_from_description(description)


async def generate_terrain_with_llm(description: str) -> list[TerrainZone]:
    result = await complete_system(
        system=(
            "You generate compact battlefield terrain overlays for an 800m by 600m top-down canvas. "
            "Return JSON only with a top-level zones array. Create 2-5 zones that match the requested "
            "terrain type or location. Valid terrain types are urban, ridge, rf_shadow, desert, water. "
            "Each zone needs id, x, y, width, height, type, label. Coordinates are meters from the top-left, "
            "x 0-800, y 0-600. Keep labels short and tactical. Do not use markdown."
        ),
        user=f"Terrain request: {description}",
        model_key="fast",
        max_tokens=700,
    )
    clean = result.strip()
    fence_match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", clean, re.DOTALL)
    if fence_match:
        clean = fence_match.group(1).strip()
    data = json.loads(clean)
    zones = data.get("zones", data if isinstance(data, list) else [])
    parsed = [coerce_terrain_zone(zone, index) for index, zone in enumerate(zones[:5])]
    return [zone for zone in parsed if zone is not None] or procedural_terrain_from_description(description)


def coerce_terrain_zone(zone: dict, index: int) -> TerrainZone | None:
    if not isinstance(zone, dict):
        return None
    terrain_type = zone.get("type")
    if terrain_type not in {"urban", "ridge", "rf_shadow", "desert", "water"}:
        return None
    try:
        x = clamp(float(zone.get("x")), 0.0, WIDTH - 20.0)
        y = clamp(float(zone.get("y")), 0.0, HEIGHT - 20.0)
        width = clamp(float(zone.get("width")), 30.0, WIDTH - x)
        height = clamp(float(zone.get("height")), 30.0, HEIGHT - y)
    except (TypeError, ValueError):
        return None
    label = str(zone.get("label") or terrain_type.replace("_", " ").title())[:32]
    zone_id = re.sub(r"[^a-z0-9_]+", "_", str(zone.get("id") or f"generated_{index}").lower())
    return TerrainZone(zone_id, x, y, width, height, terrain_type, label)


def procedural_terrain_from_description(description: str) -> list[TerrainZone]:
    text = description.lower()
    zones: list[TerrainZone] = []

    if any(word in text for word in ["ocean", "oceanic", "maritime", "sea", "coastal", "island"]):
        zones.append(TerrainZone("generated_water", 70.0, 95.0, 660.0, 395.0, "water", "Open water"))
        zones.append(TerrainZone("generated_littoral", 95.0, 395.0, 610.0, 55.0, "urban", "Littoral objective zone"))
    if any(word in text for word in ["desert", "arid", "sand", "dry"]):
        zones.append(TerrainZone("generated_desert", 135.0, 145.0, 530.0, 330.0, "desert", "Open desert"))
    if any(word in text for word in ["city", "urban", "dense", "buildings", "downtown"]):
        zones.append(TerrainZone("generated_urban", 250.0, 205.0, 300.0, 190.0, "urban", "Urban clutter"))
    if any(word in text for word in ["mountain", "mountainous", "ridge", "valley", "hills", "alpine"]):
        zones.append(TerrainZone("generated_ridge_north", 70.0, 155.0, 660.0, 70.0, "ridge", "Mountain ridge"))
        zones.append(TerrainZone("generated_valley", 155.0, 280.0, 490.0, 105.0, "desert", "Valley floor"))
        zones.append(TerrainZone("generated_ridge_south", 115.0, 430.0, 570.0, 60.0, "ridge", "Terrain masking ridge"))
    if any(word in text for word in ["rf", "jam", "shadow", "dead zone", "canyon"]):
        zones.append(TerrainZone("generated_rf_shadow", 470.0, 140.0, 180.0, 230.0, "rf_shadow", "RF shadow"))

    return zones or [
        TerrainZone("generated_mixed", 150.0, 145.0, 500.0, 330.0, "desert", "Generated terrain area"),
    ]


def make_manual_asset(payload: dict) -> DefenseAsset | None:
    asset_type = payload.get("asset_type")
    if asset_type not in ASSET_RADII:
        return None

    try:
        x = clamp(float(payload.get("x")), 0.0, WIDTH)
        y = clamp(float(payload.get("y")), 0.0, HEIGHT)
    except (TypeError, ValueError):
        return None

    asset_id = str(payload.get("id") or f"manual_{asset_type}_{int(x)}_{int(y)}")
    name = str(payload.get("name") or asset_type.title())
    try:
        reload_time = float(payload.get("reload_time"))
    except (TypeError, ValueError):
        reload_time = 2.0
    try:
        effectiveness = float(payload.get("effectiveness"))
    except (TypeError, ValueError):
        effectiveness = 1.0

    return DefenseAsset(
        id=asset_id,
        name=name,
        x=x,
        y=y,
        asset_type=asset_type,
        radius=payload_radius(payload, asset_type),
        reload_time=max(0.25, min(10.0, reload_time)),
        effectiveness=clamp(effectiveness, 0.0, 1.0),
    )


async def generate_debrief(state, strategy) -> str:
    summary = {
        "result": "breach" if state.objective_reached else "defense_success",
        "time_elapsed_seconds": round(state.time_elapsed, 1),
        "drones_total": len(state.drones),
        "drones_destroyed": sum(1 for drone in state.drones if not drone.alive),
        "drones_disrupted": sum(1 for drone in state.drones if drone.alive and (drone.jammed or drone.spoofed)),
        "defense_assets": [
            {
                "name": asset.name or asset.asset_type,
                "type": asset.asset_type,
                "x_m": round(asset.x, 1),
                "y_m": round(asset.y, 1),
                "range_m": round(asset.radius, 1),
                "reload_s": round(asset.reload_time, 2),
                "effectiveness": round(asset.effectiveness, 2),
            }
            for asset in state.defense_assets
        ],
        "terrain": [
            {
                "label": zone.label,
                "type": zone.terrain_type,
                "x_m": round(zone.x, 1),
                "y_m": round(zone.y, 1),
                "width_m": round(zone.width, 1),
                "height_m": round(zone.height, 1),
            }
            for zone in state.terrain_zones
        ],
        "attacker_strategy": strategy.params,
    }
    try:
        return await complete_system(
            system=(
                "You are WRAITH's battle debrief analyst. Produce a concise operational debrief "
                "for a drone defense simulation. Include: outcome, terrain effects, asset placement "
                "assessment using meter coordinates, what worked, vulnerabilities, and next test recommendations. "
                "Do not invent weapon models beyond the provided assets."
            ),
            user=json.dumps(summary),
            model_key="analyst",
            max_tokens=700,
        )
    except Exception as e:
        print(f"Debrief generation failed, using fallback: {e}")
        outcome = "Attack reached the objective." if state.objective_reached else "Defense prevented objective breach."
        assets = ", ".join(
            f"{asset.name or asset.asset_type} at ({asset.x:.0f}m,{asset.y:.0f}m)"
            for asset in state.defense_assets
        ) or "No user-added assets"
        terrain = ", ".join(zone.label for zone in state.terrain_zones) or "No terrain overlays"
        return (
            f"{outcome} Engagement lasted {state.time_elapsed:.1f}s. "
            f"Destroyed drones: {summary['drones_destroyed']}/{summary['drones_total']}; "
            f"currently disrupted: {summary['drones_disrupted']}. "
            f"Assets: {assets}. Terrain: {terrain}. "
            "Next test: vary asset spacing around the objective and compare layered jammer/spoofer coverage against interceptor-only defense."
        )


async def handle_battle_command(session_id: str, message: dict) -> None:
    global simulation_speed
    battle = active_battles.get(session_id)
    if not battle:
        return

    state, strategy = battle
    message_type = message.get("type")

    if message_type == "place_defense_asset":
        asset = make_manual_asset(message)
        if not asset:
            return

        state.defense_assets.append(asset)
        active_battles[session_id] = (state, strategy)
        return

    if message_type == "move_defense_asset":
        asset_id = message.get("id")
        try:
            x = clamp(float(message.get("x")), 0.0, WIDTH)
            y = clamp(float(message.get("y")), 0.0, HEIGHT)
        except (TypeError, ValueError):
            return

        for asset in state.defense_assets:
            if asset.id == asset_id:
                asset.x = x
                asset.y = y
                active_battles[session_id] = (state, strategy)
                return

    if message_type == "remove_defense_asset":
        asset_id = message.get("id")
        state.defense_assets = [
            asset for asset in state.defense_assets
            if asset.id != asset_id
        ]
        active_battles[session_id] = (state, strategy)
        return

    if message_type == "set_terrain_preset":
        preset = message.get("preset")
        if preset not in TERRAIN_PRESETS:
            return
        state.terrain_zones = [
            TerrainZone(
                id=zone.id,
                x=zone.x,
                y=zone.y,
                width=zone.width,
                height=zone.height,
                terrain_type=zone.terrain_type,
                label=zone.label,
            )
            for zone in TERRAIN_PRESETS[preset]
        ]
        active_battles[session_id] = (state, strategy)
        return

    if message_type == "describe_terrain":
        description = str(message.get("description") or "")
        state.terrain_zones = await terrain_from_description(description)
        active_battles[session_id] = (state, strategy)
        return

    if message_type == "set_speed":
        try:
            simulation_speed = clamp(float(message.get("speed")), 0.25, 2.0)
        except (TypeError, ValueError):
            return


async def receive_battle_commands(ws: WebSocket, queue: asyncio.Queue) -> None:
    while True:
        queue.put_nowait(await ws.receive_json())

@app.websocket("/ws/battle/{session_id}")
async def battle_ws(ws: WebSocket, session_id: str):
    await manager.connect(ws, session_id)

    # Hydrate frontend with existing tournament history
    await ws.send_json({
        "type": "hydrate",
        "history": tournament.history[-50:],
        "generation": tournament.generation,
    })

    # Always start a fresh battle on new connection
    params = tournament.best.params if tournament.best else None
    state, strategy = make_battle(session_id=session_id, strategy_params=params)
    active_battles[session_id] = (state, strategy)
    commands: asyncio.Queue = asyncio.Queue()
    command_reader = asyncio.create_task(receive_battle_commands(ws, commands))
    debrief_sent = False

    try:
        while True:
            if command_reader.done():
                command_reader.result()

            state, strategy = active_battles[session_id]

            while not commands.empty():
                message = commands.get_nowait()
                await handle_battle_command(session_id, message)
                state, strategy = active_battles[session_id]

            # If paused, do not advance simulation ticks. Still broadcast
            # current state so clients know the simulation is paused.
            if not battle_paused:
                if not state.terminal:
                    debrief_sent = False
                    state = tick(state, strategy)
                    active_battles[session_id] = (state, strategy)
                elif not debrief_sent:
                    debrief_sent = True
                    debrief = await generate_debrief(state, strategy)
                    await manager.broadcast(session_id, {
                        "type": "debrief",
                        "debrief": debrief,
                    })

            await manager.broadcast(session_id, serialize_state(state))
            await asyncio.sleep(DT / simulation_speed)

    except WebSocketDisconnect:
        manager.disconnect(ws, session_id)
        if session_id not in manager.active:
            active_battles.pop(session_id, None)
    finally:
        command_reader.cancel()
