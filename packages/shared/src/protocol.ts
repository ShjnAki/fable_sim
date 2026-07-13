import type { WorldConfig } from "./config";

/** État émis par la sim à chaque tick. Seul canal sim → rendu (architecture §2). */
export interface TickSnapshot {
  tickCount: number;
  simTimeSeconds: number;
  /** 0..1 : 0 = minuit, 0.25 = aube, 0.5 = midi, 0.75 = crépuscule. */
  timeOfDay: number;
  lastTickDurationMs: number;
}

/**
 * Frontière unique entre le rendu et la sim. Implémentations prévues :
 * main-thread (Phase 1-2), Web Worker (Phase 3), WebSocket distant (Phase 6).
 * NOTE : les getters statiques deviendront asynchrones en mode worker — assumé.
 */
export interface SimHost {
  update(nowMs: number): void;
  getConfig(): WorldConfig;
  getTerrainHeights(): Float32Array;
  getTerrainZones(): Uint8Array;
  getBiomass(): Float32Array;
  latestSnapshots(): readonly [TickSnapshot | null, TickSnapshot | null];
  setSpeed(multiplier: number): void;
}
