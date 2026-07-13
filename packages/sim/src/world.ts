import {
  DEFAULT_WORLD_CONFIG, HERBIVORE, createRng,
  type Rng, type TickSnapshot, type WorldConfig,
} from "@eco/shared";
import { createHerbivore, findSpawnCells, type Agent } from "./agent";
import { tickAgent } from "./agentTick";
import { createBiomass, regrowBiomass, type BiomassField } from "./biomass";
import { createSpatialGrid, rebuildGrid, type SpatialGrid } from "./spatialGrid";
import { generateTerrain, type TerrainData } from "./terrain";

export interface World {
  config: WorldConfig;
  terrain: TerrainData;
  biomass: BiomassField;
  agents: Agent[];
  /** Grille de voisinage, reconstruite à chaque tick (architecture §6). */
  grid: SpatialGrid;
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
  const spawns = findSpawnCells(terrain, config, config.initialHerbivores);
  const agents = spawns.map((s, k) => {
    const a = createHerbivore(k + 1, s.x, s.z, rng);
    // Les fondateurs sont adultes, avec un premier essai de reproduction étalé
    // dans le temps (évite un baby-boom synchronisé au tick 1).
    a.ageSeconds = HERBIVORE.adultAgeSeconds;
    a.nextMateAgeSeconds = a.ageSeconds + rng() * HERBIVORE.mateCooldownSeconds;
    return a;
  });
  return {
    config,
    terrain,
    biomass: createBiomass(terrain, config, createRng(config.seed + ":biomass")),
    agents,
    grid: createSpatialGrid(config),
    rng,
    nextAgentId: config.initialHerbivores + 1,
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
  rebuildGrid(world.grid, world.agents);
  const aliveCount = world.agents.length; // les nouveau-nés du tick attendront le suivant
  for (let i = 0; i < aliveCount; i++) {
    tickAgent(world.agents[i]!, world, dt, world.rng);
  }
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
      adult: a.ageSeconds >= HERBIVORE.adultAgeSeconds,
    })),
  };
}
