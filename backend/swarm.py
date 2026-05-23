from dataclasses import dataclass, field
from typing import Optional
import math
import random
import uuid

@dataclass
class Drone:
    id: str
    x: float
    y: float
    vx: float = 0.0
    vy: float = 0.0
    alive: bool = True
    team: str = "red"                  # "red" = attacker, "blue" = defender
    comms_links: list[str] = field(default_factory=list)
    objective: tuple[float, float] = (400.0, 300.0)
    jammed: bool = False               # comms severed by jammer
    spoofed: bool = False              # heading redirected by spoofer

@dataclass
class DefenseAsset:
    id: str
    x: float
    y: float
    asset_type: str                    # "jammer", "interceptor", "spoofer"
    radius: float                      # effective range
    active: bool = True
    cooldown: float = 0.0              # seconds until can fire again

@dataclass
class AttackStrategy:
    id: str
    generation: int
    params: dict                       # attack configuration
    fitness: float = 0.0
    is_llm_guided: bool = False
    llm_reasoning: Optional[str] = None

@dataclass 
class BattleState:
    session_id: str
    drones: list[Drone]
    defense_assets: list[DefenseAsset]
    tick: int = 0
    time_elapsed: float = 0.0
    drones_disabled: int = 0
    objective_reached: bool = False
    terminal: bool = False

# ── constants ──────────────────────────────────────────────
WIDTH, HEIGHT = 800.0, 600.0
MAX_SPEED     = 3.0
SEPARATION_DIST = 40.0
COMMS_RANGE     = 120.0
OBJECTIVE_REACH = 30.0
DT              = 1 / 30            # 30 fps tick rate

def _dist(ax, ay, bx, by) -> float:
    return math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)

def _normalize(x, y, fallback=(0, 0)):
    mag = math.sqrt(x * x + y * y)
    if mag < 0.001:
        return fallback
    return x / mag, y / mag

def update_drone(drone: Drone, all_drones: list[Drone]) -> None:
    if not drone.alive or drone.jammed:
        return

    ox, oy = drone.objective if not drone.spoofed else (WIDTH / 2, 0.0)

    # 1. pull toward objective
    dx, dy = ox - drone.x, oy - drone.y
    nx, ny = _normalize(dx, dy)
    drone.vx += nx * 0.4
    drone.vy += ny * 0.4

    # 2. separate from nearby drones
    for other in all_drones:
        if other.id == drone.id or not other.alive:
            continue
        d = _dist(drone.x, drone.y, other.x, other.y)
        if d < SEPARATION_DIST and d > 0.01:
            drone.vx += (drone.x - other.x) / d * 1.5
            drone.vy += (drone.y - other.y) / d * 1.5

    # 3. align with connected neighbors (flocking)
    neighbors = [d for d in all_drones
                 if d.id in drone.comms_links and d.alive]
    if neighbors:
        avg_vx = sum(n.vx for n in neighbors) / len(neighbors)
        avg_vy = sum(n.vy for n in neighbors) / len(neighbors)
        drone.vx += (avg_vx - drone.vx) * 0.1
        drone.vy += (avg_vy - drone.vy) * 0.1

    # 4. cap speed
    spd = math.sqrt(drone.vx ** 2 + drone.vy ** 2)
    if spd > MAX_SPEED:
        drone.vx = drone.vx / spd * MAX_SPEED
        drone.vy = drone.vy / spd * MAX_SPEED

    # 5. move
    drone.x = max(0.0, min(WIDTH,  drone.x + drone.vx * DT * 60))
    drone.y = max(0.0, min(HEIGHT, drone.y + drone.vy * DT * 60))

def rebuild_comms_graph(drones: list[Drone]) -> None:
    # recompute which drones can communicate with which
    for drone in drones:
        if not drone.alive or drone.jammed:
            drone.comms_links = []
            continue
        drone.comms_links = [
            other.id for other in drones
            if other.id != drone.id
            and other.alive
            and not other.jammed
            and _dist(drone.x, drone.y, other.x, other.y) < COMMS_RANGE
        ]

def apply_attacks(
    drones: list[Drone],
    defense_assets: list[DefenseAsset],
    strategy: AttackStrategy
) -> None:
    # apply active attack effects each tick
    params = strategy.params

    for asset in defense_assets:
        if not asset.active:
            continue

        if asset.asset_type == "jammer":
            # Sever comms for drones inside radius
            for drone in drones:
                if not drone.alive:
                    continue
                d = _dist(drone.x, drone.y, asset.x, asset.y)
                drone.jammed = d < asset.radius

        elif asset.asset_type == "interceptor":
            # Kill drones inside radius (with cooldown)
            if asset.cooldown > 0:
                asset.cooldown -= DT
                continue
            for drone in drones:
                if not drone.alive:
                    continue
                d = _dist(drone.x, drone.y, asset.x, asset.y)
                if d < asset.radius:
                    drone.alive = False
                    asset.cooldown = params.get("interceptor_cooldown", 2.0)
                    break                      # one kill per tick per interceptor

        elif asset.asset_type == "spoofer":
            # Redirect heading toward false objective
            for drone in drones:
                if not drone.alive:
                    continue
                d = _dist(drone.x, drone.y, asset.x, asset.y)
                drone.spoofed = d < asset.radius

