import {
  CARNIVORE, HERBIVORE,
  type AgentState, type CarnivoreParams, type HerbivoreParams, type Rng,
} from "@eco/shared";
import { createCarnivore, createHerbivore, paramsOf, type Agent } from "./agent";
import { cellCenterX, cellCenterZ, cellIndexAt } from "./biomass";
import { accumulateBoids } from "./boids";
import { decideCarnivore, decideHerbivore, isMateEligible } from "./decide";
import { forEachNeighbor } from "./spatialGrid";
import { arrive, seek, wander, type SteerOut } from "./steering";
import { ZONE_GRASS, sampleHeight } from "./terrain";
import type { World } from "./world";

const steer: SteerOut = { ax: 0, az: 0 }; // scratch module — zéro alloc par tick

/** Mort d'un agent : transition + compteur de cause (diagnostic de tuning). */
function kill(world: World, a: Agent, cause: string): void {
  a.vx = a.vz = 0;
  const key = `${a.species}:${cause}`;
  world.deaths[key] = (world.deaths[key] ?? 0) + 1;
  applyTransition(a, "Dead", cause, world.tickCount);
}

export function applyTransition(a: Agent, to: AgentState, cause: string, tick: number): void {
  a.transitions.push({ tick, from: a.state, to, cause });
  if (a.transitions.length > 16) a.transitions.shift();
  a.state = to;
  a.hasTarget = false;
}

/** Rive la plus proche dans le rayon de perception ; mémorise si trouvée. */
function findNearestShore(world: World, a: Agent, maxDist: number): boolean {
  const { terrain, config } = world;
  let best = -1, bestD = maxDist * maxDist;
  for (let s = 0; s < terrain.shoreCells.length; s++) {
    const i = terrain.shoreCells[s]!;
    const dx = cellCenterX(config, i) - a.x, dz = cellCenterZ(config, i) - a.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best < 0) return false;
  a.targetX = cellCenterX(config, best); a.targetZ = cellCenterZ(config, best);
  a.hasTarget = true;
  a.memory.hasWater = true; a.memory.waterX = a.targetX; a.memory.waterZ = a.targetZ;
  return true;
}

