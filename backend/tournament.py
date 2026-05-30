import asyncio
import uuid
from typing import Callable, Optional
from evolution import (
    evolve_generation,
    run_battle_sync,
    DEFAULT_PARAMS,
)
from swarm import AttackStrategy

MAX_GENERATIONS = 100

# ── tournament state ───────────────────────────────────────

class Tournament:
    def __init__(self):
        self.running = False
        self.paused = False
        self.generation = 0
        self.population: list[AttackStrategy] = []
        self.history: list[dict] = []          # generation records for UI
        self.best: Optional[AttackStrategy] = None
        self.on_generation: Optional[Callable] = None  # callback → broadcast to WS

    def initialize(self, pool_size: int = 6):
        """Seed initial population with varied strategies."""
        import random
        from evolution import PARAM_BOUNDS, DEFAULT_PARAMS

        self.population = []
        for i in range(pool_size):
            params = DEFAULT_PARAMS.copy()
            # Randomize each strategy slightly
            params["type"] = random.choice(PARAM_BOUNDS["type"])
            params["interceptor_cooldown"] = round(random.uniform(0.5, 5.0), 2)
            params["decoy_radius"] = round(random.uniform(50, 250), 1)
            strategy = AttackStrategy(
                id=str(uuid.uuid4()),
                generation=0,
                params=params
            )
            # Evaluate initial fitness
            _, fitness = run_battle_sync(strategy)
            strategy.fitness = fitness
            self.population.append(strategy)

        self.population.sort(key=lambda s: s.fitness, reverse=True)
        self.best = self.population[0]

    async def run(self, llm_callback: Optional[Callable] = None):
        """Main tournament loop — runs forever until stopped."""
        self.running = True
        self.initialize()

        while self.running and self.generation < MAX_GENERATIONS:
            # If paused, sleep and do not advance generations
            while self.paused and self.running:
                await asyncio.sleep(1)

            self.generation += 1

            if self.generation % 10 == 0:
                self._increase_defense_difficulty()

            # Every 3rd generation: ask LLM for mutation suggestion
            llm_suggestion = None
            if self.generation % 3 == 0 and llm_callback:
                try:
                    best = self.population[0]
                    llm_suggestion = await llm_callback(best)
                except Exception as e:
                    print(f"LLM suggestion failed: {e}")

            # Run one generation (sync — runs battles)
            loop = asyncio.get_event_loop()
            new_pop, children = await loop.run_in_executor(
                None,
                evolve_generation,
                self.population,
                llm_suggestion
            )

            self.population = new_pop
            self.best = new_pop[0]

            # Build generation record for UI
            best_child = max(children, key=lambda c: c.fitness)
            record = {
                "number":    self.generation,
                "fitness":   best_child.fitness,
                "mutation":  best_child.params.get("type", "unknown"),
                "isLLM":     best_child.is_llm_guided,
                "reasoning": best_child.llm_reasoning or "",
                "params":    best_child.params,
            }
            self.history.append(record)

            # Broadcast to connected clients
            if self.on_generation:
                await self.on_generation(record)

            # Pause between generations so the sim stays watchable.
            # Check the pause flag frequently so the UI pause control feels immediate.
            for _ in range(20):
                if not self.running or self.paused:
                    break
                await asyncio.sleep(0.25)

        # Tournament finished (stopped or reached max generations)
        self.running = False
        if self.on_generation:
            # send a final completion record so clients can react
            await self.on_generation({"type": "complete", "generation": self.generation})

    def _increase_defense_difficulty(self):
        """Make defense harder as attacks improve."""
        # Increase interceptor speed and jammer radius in future battles
        # by modifying make_battle defaults via a global config
        import swarm
        swarm.COMMS_RANGE = max(60, swarm.COMMS_RANGE - 5)      # shrink comms range
        swarm.MAX_SPEED = min(5.0, swarm.MAX_SPEED + 0.1)        # speed up defense

    def stop(self):
        self.running = False

    def reset_state(self):
        self.running = False
        self.paused = False
        self.generation = 0
        self.population = []
        self.history = []
        self.best = None

    def get_status(self) -> dict:
        return {
            "generation":  self.generation,
            "running":     self.running,
            "best_fitness": self.best.fitness if self.best else 0,
            "population_size": len(self.population),
            "history":     self.history[-20:],   # last 20 for UI
        }


# Global tournament instance
tournament = Tournament()
