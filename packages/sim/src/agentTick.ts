import {
  CARNIVORE, HERBIVORE, HUMAN, PLAYER,
  type CarnivoreParams, type HerbivoreParams, type Rng,
} from "@eco/shared";
import { createCarnivore, createHerbivore, paramsOf, type Agent } from "./agent";
import { applyTransition, damage, kill, preyEnergyValue } from "./agentCore";
import { cellCenterX, cellCenterZ, cellIndexAt } from "./biomass";
import { accumulateBoids } from "./boids";
import { decideCarnivore, decideHerbivore, decideHuman, isMateEligible } from "./decide";
import { tickPlayer } from "./player";
import { forEachNeighbor } from "./spatialGrid";
import { arrive, seek, wander, type SteerOut } from "./steering";
import { ZONE_GRASS, sampleHeight } from "./terrain";
import type { World } from "./world";

const steer: SteerOut = { ax: 0, az: 0 }; // scratch module — zéro alloc par tick

// Ré-export : `agentTick` reste la porte d'entrée publique de ces helpers
// (des tests et `index.ts` les importent déjà d'ici).
export { applyTransition, preyEnergyValue };

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
      || !isMateEligible(n, paramsOf(n), n.rare)) return;
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

// Comptage de la meute autour d'un loup (oser l'humain) — état module, zéro alloc.
let packSeeker: Agent;
let packCount = 0;
function countPackMate(n: Agent): void {
  if (n.id !== packSeeker.id && n.species === "carnivore" && n.state !== "Dead") packCount++;
}
function countPack(world: World, a: Agent, r: number): number {
  packSeeker = a; packCount = 0;
  forEachNeighbor(world.grid, a.x, a.z, r, countPackMate);
  return packCount;
}

// Recherche de proie (carnivores) — état module, zéro alloc.
let preySeeker: Agent;
let preyBest: Agent | null = null;
let preyBestD2 = 0;
function considerPrey(n: Agent): void {
  // L'humain chasse tout animal (herbivore ET carnivore). Le carnivore chasse les
  // herbivores — et, depuis la Phase 6, l'humain, mais SEULEMENT s'il est en meute
  // (`daresHuman`). La branche herbivore est inchangée : c'est ce qui garantit que
  // l'équilibre tuné de la Phase 4 ne bouge pas.
  if (preySeeker.species === "human") {
    if (n.species === "human" || n.state === "Dead") return;
  } else if (n.species === "human") {
    if (!preySeeker.daresHuman || n.state === "Dead") return;
  } else if (n.species !== "herbivore") {
    return;
  }
  const dx = n.x - preySeeker.x, dz = n.z - preySeeker.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < preyBestD2) { preyBestD2 = d2; preyBest = n; }
}
/** Proie la plus proche dans un rayon donné (engagement ou traque). */
function findNearestPreyWithin(world: World, a: Agent, r: number): Agent | null {
  preySeeker = a; preyBest = null;
  preyBestD2 = r * r;
  forEachNeighbor(world.grid, a.x, a.z, r, considerPrey);
  return preyBest;
}
/** Proie engageable : à portée de sprint (au-delà, la course épuise pour rien). */
function findNearestPrey(world: World, a: Agent): Agent | null {
  return findNearestPreyWithin(world, a, (paramsOf(a) as CarnivoreParams).huntCommitRadius);
}

/**
 * Cadavre non consommé le plus proche dans scavengeRadius. Scan linéaire (pas
 * la grille : elle exclut les morts) — n'est appelé que par un carnivore
 * affamé sans proie, cas rare, coût négligeable.
 */