/** Cellule mangeable la plus proche dans la perception ; mémorise si trouvée. */
function findNearestFood(world: World, a: Agent, p: HerbivoreParams): boolean {
  const { config, terrain, biomass } = world;
  const b = config.biomassResolution;
  const cell = config.sizeMeters / b;
  const half = config.sizeMeters / 2;
  const r = Math.ceil(p.perceptionRadius / cell);
  const cx = Math.min(b - 1, Math.max(0, Math.floor((a.x + half) / cell)));
  const cz = Math.min(b - 1, Math.max(0, Math.floor((a.z + half) / cell)));
  let best = -1, bestD = Infinity;
  for (let iz = Math.max(0, cz - r); iz <= Math.min(b - 1, cz + r); iz++) {
    for (let ix = Math.max(0, cx - r); ix <= Math.min(b - 1, cx + r); ix++) {
      const i = iz * b + ix;
      if (terrain.zones[i] !== ZONE_GRASS || biomass.values[i]! < p.minFoodBiomass) continue;
      const dx = cellCenterX(config, i) - a.x, dz = cellCenterZ(config, i) - a.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  if (best < 0) return false;
  a.targetX = cellCenterX(config, best); a.targetZ = cellCenterZ(config, best);
  a.hasTarget = true;
  a.memory.hasFood = true; a.memory.foodX = a.targetX; a.memory.foodZ = a.targetZ;
  return true;
}

// Recherche du partenaire éligible le plus proche — état module, zéro alloc.
let mateSeeker: Agent;
let mateBest: Agent | null = null;
let mateBestD2 = 0;
function considerMate(n: Agent): void {
  if (n.id === mateSeeker.id || n.species !== mateSeeker.species
      || !isMateEligible(n, paramsOf(n))) return;
  const dx = n.x - mateSeeker.x, dz = n.z - mateSeeker.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < mateBestD2) { mateBestD2 = d2; mateBest = n; }
}
function findNearestMate(world: World, a: Agent): Agent | null {
  mateSeeker = a;
  mateBest = null;
  const r = paramsOf(a).perceptionRadius;
  mateBestD2 = r * r;
  forEachNeighbor(world.grid, a.x, a.z, r, considerMate);
  return mateBest;
}

// Comptage de congénères dans le territoire (carnivores) — état module.
let crowdSeeker: Agent;
let crowdCount = 0;
function countKin(n: Agent): void {
  if (n.id !== crowdSeeker.id && n.species === crowdSeeker.species) crowdCount++;
}
/** true si trop de congénères dans territoryRadius — cap la densité prédatrice. */
function isCrowded(world: World, a: Agent, p: CarnivoreParams): boolean {
  crowdSeeker = a; crowdCount = 0;
  forEachNeighbor(world.grid, a.x, a.z, p.territoryRadius, countKin);
  return crowdCount > p.territoryMax;
}

// Recherche de proie (carnivores) — état module, zéro alloc.
let preySeeker: Agent;
let preyBest: Agent | null = null;
let preyBestD2 = 0;
function considerPrey(n: Agent): void {
  if (n.species !== "herbivore") return;
  const dx = n.x - preySeeker.x, dz = n.z - preySeeker.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < preyBestD2) { preyBestD2 = d2; preyBest = n; }
}
function findNearestPrey(world: World, a: Agent): Agent | null {
  preySeeker = a; preyBest = null;
  // Engagement à courte portée : sprinter une proie lointaine épuise pour rien.
  const r = CARNIVORE.huntCommitRadius;
  preyBestD2 = r * r;
  forEachNeighbor(world.grid, a.x, a.z, r, considerPrey);
  return preyBest;
}

/**
 * Cadavre non consommé le plus proche dans scavengeRadius. Scan linéaire (pas
 * la grille : elle exclut les morts) — n'est appelé que par un carnivore
 * affamé sans proie, cas rare, coût négligeable.
 */
function findNearestCorpse(world: World, a: Agent): Agent | null {
  let best: Agent | null = null;
  let bestD2 = CARNIVORE.scavengeRadius ** 2;
  for (const n of world.agents) {
    if (n.state !== "Dead" || !Number.isFinite(n.deadForSeconds)) continue;
    const dx = n.x - a.x, dz = n.z - a.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = n; }
  }
  return best;
}

// Comptage des congénères d'une proie (refuge du troupeau) — état module.
let refugeOf: Agent;
let refugeCount = 0;
function countHerd(n: Agent): void {
  if (n.id !== refugeOf.id && n.species === "herbivore" && n.state !== "Dead") refugeCount++;
}
/** Probabilité qu'une proie échappe à la morsure grâce à son troupeau (confusion). */
function herdEscapeChance(world: World, prey: Agent, p: CarnivoreParams): number {
  refugeOf = prey; refugeCount = 0;
  forEachNeighbor(world.grid, prey.x, prey.z, p.preyRefugeRadius, countHerd);
  return Math.min(p.preyRefugeMaxChance, refugeCount * p.preyRefugePerNeighbor);
}

// Perception de menace (herbivores) — état module, zéro alloc.
let threatSeeker: Agent;
let threatBest: Agent | null = null;
let threatBestD2 = 0;
function considerThreat(n: Agent): void {
  if (n.species !== "carnivore") return;
  const dx = n.x - threatSeeker.x, dz = n.z - threatSeeker.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < threatBestD2) { threatBestD2 = d2; threatBest = n; }
}
/** Écrit hasThreat/threatX/threatZ. Hystérésis : rayon élargi si on fuit déjà. */
function perceiveThreat(world: World, a: Agent, p: HerbivoreParams): void {
  const r = a.hasThreat ? p.fleeSafeRadius : p.fleeTriggerRadius;
  threatSeeker = a; threatBest = null; threatBestD2 = r * r;
  forEachNeighbor(world.grid, a.x, a.z, r, considerThreat);
  if (threatBest !== null) {
    a.hasThreat = true;
    a.threatX = (threatBest as Agent).x;
    a.threatZ = (threatBest as Agent).z;
  } else {
    a.hasThreat = false;
  }
}

