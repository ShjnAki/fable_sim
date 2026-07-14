import {
  CARNIVORE, DEFAULT_WORLD_CONFIG, HERBIVORE, HUMAN, createRng,
  type Rng, type TickSnapshot, type WorldConfig,
} from "@eco/shared";
import {
  createCarnivore, createHerbivore, createHuman,
  findCarnivoreDens, findScatteredCells, paramsOf, type Agent,
} from "./agent";
import { tickAgent } from "./agentTick";
import { cellIndexAt, createBiomass, regrowBiomass, type BiomassField } from "./biomass";
import { createSpatialGrid, rebuildGrid, type SpatialGrid } from "./spatialGrid";
import { ZONE_GRASS, generateTerrain, type TerrainData } from "./terrain";

export interface World {
  config: WorldConfig;
  terrain: TerrainData;
  biomass: BiomassField;
  agents: Agent[];
  /** Grille de voisinage, reconstruite à chaque tick (architecture §6). */
  grid: SpatialGrid;
  /** Compteurs cumulés de morts par cause — diagnostic de tuning (Phase 4). */
  deaths: Record<string, number>;
  /** Effectifs vivants du tick, par espèce (recalculés à chaque tick). */
  herbivoreCount: number;
  carnivoreCount: number;
  /** true pendant la nuit (fenêtre nightStart..nightEnd), recalculé par tick. */
  isNight: boolean;
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
  const agents: Agent[] = [];
  let nextId = 1;

  // Herbivores : dispersés sur toute l'île → chaque clan de prédateurs a des
  // proies à proximité dès le départ, et l'île entière est peuplée.
  for (const s of findScatteredCells(terrain, config, config.initialHerbivores)) {
    const a = createHerbivore(nextId++, s.x, s.z, rng);
    a.ageSeconds = HERBIVORE.adultAgeSeconds;
    a.nextMateAgeSeconds = a.ageSeconds + rng() * HERBIVORE.mateCooldownSeconds;
    agents.push(a);
  }

  // Carnivores : répartis en clans autour de tanières distinctes (montagne,
  // plage, terre…). Ils se rallient à leur tanière pour se reproduire, mais
  // rayonnent en battue vers les proies.
  const dens = findCarnivoreDens(terrain, config, Math.max(1, config.carnivoreClans));
  for (let c = 0; c < config.initialCarnivores; c++) {
    const clan = c % dens.length;
    const den = dens[clan]!;
    // Placement SUR TERRE près de la tanière : un décalage aveugle projetait
    // les loups dans l'eau (tanières riveraines) — figés et morts de soif.
    let sx = den.x, sz = den.z;
    for (let attempt = 0; attempt < 24; attempt++) {
      const cx = den.x + (rng() - 0.5) * 24;
      const cz = den.z + (rng() - 0.5) * 24;
      if (terrain.zones[cellIndexAt(config, cx, cz)] === ZONE_GRASS) { sx = cx; sz = cz; break; }
    }
    const a = createCarnivore(nextId++, sx, sz, rng);
    a.clanId = clan; a.denX = den.x; a.denZ = den.z;
    a.ageSeconds = CARNIVORE.adultAgeSeconds;
    a.nextMateAgeSeconds = a.ageSeconds + rng() * CARNIVORE.mateCooldownSeconds;
    a.nextHuntAgeSeconds = a.ageSeconds + rng() * 20;
    agents.push(a);
  }

  // Humains : dispersés (0 par défaut → ils n'apparaissent qu'au spawn manuel).
  for (const s of findScatteredCells(terrain, config, config.initialHumans)) {
    const a = createHuman(nextId++, s.x, s.z, rng);
    a.ageSeconds = HUMAN.adultAgeSeconds;
    agents.push(a);
  }
  return {
    config,
    terrain,
    biomass: createBiomass(terrain, config, createRng(config.seed + ":biomass")),
    agents,
    grid: createSpatialGrid(config),
    deaths: {},
    herbivoreCount: config.initialHerbivores,
    carnivoreCount: config.initialCarnivores,
    isNight: false,
    rng,
    nextAgentId: config.initialHerbivores + config.initialCarnivores + config.initialHumans + 1,
    // On démarre en matinée (30 % du jour) pour que la première vue soit éclairée.
    simTimeSeconds: 0.3 * config.dayLengthSeconds,
    tickCount: 0,
  };
}