def apply_swarm_attack(
    drones: list[Drone],
    strategy: AttackStrategy
) -> None:
    # attacker-side tactics - fragment the swarm
    params = strategy.params
    attack_type = params.get("type", "direct")

    if attack_type == "fragmentation":
        # Target the most connected drone and isolate it
        if not drones:
            return
        target = max(
            (d for d in drones if d.alive),
            key=lambda d: len(d.comms_links),
            default=None
        )
        if target:
            target.jammed = True

    elif attack_type == "decoy":
        # Pull a cluster of drones off course
        decoy_x = params.get("decoy_x", WIDTH * 0.2)
        decoy_y = params.get("decoy_y", HEIGHT * 0.8)
        affected = 0
        for drone in drones:
            if drone.alive and not drone.spoofed and affected < 5:
                d = _dist(drone.x, drone.y, decoy_x, decoy_y)
                if d < params.get("decoy_radius", 150):
                    drone.spoofed = True
                    affected += 1

    elif attack_type == "direct":
        # Rush straight to objective — no special effect
        pass

def tick(state: BattleState, strategy: AttackStrategy) -> BattleState:
    # advance simulation one frame. returns updated state
    if state.terminal:
        return state

    state.tick += 1
    state.time_elapsed += DT

    # Apply attacker tactics
    apply_swarm_attack(state.drones, strategy)

    # Apply defense effects
    apply_attacks(state.drones, state.defense_assets, strategy)

    # Rebuild comms graph after jamming
    rebuild_comms_graph(state.drones)

    # Move drones
    for drone in state.drones:
        update_drone(drone, state.drones)

    # Count disabled
    state.drones_disabled = sum(1 for d in state.drones if not d.alive)

    # Check terminal conditions
    alive = [d for d in state.drones if d.alive]

    # Did any drone reach the objective?
    for drone in alive:
        if _dist(drone.x, drone.y, *drone.objective) < OBJECTIVE_REACH:
            state.objective_reached = True
            state.terminal = True
            return state

    # All drones destroyed
    if not alive:
        state.terminal = True
        return state

    # Time limit (30 seconds)
    if state.time_elapsed > 30.0:
        state.terminal = True

    return state


def make_battle(
    n_drones: int = 30,
    session_id: Optional[str] = None,
    strategy_params: Optional[dict] = None,
    defense_config: Optional[dict] = None
) -> tuple[BattleState, AttackStrategy]:
    # factory - create a fresh battle ready to tick
    sid = session_id or str(uuid.uuid4())

    # Default attack strategy
    params = strategy_params or {
        "type": "direct",
        "interceptor_cooldown": 2.0,
        "decoy_radius": 150.0,
        "decoy_x": WIDTH * 0.2,
        "decoy_y": HEIGHT * 0.8,
    }

    strategy = AttackStrategy(
        id=str(uuid.uuid4()),
        generation=0,
        params=params
    )

    # Spawn drones in a cluster at top of canvas
    drones = []
    for i in range(n_drones):
        drones.append(Drone(
            id=f"d{i}",
            x=random.uniform(300, 500),
            y=random.uniform(20, 80),
            vx=random.uniform(-0.5, 0.5),
            vy=random.uniform(0.5, 1.0),
            objective=(400.0, 520.0),   # target = bottom center
            team="red"
        ))

    # Default defense layout
    cfg = defense_config or {}
    defense_assets = [
        DefenseAsset(
            id="jammer_1",
            x=cfg.get("jammer_x", 250.0),
            y=cfg.get("jammer_y", 350.0),
            asset_type="jammer",
            radius=cfg.get("jammer_radius", 110.0)
        ),
        DefenseAsset(
            id="jammer_2",
            x=cfg.get("jammer2_x", 550.0),
            y=cfg.get("jammer2_y", 350.0),
            asset_type="jammer",
            radius=cfg.get("jammer_radius", 110.0)
        ),
        DefenseAsset(
            id="interceptor_1",
            x=400.0,
            y=480.0,
            asset_type="interceptor",
            radius=cfg.get("interceptor_radius", 60.0)
        ),
    ]

    state = BattleState(
        session_id=sid,
        drones=drones,
        defense_assets=defense_assets
    )

    rebuild_comms_graph(drones)
    return state, strategy

def serialize_state(state: BattleState) -> dict:
    # convert BattleState to JSON-serializable dict for WebSocket broadcast
    return {
        "type": "state",
        "tick": state.tick,
        "time_elapsed": round(state.time_elapsed, 2),
        "terminal": state.terminal,
        "objective_reached": state.objective_reached,
        "drones_disabled": state.drones_disabled,
        "drones": [
            {
                "id": d.id,
                "x": round(d.x, 1),
                "y": round(d.y, 1),
                "vx": round(d.vx, 2),
                "vy": round(d.vy, 2),
                "alive": d.alive,
                "team": d.team,
                "jammed": d.jammed,
                "spoofed": d.spoofed,
                "comms_links": d.comms_links,
            }
            for d in state.drones
        ],
        "defense_assets": [
            {
                "id": a.id,
                "x": a.x,
                "y": a.y,
                "type": a.asset_type,
                "radius": a.radius,
                "active": a.active,
            }
            for a in state.defense_assets
        ]
    }