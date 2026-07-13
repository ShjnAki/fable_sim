import type { SimHost, TickSnapshot, WorldConfig } from "@eco/shared";
import { createWorld, makeSnapshot, tickWorld } from "@eco/sim";
import { advanceAccumulator } from "../loop/accumulator";

/** Sim dans le thread principal — le rendu reste spectateur (architecture §2). */
export function createMainThreadHost(overrides: Partial<WorldConfig> = {}): SimHost {
  const world = createWorld(overrides);
  const tickIntervalMs = 1000 / world.config.tickRateHz;
  let accumulatorMs = 0;
  let lastNowMs: number | null = null;
  let speed = 1;
  let prev: TickSnapshot | null = null;
  let latest: TickSnapshot | null = null;

  return {
    update(nowMs: number): void {
      const frameDelta = lastNowMs === null ? 0 : (nowMs - lastNowMs) * speed;
      lastNowMs = nowMs;
      const step = advanceAccumulator(accumulatorMs, frameDelta, tickIntervalMs, 8);
      accumulatorMs = step.accumulatorMs;
      for (let i = 0; i < step.ticksToRun; i++) {
        const t0 = performance.now();
        tickWorld(world);
        prev = latest;
        latest = makeSnapshot(world, performance.now() - t0);
      }
    },
    getConfig: () => world.config,
    getTerrainHeights: () => world.terrain.heights,
    getTerrainZones: () => world.terrain.zones,
    getBiomass: () => world.biomass.values,
    latestSnapshots: () => [prev, latest] as const,
    setSpeed(multiplier: number): void {
      speed = multiplier;
    },
  };
}
