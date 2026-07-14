import {
  CARNIVORE, HERBIVORE,
  type AgentState, type Rng, type SpeciesParams, type Transition, type WorldConfig,
} from "@eco/shared";
import { cellCenterX, cellCenterZ } from "./biomass";
import { ZONE_GRASS, type TerrainData } from "./terrain";

/**
 * Un agent = un objet lisible (architecture §5). Champs plats (pas de Vector
 * imbriqué) : sérialisation et inspection triviales, zéro indirection.
 */
export interface Agent {
  id: number;
  species: "herbivore" | "carnivore";
  x: number; z: number;
  vx: number; vz: number;
  heading: number;          // radians, 0 = +Z (convention rotationY de Three)
  energy: number;           // 0..1
  hydration: number;        // 0..1
  ageSeconds: number;
  state: AgentState;
  deadForSeconds: number;   // pour le despawn du cadavre
  /** Espérance de vie individuelle (moyenne ± variance, tirée au spawn). */
  maxAgeSeconds: number;
  /** Âge avant lequel pas de reproduction (cooldown après naissance, retry sinon). */
  nextMateAgeSeconds: number;
  /** 0..1 — vidée par le sprint de chasse, rechargée hors Hunt (carnivores). */
  stamina: number;
  /** Âge avant lequel pas de chasse (digestion après kill, retry après abandon). */
  nextHuntAgeSeconds: number;
  /** Menace perçue — écrite par tickAgent AVANT decide (decide reste pure). */
  hasThreat: boolean;
  threatX: number;
  threatZ: number;
  wanderAngle: number;
  hasTarget: boolean; targetX: number; targetZ: number;
  memory: {
    hasWater: boolean; waterX: number; waterZ: number;
    hasFood: boolean; foodX: number; foodZ: number;
  };
  transitions: Transition[]; // ring buffer (16 max) pour l'inspecteur
}

function createAgent(
  species: "herbivore" | "carnivore", p: SpeciesParams,
  id: number, x: number, z: number, rng: Rng,
): Agent {
  return {
    id, species, x, z, vx: 0, vz: 0, heading: 0,
    energy: 0.8, hydration: 0.8, ageSeconds: 0,
    state: "Wander", deadForSeconds: 0,
    // ORDRE DES TIRAGES FIGÉ (déterminisme) : wanderAngle PUIS maxAge.
    wanderAngle: rng() * Math.PI * 2,
    maxAgeSeconds: p.maxAgeSeconds + (rng() * 2 - 1) * p.maxAgeVarianceSeconds,
    nextMateAgeSeconds: 0,
    stamina: 1, nextHuntAgeSeconds: 0,
    hasThreat: false, threatX: 0, threatZ: 0,
    hasTarget: false, targetX: 0, targetZ: 0,
    memory: { hasWater: false, waterX: 0, waterZ: 0, hasFood: false, foodX: 0, foodZ: 0 },
    transitions: [],
  };
}

export function createHerbivore(id: number, x: number, z: number, rng: Rng): Agent {
  return createAgent("herbivore", HERBIVORE, id, x, z, rng);
}

export function createCarnivore(id: number, x: number, z: number, rng: Rng): Agent {
  return createAgent("carnivore", CARNIVORE, id, x, z, rng);
}

export function paramsOf(a: Agent): SpeciesParams {
  return a.species === "herbivore" ? HERBIVORE : CARNIVORE;
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

/**
 * n cellules d'herbe proches du centre, espacées d'au moins une cellule
 * (greedy sur tri par distance) ; complète sans contrainte d'espacement si
 * l'île est trop petite pour n cellules espacées.
 */
export function findSpawnCells(
  terrain: TerrainData, config: WorldConfig, n: number,
): { x: number; z: number }[] {
  const b = config.biomassResolution;
  const grass: number[] = [];
  for (let i = 0; i < terrain.zones.length; i++) {
    if (terrain.zones[i] === ZONE_GRASS) grass.push(i);
  }
  grass.sort((i, j) => {
    const di = cellCenterX(config, i) ** 2 + cellCenterZ(config, i) ** 2;
    const dj = cellCenterX(config, j) ** 2 + cellCenterZ(config, j) ** 2;
    return di - dj;
  });
  const picked: number[] = [];
  const taken = new Set<number>();
  for (const i of grass) {
    if (picked.length >= n) break;
    const ix = i % b, iz = Math.floor(i / b);
    let spaced = true;
    for (const p of picked) {
      if (Math.abs((p % b) - ix) < 2 && Math.abs(Math.floor(p / b) - iz) < 2) {
        spaced = false;
        break;
      }
    }
    if (spaced) { picked.push(i); taken.add(i); }
  }
  for (const i of grass) { // complément si pas assez de cellules espacées
    if (picked.length >= n) break;
    if (!taken.has(i)) { picked.push(i); taken.add(i); }
  }
  return picked.map((i) => ({ x: cellCenterX(config, i), z: cellCenterZ(config, i) }));
}
