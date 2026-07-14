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
  /** Territoire saturé de congénères — bloque la reproduction (carnivores). */
  crowded: boolean;
  /** Clan (carnivores) et position de la tanière — rallient là pour se reproduire. */
  clanId: number;
  denX: number;
  denZ: number;
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
    hasThreat: false, threatX: 0, threatZ: 0, crowded: false,
    clanId: 0, denX: 0, denZ: 0,
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

/**
 * n cellules d'herbe dispersées sur toute l'île (échantillonnage du point le
 * plus éloigné). Répartit les proies partout dès le départ → chaque clan de
 * prédateurs a de quoi chasser, et l'île entière est occupée.
 */
export function findScatteredCells(
  terrain: TerrainData, config: WorldConfig, n: number,
): { x: number; z: number }[] {
  if (n <= 0) return [];
  const grass: number[] = [];
  for (let i = 0; i < terrain.zones.length; i++) {
    if (terrain.zones[i] === ZONE_GRASS) grass.push(i);
  }
  if (grass.length === 0) return [];
  const cx = (i: number) => cellCenterX(config, i);
  const cz = (i: number) => cellCenterZ(config, i);
  // Échantillonnage du point le plus éloigné, en gardant pour chaque cellule sa
  // distance au plus proche point déjà pris (O(n × grass) au lieu de O(n² × grass)).
  const picks = [grass[0]!]; // graine déterministe : première cellule d'herbe
  const nearest = new Float64Array(grass.length);
  for (let g = 0; g < grass.length; g++) {
    const dx = cx(grass[g]!) - cx(picks[0]!), dz = cz(grass[g]!) - cz(picks[0]!);
    nearest[g] = dx * dx + dz * dz;
  }
  while (picks.length < n && picks.length < grass.length) {
    let bestG = -1, bestD = -1;
    for (let g = 0; g < grass.length; g++) {
      if (nearest[g]! > bestD) { bestD = nearest[g]!; bestG = g; }
    }
    if (bestG < 0) break;
    const chosen = grass[bestG]!;
    picks.push(chosen);
    for (let g = 0; g < grass.length; g++) {
      const dx = cx(grass[g]!) - cx(chosen), dz = cz(grass[g]!) - cz(chosen);
      const d2 = dx * dx + dz * dz;
      if (d2 < nearest[g]!) nearest[g] = d2;
    }
  }
  return picks.map((i) => ({ x: cx(i), z: cz(i) }));
}

/**
 * k tanières de carnivores réparties sur les RIVES (herbe au bord de l'eau) :
 * les proies s'y rassemblent (herbe + point d'eau), donc les clans y restent
 * nourris tout en occupant des régions distinctes de l'île. Échantillonnage du
 * point le plus éloigné à partir de la rive la plus au nord — déterministe.
 * (Choix assumé : tanières riveraines plutôt que sommets arides, sinon un clan
 * de montagne meurt de faim faute de proies — cf. docs/tuning-phase4.md.)
 */
export function findCarnivoreDens(
  terrain: TerrainData, config: WorldConfig, k: number,
): { x: number; z: number }[] {
  if (k <= 0) return [];
  // Habitat des tanières : cellules de rive si possible, sinon herbe.
  let cells: number[] = Array.from(terrain.shoreCells);
  if (cells.length === 0) {
    cells = [];
    for (let i = 0; i < terrain.zones.length; i++) {
      if (terrain.zones[i] === ZONE_GRASS) cells.push(i);
    }
  }
  if (cells.length === 0) return [];
  const cx = (i: number) => cellCenterX(config, i);
  const cz = (i: number) => cellCenterZ(config, i);
  // Graine déterministe : la cellule la plus au nord (min z).
  let first = cells[0]!;
  for (const i of cells) if (cz(i) < cz(first)) first = i;
  const picks = [first];
  // Suivantes : la rive la plus loin de toutes les tanières déjà prises.
  while (picks.length < k) {
    let best = -1, bestD = -1;
    for (const i of cells) {
      let md = Infinity;
      for (const p of picks) {
        const dx = cx(i) - cx(p), dz = cz(i) - cz(p);
        md = Math.min(md, dx * dx + dz * dz);
      }
      if (md > bestD) { bestD = md; best = i; }
    }
    if (best < 0) break;
    picks.push(best);
  }
  return picks.map((i) => ({ x: cx(i), z: cz(i) }));
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