function findNearestCorpse(world: World, a: Agent): Agent | null {
  let best: Agent | null = null;
  let bestD2 = (paramsOf(a) as CarnivoreParams).scavengeRadius ** 2;
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

// Entourage (herbivores) : assez de congénères proches pour oser dormir ?
let shelterSeeker: Agent;
let shelterCount = 0;
function countHerdShelter(n: Agent): void {
  if (n.id !== shelterSeeker.id && n.species === "herbivore" && n.state !== "Dead") shelterCount++;
}
function isSheltered(world: World, a: Agent): boolean {
  shelterSeeker = a; shelterCount = 0;
  forEachNeighbor(world.grid, a.x, a.z, HERBIVORE.sleepHerdRadius, countHerdShelter);
  return shelterCount >= HERBIVORE.sleepHerdMin;
}

// Perception de menace (herbivores) — état module, zéro alloc.
let threatSeeker: Agent;
let threatBest: Agent | null = null;
let threatBestD2 = 0;
function considerThreat(n: Agent): void {
  // Menace pour un herbivore : les prédateurs (carnivores ET humains).
  if (n.species !== "carnivore" && n.species !== "human") return;
  const dx = n.x - threatSeeker.x, dz = n.z - threatSeeker.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < threatBestD2) { threatBestD2 = d2; threatBest = n; }
}
/**
 * Écrit hasThreat/threatX/threatZ. Hystérésis : rayon élargi si on fuit déjà.
 * `overrideR` force un rayon (ex : perception réduite en dormant — réveil au
 * ras du prédateur).
 */
