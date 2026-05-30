import random
import uuid
from typing import Optional
from swarm import AttackStrategy, BattleState, make_battle, tick, WIDTH, HEIGHT

# ── attack parameter bounds ────────────────────────────────
PARAM_BOUNDS = {
    "type":                 ["direct", "fragmentation", "decoy"],
    "interceptor_cooldown": (0.5, 5.0),
    "decoy_radius":         (50.0, 250.0),
    "decoy_x":              (0.0, WIDTH),
    "decoy_y":              (0.0, HEIGHT),
}

DEFAULT_PARAMS = {
    "type":                 "direct",
    "interceptor_cooldown": 2.0,
    "decoy_radius":         150.0,
    "decoy_x":              WIDTH * 0.2,
    "decoy_y":              HEIGHT * 0.8,
}

# ── fitness ────────────────────────────────────────────────

def compute_fitness(state: BattleState) -> float:
    """
    Higher = better attack.
    Rewards: objective reached, drones surviving, speed.
    """
    score = 0.0
    total = len(state.drones)
    if total == 0:
        return 0.0

    alive = sum(1 for d in state.drones if d.alive)
    survival_rate = alive / total

    # Objective reached is the primary reward
    if state.objective_reached:
        score += 1.0
        score += survival_rate * 0.5          # bonus for drones surviving
        score += max(0, (30 - state.time_elapsed) / 30) * 0.3  # speed bonus
    else:
        # Partial credit: how close did they get?
        import math
        closest = min(
            math.sqrt((d.x - 400) ** 2 + (d.y - 520) ** 2)
            for d in state.drones if d.alive
        ) if alive > 0 else 800
        proximity_score = max(0, 1 - closest / 800)
        score += proximity_score * 0.4
        score += survival_rate * 0.2

    return round(score, 4)


# ── mutation ───────────────────────────────────────────────

def mutate(strategy: AttackStrategy, llm_suggestion: Optional[dict] = None) -> AttackStrategy:
    """
    Create a mutated child strategy.
    If llm_suggestion provided, apply it instead of random mutation.
    """
    params = strategy.params.copy()
    is_llm = False

    if llm_suggestion:
        # Apply LLM-guided mutation
        param = llm_suggestion.get("param")
        value = llm_suggestion.get("new_value")
        if param and value is not None and param in params:
            coerced = coerce_param_value(param, value)
            if coerced is not None:
                params[param] = coerced
                is_llm = True

    if not is_llm:
        apply_random_mutation(params)

    return AttackStrategy(
        id=str(uuid.uuid4()),
        generation=strategy.generation + 1,
        params=params,
        is_llm_guided=is_llm,
        llm_reasoning=llm_suggestion.get("reasoning") if llm_suggestion else None
    )


def coerce_param_value(param: str, value) -> Optional[str | float]:
    """Validate LLM-supplied mutation values against known bounds."""
    bounds = PARAM_BOUNDS.get(param)
    if bounds is None:
        return None

    if isinstance(bounds, list):
        if value in bounds:
            return value
        return None

    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None

    lo, hi = bounds
    return round(max(lo, min(hi, numeric)), 2)


def apply_random_mutation(params: dict) -> None:
    """Pick one known parameter and mutate it in-place."""
    key = random.choice(list(PARAM_BOUNDS.keys()))
    bounds = PARAM_BOUNDS[key]

    if isinstance(bounds, list):
        # Categorical - pick a different value
        options = [v for v in bounds if v != params.get(key)]
        params[key] = random.choice(options) if options else params[key]
        return

    # Continuous - perturb by +/-20%
    lo, hi = bounds
    current = params.get(key, (lo + hi) / 2)
    delta = (hi - lo) * 0.2
    params[key] = round(
        max(lo, min(hi, current + random.uniform(-delta, delta))), 2
    )


def select(population: list[AttackStrategy]) -> list[AttackStrategy]:
    """Keep top 50% by fitness."""
    ranked = sorted(population, key=lambda s: s.fitness, reverse=True)
    cutoff = max(2, len(ranked) // 2)
    return ranked[:cutoff]


# ── battle runner ──────────────────────────────────────────

def run_battle_sync(strategy: AttackStrategy, n_drones: int = 30) -> tuple[BattleState, float]:
    """Run a complete battle synchronously. Returns final state + fitness."""
    state, _ = make_battle(n_drones=n_drones, strategy_params=strategy.params)
    max_ticks = 1000
    for _ in range(max_ticks):
        if state.terminal:
            break
        state = tick(state, strategy)
    fitness = compute_fitness(state)
    strategy.fitness = fitness
    return state, fitness


# ── generation step ────────────────────────────────────────

def evolve_generation(
    population: list[AttackStrategy],
    llm_suggestion: Optional[dict] = None
) -> tuple[list[AttackStrategy], list[AttackStrategy]]:
    """
    Run one full evolutionary generation.
    Returns (new_population, evaluated_children).
    """
    survivors = select(population)
    children = []

    for parent in survivors:
        # Every 3rd generation use LLM suggestion on the best parent
        use_llm = (llm_suggestion is not None and parent == survivors[0])
        child = mutate(parent, llm_suggestion if use_llm else None)

        # Evaluate child
        _, fitness = run_battle_sync(child)
        child.fitness = fitness
        children.append(child)

    new_population = survivors + children
    new_population.sort(key=lambda s: s.fitness, reverse=True)

    return new_population, children
