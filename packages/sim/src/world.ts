import {
  DEFAULT_WORLD_CONFIG, HERBIVORE, createRng,
  type Rng, type TickSnapshot, type WorldConfig,
} from "@eco/shared";
import { createHerbivore, findSpawnCell, type Agent } from "./agent";
import { tickAgent } from "./agentTick";
import { createBiomass, regrowBiomass, type BiomassField } from "./biomass";
import { generateTerrain, type TerrainData } from "./terrain";

export interface World {
  config: WorldConfig;
  terrain: TerrainData;
  biomass: BiomassField;
  agents: Agent[];
  /** RNG unique de la sim vivante — tout tirage passe par lui (déterminisme). */
  rng: Rng;
  nextAgentId: number;
  simTimeSeconds: number;
  tickCount: number;
}

export function createWorld(overrides: Partial<WorldConfig> = {}): World {
  const config: WorldConfig = { ...DEFAULT_WORLD_CONFIG, ...overrides };
  const terrain = generateTerrain(config);
  const rng = createRng(config.seed + ":world");
  const spawn = findSpawnCell(terrain, config);
  return {
    config,
    terrain,
    biomass: createBiomass(terrain, config, createRng(config.seed + ":biomass")),
    agents: [createHerbivore(1, spawn.x, spawn.z, rng)],
    rng,
    nextAgentId: 2,
    // On démarre en matinée (30 % du jour) pour que la première vue soit éclairée.
    simTimeSeconds: 0.3 * config.dayLengthSeconds,
    tickCount: 0,
  };
}

/** Avance la sim d'exactement un tick (pas fixe — architecture §4). */
export function tickWorld(world: World): void {
  const dt = 1 / world.config.tickRateHz;
  world.simTimeSeconds += dt;
  world.tickCount += 1;
  regrowBiomass(world.biomass, world.terrain, world.config, dt);
  for (const a of world.agents) tickAgent(a, world, dt, world.rng);
  // Despawn des cadavres (rare : la boucle inverse + splice est acceptable ici).
  for (let i = world.agents.length - 1; i >= 0; i--) {
    const a = world.agents[i]!;
    if (a.state === "Dead" && a.deadForSeconds > HERBIVORE.corpseDespawnSeconds) {
      world.agents.splice(i, 1);
    }
  }
}

export function timeOfDay(world: World): number {
  const t = world.simTimeSeconds / world.config.dayLengthSeconds;
  return t - Math.floor(t);
}

export function makeSnapshot(world: World, lastTickDurationMs: number): TickSnapshot {
  return {
    tickCount: world.tickCount,
    simTimeSeconds: world.simTimeSeconds,
    timeOfDay: timeOfDay(world),
    lastTickDurationMs,
    agents: world.agents.map((a) => ({
      id: a.id, x: a.x, z: a.z, heading: a.heading,
      state: a.state, energy: a.energy, hydration: a.hydration,
    })),
  };
}