/**
 * Ajoute un agent au monde (perturbation Phase 5). Place sur terre : si (x,z)
 * tombe dans l'eau, cherche la cellule d'herbe la plus proche. Un carnivore
 * reçoit une tanière sur place (il n'appartient à aucun clan).
 */
export function spawnAgentAt(
  world: World, species: "herbivore" | "carnivore" | "human", x: number, z: number,
): Agent {
  const { config, terrain } = world;
  let sx = x, sz = z;
  if (terrain.zones[cellIndexAt(config, x, z)] !== ZONE_GRASS) {
    // Cellule cliquée non praticable : glisser vers l'herbe la plus proche.
    const b = config.biomassResolution;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < terrain.zones.length; i++) {
      if (terrain.zones[i] !== ZONE_GRASS) continue;
      const cx = ((i % b) + 0.5) * (config.sizeMeters / b) - config.sizeMeters / 2;
      const cz = (Math.floor(i / b) + 0.5) * (config.sizeMeters / b) - config.sizeMeters / 2;
      const d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < bestD) { bestD = d; best = i; sx = cx; sz = cz; }
    }
    if (best < 0) { sx = 0; sz = 0; }
  }
  const id = world.nextAgentId++;
  const a = species === "herbivore" ? createHerbivore(id, sx, sz, world.rng)
    : species === "carnivore" ? createCarnivore(id, sx, sz, world.rng)
      : createHuman(id, sx, sz, world.rng);
  if (species === "carnivore") { a.denX = sx; a.denZ = sz; }
  a.ageSeconds = paramsOf(a).adultAgeSeconds; // spawné adulte
  world.agents.push(a);
  return a;
}

/** Avance la sim d'exactement un tick (pas fixe — architecture §4). */
export function tickWorld(world: World): void {
  const dt = 1 / world.config.tickRateHz;
  world.simTimeSeconds += dt;
  world.tickCount += 1;
  regrowBiomass(world.biomass, world.terrain, world.config, dt);
  // Effectifs vivants : servent au refuge démographique (une espèce devenue
  // rare se reproduit plus facilement — sans quoi le creux du cycle
  // proie/prédateur touche l'extinction, cf. docs/tuning-phase4.md).
  let herb = 0, carn = 0;
  for (const a of world.agents) {
    if (a.state === "Dead") continue;
    if (a.species === "herbivore") herb++;
    else carn++;
  }
  world.herbivoreCount = herb;
  world.carnivoreCount = carn;
  // Nuit : conditionne le sommeil groupé des herbivores (chasse nocturne).
  const tod = timeOfDay(world);
  world.isNight = tod > world.config.nightStart || tod < world.config.nightEnd;
  rebuildGrid(world.grid, world.agents);
  const aliveCount = world.agents.length; // les nouveau-nés du tick attendront le suivant
  for (let i = 0; i < aliveCount; i++) {
    tickAgent(world.agents[i]!, world, dt, world.rng);
  }
  // Despawn des cadavres (rare : la boucle inverse + splice est acceptable ici).
  for (let i = world.agents.length - 1; i >= 0; i--) {
    const a = world.agents[i]!;
    if (a.state === "Dead" && a.deadForSeconds > paramsOf(a).corpseDespawnSeconds) {
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
      id: a.id, species: a.species, x: a.x, z: a.z, heading: a.heading,
      state: a.state, energy: a.energy, hydration: a.hydration,
      adult: a.ageSeconds >= HERBIVORE.adultAgeSeconds,
    })),
  };
}