/** Naissance : le parent au plus petit id l'exécute — jamais deux fois. */
function birth(world: World, a: Agent, mate: Agent): void {
  const p = paramsOf(a);
  const make = a.species === "herbivore" ? createHerbivore : createCarnivore;
  const child = make(
    world.nextAgentId++,
    (a.x + mate.x) / 2 + (world.rng() - 0.5) * 2,
    (a.z + mate.z) / 2 + (world.rng() - 0.5) * 2,
    world.rng,
  );
  world.agents.push(child);
  a.energy = Math.max(0.05, a.energy - p.mateEnergyCost);
  mate.energy = Math.max(0.05, mate.energy - p.mateEnergyCost);
  a.nextMateAgeSeconds = a.ageSeconds + p.mateCooldownSeconds;
  mate.nextMateAgeSeconds = mate.ageSeconds + p.mateCooldownSeconds;
  applyTransition(a, "Wander", "naissance", world.tickCount);
  if (mate.state === "SeekMate") applyTransition(mate, "Wander", "naissance", world.tickCount);
}

export function tickAgent(a: Agent, world: World, dt: number, rng: Rng): void {
  const p = paramsOf(a);
  if (a.state === "Dead") { a.deadForSeconds += dt; return; }

  a.ageSeconds += dt;
  if (a.ageSeconds >= a.maxAgeSeconds) {
    kill(world, a, "vieillesse");
    return;
  }
  a.energy -= p.energyDecayPerSec * dt;
  a.hydration -= p.hydrationDecayPerSec * dt;
  if (a.hydration <= 0) {
    a.hydration = 0;
    kill(world, a, "mort de soif");
    return;
  }
  if (a.energy <= 0) {
    a.energy = 0;
    kill(world, a, "mort de faim");
    return;
  }

  // Perception (écrit sur l'agent) PUIS décision pure (architecture §7).
  let d = null;
  if (a.species === "herbivore") {
    perceiveThreat(world, a, HERBIVORE);
    d = decideHerbivore(a, HERBIVORE);
  } else {
    if (a.state !== "Hunt") {
      a.stamina = Math.min(1, a.stamina + CARNIVORE.staminaRegenPerSec * dt);
    }
    a.crowded = isCrowded(world, a, CARNIVORE);
    d = decideCarnivore(a, CARNIVORE);
  }
  if (d) applyTransition(a, d.state, d.cause, world.tickCount);

  steer.ax = 0; steer.az = 0;
  let moving = true;
  let boidsMode: 0 | 1 | 2 = 0; // 0 aucun, 1 séparation seule, 2 troupeau complet
  let speedCap = p.maxSpeed;

  switch (a.state) {
    case "Wander":
      wander(a, rng, p.maxSpeed, p.maxForce, steer);
      boidsMode = 2;
      break;
    case "SeekWater": {
      boidsMode = 1;
      if (!a.hasTarget && !findNearestShore(world, a, p.perceptionRadius) && a.memory.hasWater) {
        a.targetX = a.memory.waterX; a.targetZ = a.memory.waterZ; a.hasTarget = true;
      }
      if (a.hasTarget) {
        arrive(a, a.targetX, a.targetZ, 6, p.maxSpeed, p.maxForce, steer);
        const dx = a.targetX - a.x, dz = a.targetZ - a.z;
        if (dx * dx + dz * dz < 4) applyTransition(a, "Drink", "arrivé à l'eau", world.tickCount);
      } else {
        wander(a, rng, p.maxSpeed, p.maxForce, steer); // explore : aucune eau connue
      }
      break;
    }
    case "Drink":
      a.hydration = Math.min(1, a.hydration + p.drinkPerSec * dt);
      a.vx = a.vz = 0; moving = false;
      break;
    case "SeekFood": {
      boidsMode = 1;
      if (!a.hasTarget && !findNearestFood(world, a, HERBIVORE) && a.memory.hasFood) {
        a.targetX = a.memory.foodX; a.targetZ = a.memory.foodZ; a.hasTarget = true;
      }
      if (a.hasTarget) {
        arrive(a, a.targetX, a.targetZ, 4, p.maxSpeed, p.maxForce, steer);
        const dx = a.targetX - a.x, dz = a.targetZ - a.z;
        if (dx * dx + dz * dz < 2.25) applyTransition(a, "Eat", "arrivé sur l'herbe", world.tickCount);
      } else {
        wander(a, rng, p.maxSpeed, p.maxForce, steer);
      }
      break;
    }
    case "SeekMate": {
      const mate = findNearestMate(world, a);
      if (!mate) {
        a.nextMateAgeSeconds = a.ageSeconds + p.mateRetrySeconds;
        applyTransition(a, "Wander", "aucun partenaire", world.tickCount);
        wander(a, rng, p.maxSpeed, p.maxForce, steer);
        boidsMode = 2;
        break;
      }
      arrive(a, mate.x, mate.z, 4, p.maxSpeed, p.maxForce, steer);
      const dx = mate.x - a.x, dz = mate.z - a.z;
      const d2 = dx * dx + dz * dz;
      // À < 4 m du partenaire, la cour prime sur la séparation (écart spec
      // assumé : sinon la séparation interdit le contact à < 2 m).
      boidsMode = d2 > 16 ? 1 : 0;
      if (d2 < 4 && a.id < mate.id) birth(world, a, mate);
      break;
    }
    case "Hunt": {
      const pc = CARNIVORE;
      const prey = findNearestPrey(world, a);
      if (!prey) {
        // Aucune proie à portée : se rabattre sur une charogne (plancher d'énergie).
        const corpse = findNearestCorpse(world, a);
        if (corpse) {
          applyTransition(a, "Scavenge", "charogne repérée", world.tickCount);
          a.targetX = corpse.x; a.targetZ = corpse.z; a.hasTarget = true;
          break;
        }
        a.nextHuntAgeSeconds = a.ageSeconds + pc.huntRetrySeconds;
        applyTransition(a, "Wander", "aucune proie", world.tickCount);
        wander(a, rng, pc.maxSpeed, pc.maxForce, steer);
        break;
      }
      a.stamina -= pc.staminaDrainPerSec * dt;
      if (a.stamina <= 0) {
        a.stamina = 0;
        a.nextHuntAgeSeconds = a.ageSeconds + pc.huntRetrySeconds;
        applyTransition(a, "Wander", "épuisé", world.tickCount);
        wander(a, rng, pc.maxSpeed, pc.maxForce, steer);
        break;
      }
      seek(a, prey.x, prey.z, pc.sprintSpeed, pc.maxForce, steer);
      speedCap = pc.sprintSpeed;
      const hdx = prey.x - a.x, hdz = prey.z - a.z;
      if (hdx * hdx + hdz * hdz < pc.killDistance * pc.killDistance) {
        // Refuge du troupeau : une proie entourée peut déjouer la morsure.
        if (rng() < herdEscapeChance(world, prey, pc)) {
          a.nextHuntAgeSeconds = a.ageSeconds + pc.huntRetrySeconds;
          applyTransition(a, "Wander", "proie échappée", world.tickCount);
          wander(a, rng, pc.maxSpeed, pc.maxForce, steer);
        } else {
          kill(world, prey, "prédation");
          a.energy = Math.min(1, a.energy + pc.killEnergyGain);
          a.nextHuntAgeSeconds = a.ageSeconds + pc.huntCooldownSeconds;
          applyTransition(a, "Wander", "proie tuée", world.tickCount);
        }
      }
      break;
    }
    case "Scavenge": {
      const pc = CARNIVORE;
      const corpse = findNearestCorpse(world, a);
      if (!corpse) { // charogne consommée par un autre ou despawnée
        a.nextHuntAgeSeconds = a.ageSeconds + pc.huntRetrySeconds;
        applyTransition(a, "Wander", "charogne disparue", world.tickCount);
        wander(a, rng, pc.maxSpeed, pc.maxForce, steer);
        break;
      }
      arrive(a, corpse.x, corpse.z, 3, pc.maxSpeed, pc.maxForce, steer);
      const sdx = corpse.x - a.x, sdz = corpse.z - a.z;
      if (sdx * sdx + sdz * sdz < pc.killDistance * pc.killDistance) {
        a.energy = Math.min(1, a.energy + pc.scavengeEnergyGain);
        corpse.deadForSeconds = Infinity; // consommée : retirée au nettoyage du tick
        a.nextHuntAgeSeconds = a.ageSeconds + pc.huntCooldownSeconds;
        applyTransition(a, "Wander", "charogne mangée", world.tickCount);
      }
      break;
    }
    case "Flee": {
      const fdx = a.x - a.threatX, fdz = a.z - a.threatZ;
      const dist = Math.hypot(fdx, fdz) || 1;
      // Un affamé court moins vite : les faibles se font attraper (émergence).
      const fleeSpeed = HERBIVORE.maxSpeed * HERBIVORE.fleeBoost * (0.7 + 0.3 * a.energy);
      seek(a, a.x + (fdx / dist) * 20, a.z + (fdz / dist) * 20, fleeSpeed, HERBIVORE.maxForce, steer);
      speedCap = fleeSpeed;
      break; // pas de boids : la panique prime
    }
    case "Eat": {
      const ph = HERBIVORE; // seuls les herbivores mangent le champ de biomasse
      const i = cellIndexAt(world.config, a.x, a.z);
      const avail = world.biomass.values[i]!;
      const take = Math.min(ph.eatBiomassPerSec * dt, avail);
      world.biomass.values[i] = avail - take;
      a.energy = Math.min(1, a.energy + take * (ph.eatEnergyPerSec / ph.eatBiomassPerSec));
      a.vx = a.vz = 0; moving = false;
      if (avail - take < 0.05) {
        a.memory.hasFood = false; // cellule épuisée : l'oublier
        applyTransition(a, "SeekFood", "cellule épuisée", world.tickCount);
      }
      break;
    }
  }

  // Seuls les herbivores ont des boids (les carnivores chassent en solitaire).
  if (moving && boidsMode > 0 && a.species === "herbivore") {
    accumulateBoids(a, world.grid, HERBIVORE, boidsMode === 2, steer);
  }

  if (moving) {
    a.vx += steer.ax * dt; a.vz += steer.az * dt;
    const sp = Math.hypot(a.vx, a.vz);
    if (sp > speedCap) { a.vx = (a.vx / sp) * speedCap; a.vz = (a.vz / sp) * speedCap; }
    const nx = a.x + a.vx * dt, nz = a.z + a.vz * dt;
    // Jamais dans l'eau profonde : on boit depuis la rive.
    if (sampleHeight(world.terrain, world.config, nx, nz) >= world.config.waterLevel - 0.2) {
      a.x = nx; a.z = nz;
    } else {
      a.vx = a.vz = 0;
    }
    const lim = world.config.sizeMeters / 2 - 2;
    a.x = Math.min(lim, Math.max(-lim, a.x));
    a.z = Math.min(lim, Math.max(-lim, a.z));
    if (sp > 0.1) a.heading = Math.atan2(a.vx, a.vz);
  }
}
