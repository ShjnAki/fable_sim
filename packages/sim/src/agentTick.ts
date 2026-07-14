import { HERBIVORE, type AgentState, type HerbivoreParams, type Rng } from "@eco/shared";
import { createHerbivore, type Agent } from "./agent";
import { cellCenterX, cellCenterZ, cellIndexAt } from "./biomass";
import { accumulateBoids } from "./boids";
import { decideHerbivore, isMateEligible } from "./decide";
import { forEachNeighbor } from "./spatialGrid";
import { arrive, wander, type SteerOut } from "./steering";
import { ZONE_GRASS, sampleHeight } from "./terrain";
import type { World } from "./world";

const steer: SteerOut = { ax: 0, az: 0 }; // scratch module — zéro alloc par tick

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
  if (n.id === mateSeeker.id || !isMateEligible(n, HERBIVORE)) return;
  const dx = n.x - mateSeeker.x, dz = n.z - mateSeeker.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < mateBestD2) { mateBestD2 = d2; mateBest = n; }
}
function findNearestMate(world: World, a: Agent): Agent | null {
  mateSeeker = a;
  mateBest = null;
  mateBestD2 = HERBIVORE.perceptionRadius ** 2;
  forEachNeighbor(world.grid, a.x, a.z, HERBIVORE.perceptionRadius, considerMate);
  return mateBest;
}

/** Naissance : le parent au plus petit id l'exécute — jamais deux fois. */
function birth(world: World, a: Agent, mate: Agent): void {
  const p = HERBIVORE;
  const child = createHerbivore(
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
  const p = HERBIVORE;
  if (a.state === "Dead") { a.deadForSeconds += dt; return; }

  a.ageSeconds += dt;
  if (a.ageSeconds >= a.maxAgeSeconds) {
    a.vx = a.vz = 0;
    applyTransition(a, "Dead", "vieillesse", world.tickCount);
    return;
  }
  a.energy -= p.energyDecayPerSec * dt;
  a.hydration -= p.hydrationDecayPerSec * dt;
  if (a.hydration <= 0) {
    a.hydration = 0; a.vx = a.vz = 0;
    applyTransition(a, "Dead", "mort de soif", world.tickCount);
    return;
  }
  if (a.energy <= 0) {
    a.energy = 0; a.vx = a.vz = 0;
    applyTransition(a, "Dead", "mort de faim", world.tickCount);
    return;
  }

  const d = decideHerbivore(a, p);
  if (d) applyTransition(a, d.state, d.cause, world.tickCount);

  steer.ax = 0; steer.az = 0;
  let moving = true;
  let boidsMode: 0 | 1 | 2 = 0; // 0 aucun, 1 séparation seule, 2 troupeau complet

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
      if (!a.hasTarget && !findNearestFood(world, a, p) && a.memory.hasFood) {
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
    case "Eat": {
      const i = cellIndexAt(world.config, a.x, a.z);
      const avail = world.biomass.values[i]!;
      const take = Math.min(p.eatBiomassPerSec * dt, avail);
      world.biomass.values[i] = avail - take;
      a.energy = Math.min(1, a.energy + take * (p.eatEnergyPerSec / p.eatBiomassPerSec));
      a.vx = a.vz = 0; moving = false;
      if (avail - take < 0.05) {
        a.memory.hasFood = false; // cellule épuisée : l'oublier
        applyTransition(a, "SeekFood", "cellule épuisée", world.tickCount);
      }
      break;
    }
  }

  if (moving && boidsMode > 0) {
    accumulateBoids(a, world.grid, p, boidsMode === 2, steer);
  }

  if (moving) {
    a.vx += steer.ax * dt; a.vz += steer.az * dt;
    const sp = Math.hypot(a.vx, a.vz);
    if (sp > p.maxSpeed) { a.vx = (a.vx / sp) * p.maxSpeed; a.vz = (a.vz / sp) * p.maxSpeed; }
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
