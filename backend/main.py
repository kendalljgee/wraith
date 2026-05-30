from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from swarm import DefenseAsset, HEIGHT, TerrainZone, WIDTH, make_battle, tick, serialize_state, DT
from tournament import tournament
from ai_client import complete
import asyncio
import json
import re
from dotenv import load_dotenv

load_dotenv()
tournament_task: asyncio.Task | None = None

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
    global tournament_task
    tournament.on_generation = broadcast_generation
    tournament_task = asyncio.create_task(tournament.run(llm_callback=llm_mutation_callback))
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
battle_paused: bool = False

ASSET_RADII = {
    "jammer": 110.0,
    "interceptor": 60.0,
    "spoofer": 110.0,
}
MAX_UPGRADE_LEVEL = 3
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
DEFAULT_UPGRADES = {
    "ew_range": 0,
    "interceptor_readiness": 0,
    "sensor_fusion": 0,
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


@app.post("/api/tournament/pause")
async def pause_tournament():
    tournament.paused = True
    return {"status": "tournament paused"}


@app.post("/api/tournament/resume")
async def resume_tournament():
    tournament.paused = False
    return {"status": "tournament resumed"}


@app.post("/api/system/reset")
async def reset_system():
    await reset_all_state()
    return {"status": "reset"}


async def reset_all_state():
    global battle_paused, tournament_task
    battle_paused = False

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


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def asset_radius(asset_type: str, upgrades: dict[str, int]) -> float:
    radius = ASSET_RADII[asset_type]
    if asset_type in {"jammer", "spoofer"}:
        radius *= 1 + upgrades.get("ew_range", 0) * 0.15
    radius *= 1 + upgrades.get("sensor_fusion", 0) * 0.08
    return round(radius, 1)


def payload_radius(payload: dict, asset_type: str, upgrades: dict[str, int]) -> float:
    try:
        radius = float(payload.get("radius"))
    except (TypeError, ValueError):
        return asset_radius(asset_type, upgrades)

    if asset_type in {"jammer", "spoofer"}:
        radius *= 1 + upgrades.get("ew_range", 0) * 0.15
    radius *= 1 + upgrades.get("sensor_fusion", 0) * 0.08
    return round(clamp(radius, 20.0, 320.0), 1)


def interceptor_reload(upgrades: dict[str, int]) -> float:
    return max(0.75, round(2.0 - upgrades.get("interceptor_readiness", 0) * 0.35, 2))


def apply_defense_upgrades(state) -> None:
    for asset in state.defense_assets:
        asset.radius = asset_radius(asset.asset_type, state.defense_upgrades)
        if asset.asset_type == "interceptor":
            asset.reload_time = interceptor_reload(state.defense_upgrades)
            asset.cooldown = min(asset.cooldown, asset.reload_time)


def terrain_from_description(description: str) -> list[TerrainZone]:
    text = description.lower()
    zones: list[TerrainZone] = []

    if "kabul" in text or "afghanistan" in text:
        return [
            TerrainZone("kabul_urban_basin", 255.0, 210.0, 290.0, 170.0, "urban", "Dense urban basin"),
            TerrainZone("kabul_ridge_west", 85.0, 285.0, 630.0, 65.0, "ridge", "Mountain ridge line"),
            TerrainZone("kabul_rf_shadow", 510.0, 115.0, 150.0, 210.0, "rf_shadow", "RF shadow"),
        ]

    if any(word in text for word in ["city", "urban", "dense", "buildings"]):
        zones.append(TerrainZone("generated_urban", 250.0, 205.0, 300.0, 190.0, "urban", "Urban clutter"))
    if any(word in text for word in ["mountain", "ridge", "valley", "hills"]):
        zones.append(TerrainZone("generated_ridge", 110.0, 270.0, 580.0, 75.0, "ridge", "Terrain mask"))
    if any(word in text for word in ["rf", "jam", "shadow", "dead zone", "canyon"]):
        zones.append(TerrainZone("generated_rf_shadow", 470.0, 140.0, 180.0, 230.0, "rf_shadow", "RF shadow"))

    return zones or TERRAIN_PRESETS["clear"]


def make_manual_asset(payload: dict, upgrades: dict[str, int] | None = None) -> DefenseAsset | None:
    asset_type = payload.get("asset_type")
    if asset_type not in ASSET_RADII:
        return None

    try:
        x = clamp(float(payload.get("x")), 0.0, WIDTH)
        y = clamp(float(payload.get("y")), 0.0, HEIGHT)
    except (TypeError, ValueError):
        return None

    upgrade_state = upgrades or {}
    asset_id = str(payload.get("id") or f"manual_{asset_type}_{int(x)}_{int(y)}")
    name = str(payload.get("name") or asset_type.title())
    try:
        reload_time = float(payload.get("reload_time"))
    except (TypeError, ValueError):
        reload_time = interceptor_reload(upgrade_state)

    return DefenseAsset(
        id=asset_id,
        name=name,
        x=x,
        y=y,
        asset_type=asset_type,
        radius=payload_radius(payload, asset_type, upgrade_state),
        reload_time=max(0.25, min(10.0, reload_time)),
    )


async def handle_battle_command(session_id: str, message: dict) -> None:
    battle = active_battles.get(session_id)
    if not battle:
        return

    state, strategy = battle
    message_type = message.get("type")

    if message_type == "place_defense_asset":
        asset = make_manual_asset(message, state.defense_upgrades)
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
        state.terrain_zones = terrain_from_description(description)
        active_battles[session_id] = (state, strategy)
        return

    if message_type == "upgrade_defense":
        upgrade = message.get("upgrade")
        if upgrade not in state.defense_upgrades:
            return

        state.defense_upgrades[upgrade] = min(
            MAX_UPGRADE_LEVEL,
            state.defense_upgrades[upgrade] + 1,
        )
        apply_defense_upgrades(state)
        active_battles[session_id] = (state, strategy)


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
                    state = tick(state, strategy)
                    active_battles[session_id] = (state, strategy)
                else:
                    params = tournament.best.params if tournament.best else None
                    persistent_assets = state.defense_assets
                    persistent_upgrades = state.defense_upgrades
                    persistent_terrain = state.terrain_zones
                    state, strategy = make_battle(
                        session_id=session_id,
                        strategy_params=params,
                        defense_assets=persistent_assets,
                        defense_upgrades=persistent_upgrades,
                        terrain_zones=persistent_terrain,
                    )
                    active_battles[session_id] = (state, strategy)

            await manager.broadcast(session_id, serialize_state(state))
            await asyncio.sleep(DT)

    except WebSocketDisconnect:
        manager.disconnect(ws, session_id)
        if session_id not in manager.active:
            active_battles.pop(session_id, None)
    finally:
        command_reader.cancel()
