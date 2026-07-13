import type { Rng, WorldConfig } from "@eco/shared";
import { ZONE_GRASS, type TerrainData } from "./terrain";

/** Végétation = champ scalaire 0..1 par cellule, pas des entités (architecture §8). */
export interface BiomassField {
  values: Float32Array;
}

export function createBiomass(terrain: TerrainData, config: WorldConfig, rng: Rng): BiomassField {
  const values = new Float32Array(config.biomassResolution ** 2);
  for (let i = 0; i < values.length; i++) {
    // Départ volontairement bas : la repousse doit être VISIBLE en Phase 1.
    if (terrain.zones[i] === ZONE_GRASS) values[i] = 0.15 + 0.35 * rng();
  }
  return { values };
}

/** Index de la cellule biomasse/zone contenant (x, z) — clampé aux bords. */
export function cellIndexAt(config: WorldConfig, x: number, z: number): number {
  const b = config.biomassResolution;
  const half = config.sizeMeters / 2;
  const ix = Math.min(b - 1, Math.max(0, Math.floor(((x + half) / config.sizeMeters) * b)));
  const iz = Math.min(b - 1, Math.max(0, Math.floor(((z + half) / config.sizeMeters) * b)));
  return iz * b + ix;
}

export function cellCenterX(config: WorldConfig, i: number): number {
  const b = config.biomassResolution;
  return ((i % b) + 0.5) * (config.sizeMeters / b) - config.sizeMeters / 2;
}

export function cellCenterZ(config: WorldConfig, i: number): number {
  const b = config.biomassResolution;
  return (Math.floor(i / b) + 0.5) * (config.sizeMeters / b) - config.sizeMeters / 2;
}

/**
 * Repousse logistique : db/dt = r·b·(1−b). C'est l'« amortisseur » clé de
 * l'équilibre futur (Phase 4) : repousse rapide à mi-charge, lente près de 0 et 1.
 * L'init à ≥ 0.15 garantit b>0 (la logistique ne redémarre pas de zéro).
 */
export function regrowBiomass(
  field: BiomassField, terrain: TerrainData, config: WorldConfig, dtSeconds: number,
): void {
  const r = config.biomassRegrowthRate;
  const v = field.values;
  for (let i = 0; i < v.length; i++) {
    if (terrain.zones[i] !== ZONE_GRASS) continue;
    const b = v[i]!;
    v[i] = Math.min(1, b + r * b * (1 - b) * dtSeconds);
  }
}
