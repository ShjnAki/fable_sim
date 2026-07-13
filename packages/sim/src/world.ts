import {
  DEFAULT_WORLD_CONFIG, createRng, type TickSnapshot, type WorldConfig,
} from "@eco/shared";
import { createBiomass, regrowBiomass, type BiomassField } from "./biomass";
import { generateTerrain, type TerrainData } from "./terrain";

export interface World {
  config: WorldConfig;
  terrain: TerrainData;
  biomass: BiomassField;
  simTimeSeconds: number;
  tickCount: number;
}

export function createWorld(overrides: Partial<WorldConfig> = {}): World {
  const config: WorldConfig = { ...DEFAULT_WORLD_CONFIG, ...overrides };
  const terrain = generateTerrain(config);
  return {
    config,
    terrain,
    biomass: createBiomass(terrain, config, createRng(config.seed + ":biomass")),
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
  };
}
