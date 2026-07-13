import type { AgentState, Rng, Transition, WorldConfig } from "@eco/shared";
import { cellCenterX, cellCenterZ } from "./biomass";
import { ZONE_GRASS, type TerrainData } from "./terrain";

/**
 * Un agent = un objet lisible (architecture §5). Champs plats (pas de Vector
 * imbriqué) : sérialisation et inspection triviales, zéro indirection.
 */
export interface Agent {
  id: number;
  species: "herbivore";
  x: number; z: number;
  vx: number; vz: number;
  heading: number;          // radians, 0 = +Z (convention rotationY de Three)
  energy: number;           // 0..1
  hydration: number;        // 0..1
  ageSeconds: number;
  state: AgentState;
  deadForSeconds: number;   // pour le despawn du cadavre
  wanderAngle: number;
  hasTarget: boolean; targetX: number; targetZ: number;
  memory: {
    hasWater: boolean; waterX: number; waterZ: number;
    hasFood: boolean; foodX: number; foodZ: number;
  };
  transitions: Transition[]; // ring buffer (16 max) pour l'inspecteur
}

export function createHerbivore(id: number, x: number, z: number, rng: Rng): Agent {
  return {
    id, species: "herbivore", x, z, vx: 0, vz: 0, heading: 0,
    energy: 0.8, hydration: 0.8, ageSeconds: 0,
    state: "Wander", deadForSeconds: 0,
    wanderAngle: rng() * Math.PI * 2,
    hasTarget: false, targetX: 0, targetZ: 0,
    memory: { hasWater: false, waterX: 0, waterZ: 0, hasFood: false, foodX: 0, foodZ: 0 },
    transitions: [],
  };
}

/** Cellule d'herbe la plus proche du centre de l'île — point de spawn stable. */
export function findSpawnCell(terrain: TerrainData, config: WorldConfig): { x: number; z: number } {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < terrain.zones.length; i++) {
    if (terrain.zones[i] !== ZONE_GRASS) continue;
    const x = cellCenterX(config, i), z = cellCenterZ(config, i);
    const d = x * x + z * z;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { x: cellCenterX(config, best), z: cellCenterZ(config, best) };
}