function perceiveThreat(world: World, a: Agent, p: HerbivoreParams, overrideR?: number): void {
  const r = overrideR ?? (a.hasThreat ? p.fleeSafeRadius : p.fleeTriggerRadius);
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
  if (a.species === "carnivore") { // le petit hérite du clan et de la tanière
    child.clanId = a.clanId; child.denX = a.denX; child.denZ = a.denZ;
  }
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
  // En dormant, le métabolisme tourne au ralenti (repos).
  const metab = a.state === "Sleep" ? HERBIVORE.sleepMetabolism : 1;
  a.energy -= p.energyDecayPerSec * dt * metab;
  a.hydration -= p.hydrationDecayPerSec * dt * metab;
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
  // Cicatrisation (Phase 6) : jamais pendant le combat. `a.health < 1`
  // court-circuite pour la quasi-totalité des agents → coût nul.
  if (a.health < 1 && a.ageSeconds - a.lastDamageAgeSeconds > PLAYER.healthRegenDelaySeconds) {
    a.health = Math.min(1, a.health + PLAYER.healthRegenPerSec * dt);
  }

  steer.ax = 0; steer.az = 0;
  let moving = true;
  let boidsMode: 0 | 1 | 2 = 0; // 0 aucun, 1 séparation seule, 2 troupeau complet
  let speedCap = p.maxSpeed;

  if (a.controlled) {
    // LE JOUEUR : ni perception, ni decide(), ni FSM — son intention pilote. Il
    // rejoint le bloc de mouvement partagé, tout en bas, comme les autres.
    const out = tickPlayer(a, world, dt, steer);
    speedCap = out.speedCap;
    moving = out.moving;
  } else {

  // Perception (écrit sur l'agent) PUIS décision pure (architecture §7).
  // Rareté : espèce sous son seuil critique → refuge de reproduction.
  a.rare = a.species === "herbivore"
    ? world.herbivoreCount < HERBIVORE.rarityThreshold
    : world.carnivoreCount < CARNIVORE.rarityThreshold;
  let d = null;
  if (a.species === "herbivore") {
    a.night = world.isNight;
    a.sheltered = world.isNight && isSheltered(world, a); // requête grille : la nuit seulement
    // Endormi : perception de menace réduite → le prédateur approche au ras.
    perceiveThreat(world, a, HERBIVORE, a.state === "Sleep" ? HERBIVORE.sleepWakeRadius : undefined);
    d = decideHerbivore(a, HERBIVORE);
  } else if (a.species === "human") {
    if (a.state !== "Hunt") a.stamina = Math.min(1, a.stamina + HUMAN.staminaRegenPerSec * dt);
    d = decideHuman(a, HUMAN); // apex : pas de territoire, pas de reproduction
  } else {
    if (a.state !== "Hunt") {
      a.stamina = Math.min(1, a.stamina + CARNIVORE.staminaRegenPerSec * dt);
    }
    // Oser l'humain : il faut une meute autour de soi (la nuit, moins de monde
    // suffit — ils sont plus hardis). COÛT NUL quand aucun humain n'existe : c'est
    // le cas du harness, du test de charge et de tous les runs de tuning.
    a.daresHuman = world.humanCount > 0
      && countPack(world, a, CARNIVORE.humanHuntPackRadius)
         >= (world.isNight ? CARNIVORE.humanHuntPackMinNight : CARNIVORE.humanHuntPackMin);
    a.crowded = isCrowded(world, a, CARNIVORE);
    d = decideCarnivore(a, CARNIVORE);
  }
  if (d) applyTransition(a, d.state, d.cause, world.tickCount);

  switch (a.state) {
    case "Wander":
      // Le rappel au territoire est un LUXE : un carnivore ne rentre que bien
      // repu et désaltéré. Sinon il erre et chasse librement, où que soient les
      // proies — sinon la tanière l'affame (il tourne autour d'un gibier épuisé).
      if (a.species === "carnivore"
          && a.energy > CARNIVORE.mateEnergyMin && a.hydration > CARNIVORE.mateHydrationMin
          && Math.hypot(a.denX - a.x, a.denZ - a.z) > CARNIVORE.homeRange) {
        seek(a, a.denX, a.denZ,
          p.maxSpeed * CARNIVORE.homingWeight + p.maxSpeed * 0.5, p.maxForce, steer);
      } else {
        wander(a, rng, p.maxSpeed, p.maxForce, steer);
        if (a.species === "herbivore") boidsMode = 2;
      }
      break;
    case "SeekWater": {
      boidsMode = 1;
      if (!a.hasTarget && !findNearestShore(world, a, p.perceptionRadius) && a.memory.hasWater) {
        a.targetX = a.memory.waterX; a.targetZ = a.memory.waterZ; a.hasTarget = true;
      }
      if (a.hasTarget) {
        // Rayon d'arrivée = la cellule de rive visée. Il DOIT être plus grand
        // que le rayon de ralentissement d'arrive(), sinon l'agent freine
        // jusqu'à l'arrêt juste avant sa cible et meurt de soif au bord de
        // l'eau, immobile (bug observé : v=0 à 5,9 m de la rive).
        const cell = world.config.sizeMeters / world.config.biomassResolution;
        const reach = Math.max(3, cell);
        arrive(a, a.targetX, a.targetZ, reach * 0.5, p.maxSpeed, p.maxForce, steer);
        const dx = a.targetX - a.x, dz = a.targetZ - a.z;
        if (dx * dx + dz * dz < reach * reach) {
          applyTransition(a, "Drink", "arrivé à l'eau", world.tickCount);
        }
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
      const pc = paramsOf(a) as CarnivoreParams;
      const prey = findNearestPrey(world, a);
      if (!prey) {
        // Faim critique : une charogne SÛRE vaut mieux qu'une proie lointaine
        // incertaine. Sans cette priorité, le carnivore court après un gibier
        // hors d'atteinte en ignorant un cadavre voisin — et meurt de faim.
        if (a.energy < pc.criticalNeed) {
          const meal = findNearestCorpse(world, a);
          if (meal) {
            applyTransition(a, "Scavenge", "charogne repérée", world.tickCount);
            a.targetX = meal.x; a.targetZ = meal.z; a.hasTarget = true;
            break;
          }
        }
        // Rien à portée de sprint : traquer (au trot, sans vider la stamina)
        // une proie repérée plus loin — c'est la battue, elle mène le clan
        // hors de sa tanière vers les troupeaux.
        const spotted = findNearestPreyWithin(world, a, pc.perceptionRadius);
        if (spotted) {
          seek(a, spotted.x, spotted.z, pc.maxSpeed, pc.maxForce, steer);
          break; // reste en Hunt : il approche
        }
        // Aucune proie en vue : se rabattre sur une charogne (plancher d'énergie).
        const corpse = findNearestCorpse(world, a);
        if (corpse) {
          applyTransition(a, "Scavenge", "charogne repérée", world.tickCount);
          a.targetX = corpse.x; a.targetZ = corpse.z; a.hasTarget = true;
          break;
        }
        // Territoire vidé de son gibier : le clan lève le camp. La tanière
        // dérive vers l'errance du chasseur — sinon le rappel le ramène
        // indéfiniment dans un désert alimentaire et il meurt de faim.
        a.denX = a.x; a.denZ = a.z;
        a.nextHuntAgeSeconds = a.ageSeconds + pc.huntRetrySeconds;
        applyTransition(a, "Wander", "aucune proie", world.tickCount);
        wander(a, rng, pc.maxSpeed, pc.maxForce, steer);
        break;
      }
      // Chasse en DEUX TEMPS. Approche au trot (économe) tant que la proie est
      // loin ; sprint (qui seul draine la stamina) au contact. Sans ça, le
      // prédateur épuisait tout son souffle en course d'approche et finissait
      // systématiquement « épuisé » sans jamais conclure.
      const hdx0 = prey.x - a.x, hdz0 = prey.z - a.z;
      const gap = Math.hypot(hdx0, hdz0);
      const sprinting = gap < pc.sprintRange;

      if (sprinting) {
        a.stamina -= pc.staminaDrainPerSec * dt;
        if (a.stamina <= 0) {
          a.stamina = 0;
          // Repos forcé : le temps de récupérer son souffle. Sans ce délai, un
          // carnivore affamé repart sprinter à vide et meurt entouré de gibier.
          a.nextHuntAgeSeconds = a.ageSeconds
            + Math.max(pc.huntRetrySeconds, 0.6 / pc.staminaRegenPerSec);
          applyTransition(a, "Wander", "épuisé", world.tickCount);
          wander(a, rng, pc.maxSpeed, pc.maxForce, steer);
          break;
        }
      }
      // Interception : viser où la proie SERA (sinon on la « pousse » devant soi).
      const chaseSpeed = sprinting ? pc.sprintSpeed : pc.maxSpeed;
      const lead = Math.min(2.5, gap / chaseSpeed);
      seek(a, prey.x + prey.vx * lead, prey.z + prey.vz * lead,
        chaseSpeed, pc.maxForce, steer);
      speedCap = chaseSpeed;
      const hdx = prey.x - a.x, hdz = prey.z - a.z;
      if (hdx * hdx + hdz * hdz < pc.killDistance * pc.killDistance) {
        if (prey.species === "human") {
          // DUEL LOUP ↔ HUMAIN (Phase 6) : morsure à points de vie, pas de mise à
          // mort nette. Le loup reste en Hunt et remord après son cooldown. Le
          // chemin herbivore ci-dessous est INCHANGÉ (équilibre Phase 4).
          if (a.ageSeconds >= a.nextBiteAgeSeconds) {
            a.nextBiteAgeSeconds = a.ageSeconds + CARNIVORE.biteCooldownSeconds;
            damage(world, prey, CARNIVORE.biteDamage, "dévoré");
            if (prey.state === "Dead") {
              a.energy = Math.min(1, a.energy + pc.killEnergyGain * preyEnergyValue(prey));
              a.nextHuntAgeSeconds = a.ageSeconds + pc.huntCooldownSeconds;
              applyTransition(a, "Wander", "proie tuée", world.tickCount);
            }
          }
        // Refuge du troupeau : une proie entourée peut déjouer la morsure.
        } else if (rng() < herdEscapeChance(world, prey, pc)) {
          a.nextHuntAgeSeconds = a.ageSeconds + pc.huntRetrySeconds;
          applyTransition(a, "Wander", "proie échappée", world.tickCount);
          wander(a, rng, pc.maxSpeed, pc.maxForce, steer);
        } else {
          kill(world, prey, "prédation");
          // Valeur selon l'âge : un adulte nourrit bien plus qu'un juvénile.
          a.energy = Math.min(1, a.energy + pc.killEnergyGain * preyEnergyValue(prey));
          a.nextHuntAgeSeconds = a.ageSeconds + pc.huntCooldownSeconds;
          applyTransition(a, "Wander", "proie tuée", world.tickCount);
        }
      }
      break;
    }
    case "Scavenge": {
      const pc = paramsOf(a) as CarnivoreParams;
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
        a.energy = Math.min(1, a.energy + pc.scavengeEnergyGain * preyEnergyValue(corpse));
        corpse.deadForSeconds = Infinity; // consommée : retirée au nettoyage du tick
        a.nextHuntAgeSeconds = a.ageSeconds + pc.huntCooldownSeconds;
        applyTransition(a, "Wander", "charogne mangée", world.tickCount);
      }
      break;
    }
    case "Sleep":
      a.vx = a.vz = 0; moving = false; // au repos, immobile
      break;
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

  } // fin de la branche « agent piloté par la FSM »

  if (moving) {
    const cfg = world.config;
    // NAGER. Sans ça, les rivières (4 m de fond) coupent l'île en quatre quartiers
    // hermétiques : chacun porte une sous-population qui s'éteint sans espoir de
    // recolonisation — c'était la vraie cause des extinctions de la Phase 4, et
    // aucun réglage ne pouvait la corriger (diagnostic : `scripts/connectivity.ts`).
    // On nage donc, mais lentement : la rivière n'est plus un mur, elle est un
    // passage lent — et donc risqué quand une meute est derrière soi.
    // Le facteur est PROPRE À L'ESPÈCE : le cerf nage bien (0,62), le loup mal
    // (0,30). L'eau devient ainsi le refuge des proies — un prédateur qui s'y
    // engage perd la course. C'est ce qui remplace la protection qu'apportait,
    // par accident, l'île fragmentée.
    if (sampleHeight(world.terrain, cfg, a.x, a.z) < cfg.waterLevel) {
      speedCap *= p.swimSpeedFactor;
    }
    a.vx += steer.ax * dt; a.vz += steer.az * dt;
    const sp = Math.hypot(a.vx, a.vz);
    if (sp > speedCap) { a.vx = (a.vx / sp) * speedCap; a.vz = (a.vz / sp) * speedCap; }
    const nx = a.x + a.vx * dt, nz = a.z + a.vz * dt;
    // Le grand large reste infranchissable (au-delà de swimMaxDepth). Si le pas
    // direct plonge trop, on GLISSE le long du fond (un axe à la fois) au lieu de
    // bloquer net : sinon l'agent qui vise l'eau reste figé et meurt de soif à
    // quelques mètres du point d'eau.
    const walkable = (x: number, z: number): boolean =>
      sampleHeight(world.terrain, cfg, x, z) >= cfg.waterLevel - cfg.swimMaxDepth;
    if (walkable(nx, nz)) {
      a.x = nx; a.z = nz;
    } else if (walkable(nx, a.z)) {
      a.x = nx; a.vz = 0;
    } else if (walkable(a.x, nz)) {
      a.z = nz; a.vx = 0;
    } else {
      // Cul-de-sac (coincé dans un renfoncement d'eau) : se dégager vers la
      // terre la plus proche. Sans ça l'agent reste figé jusqu'à sa mort —
      // on a vu des loups mourir de faim, immobiles, à 30 m d'une proie.
      a.vx = a.vz = 0;
      const step = 2;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const ex = a.x + Math.cos(ang) * step, ez = a.z + Math.sin(ang) * step;
        if (walkable(ex, ez)) { a.x = ex; a.z = ez; break; }
      }
    }
    const lim = world.config.sizeMeters / 2 - 2;
    a.x = Math.min(lim, Math.max(-lim, a.x));
    a.z = Math.min(lim, Math.max(-lim, a.z));
    if (sp > 0.1) a.heading = Math.atan2(a.vx, a.vz);
  }
}
