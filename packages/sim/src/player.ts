import { PLAYER } from "@eco/shared";
import { createHuman, type Agent } from "./agent";
import { applyTransition, damage, kill } from "./agentCore";
import { cellCenterX, cellCenterZ } from "./biomass";
import { seek, type SteerOut } from "./steering";
import { ZONE_GRASS } from "./terrain";
import type { World } from "./world";

/**
 * Le JOUEUR (Phase 6). C'est un `Agent` d'espèce `human` dont le `decide()` est
 * remplacé par une intention envoyée par le client. Il traverse ensuite le MÊME
 * bloc de mouvement que tous les autres agents (glissement le long des berges,
 * dégagement des culs-de-sac, bornes du monde) : il hérite gratuitement de toute
 * la physique de terrain déjà déboguée.
 */

export interface PlayerOut { speedCap: number; moving: boolean }
const playerOut: PlayerOut = { speedCap: 0, moving: true }; // scratch — zéro alloc

export function playerAgent(world: World): Agent | undefined {
  if (world.playerId === null) return undefined;
  return world.agents.find((a) => a.id === world.playerId);
}

function resetIntent(world: World): void {
  const i = world.playerIntent;
  i.moveX = 0; i.moveZ = 0; i.sprint = false; i.strike = false; i.interact = false;
}

/**
 * Fait naître (ou renaître) le joueur sur la cellule d'herbe la PLUS ÉLOIGNÉE du
 * loup le plus proche — on ne réapparaît pas dans la gueule d'une meute.
 * Scan O(cellules × loups) exécuté une seule fois par naissance : négligeable.
 */
export function spawnPlayer(world: World): Agent {
  const { terrain, config } = world;
  let best = -1, bestD = -1;
  for (let i = 0; i < terrain.zones.length; i++) {
    if (terrain.zones[i] !== ZONE_GRASS) continue;
    const x = cellCenterX(config, i), z = cellCenterZ(config, i);
    let nearest = Infinity;
    for (const a of world.agents) {
      if (a.species !== "carnivore" || a.state === "Dead") continue;
      const dx = a.x - x, dz = a.z - z;
      nearest = Math.min(nearest, dx * dx + dz * dz);
    }
    if (nearest > bestD) { bestD = nearest; best = i; }
  }
  const sx = best < 0 ? 0 : cellCenterX(config, best);
  const sz = best < 0 ? 0 : cellCenterZ(config, best);

  // L'ancien corps, s'il vit encore, retourne à l'IA — il ne disparaît pas.
  const old = playerAgent(world);
  if (old && old.state !== "Dead") old.controlled = false;

  const a = createHuman(world.nextAgentId++, sx, sz, world.rng);
  a.controlled = true;
  a.ageSeconds = PLAYER.adultAgeSeconds; // on naît adulte
  world.agents.push(a);
  world.playerId = a.id;
  world.playerStats.preyKilled = 0;
  world.playerStats.wolvesKilled = 0;
  world.playerStats.bornAtSeconds = world.simTimeSeconds;
  resetIntent(world);
  return a;
}

/** Prend ou lâche les commandes. Lâché, le corps continue de vivre sous la FSM. */
export function setPlayerControl(world: World, controlled: boolean): void {
  const a = playerAgent(world);
  if (!a || a.state === "Dead") return;
  a.controlled = controlled;
  if (!controlled) resetIntent(world);
}

/** Une rive est-elle à portée ? Scan linéaire — appelé sur action, pas par tick. */
function nearShore(world: World, a: Agent, r: number): boolean {
  const { terrain, config } = world;
  const r2 = r * r;
  for (let s = 0; s < terrain.shoreCells.length; s++) {
    const i = terrain.shoreCells[s]!;
    const dx = cellCenterX(config, i) - a.x, dz = cellCenterZ(config, i) - a.z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

/** Carcasse encore entamable la plus proche, à portée. */
function nearestCorpse(world: World, a: Agent, r: number): Agent | null {
  let best: Agent | null = null;
  let bestD2 = r * r;
  for (const n of world.agents) {
    if (n.state !== "Dead" || n.mealLeft <= 0 || !Number.isFinite(n.deadForSeconds)) continue;
    const dx = n.x - a.x, dz = n.z - a.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = n; }
  }
  return best;
}

/**
 * Frappe : touche l'agent vivant le plus proche dans `strikeRange` (pas de cône
 * de visée — compromis assumé). Un cerf meurt d'un coup ; un loup encaisse (4
 * coups à mains nues) et rend les coups. Scan linéaire, borné par le cooldown.
 */
function strike(a: Agent, world: World): void {
  if (a.ageSeconds < a.nextStrikeAgeSeconds) return;
  a.nextStrikeAgeSeconds = a.ageSeconds + PLAYER.strikeCooldownSeconds;
  let target: Agent | null = null;
  let bestD2 = PLAYER.strikeRange * PLAYER.strikeRange;
  for (const n of world.agents) {
    if (n.id === a.id || n.state === "Dead" || n.species === "human") continue;
    const dx = n.x - a.x, dz = n.z - a.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; target = n; }
  }
  if (!target) return;
  if (target.species === "carnivore") {
    damage(world, target, PLAYER.strikeDamageCarnivore, "abattu");
    if (target.state === "Dead") world.playerStats.wolvesKilled++;
  } else {
    // Le cerf ne se bat pas. AUCUNE énergie immédiate : il faut dévorer la
    // carcasse — et une carcasse fraîche attire les loups (charognage Phase 4).
    kill(world, target, "abattu");
    world.playerStats.preyKilled++;
  }
}

/**
 * Action contextuelle (touche E). L'action dépend du BESOIN, pas seulement de ce
 * qui est à portée : sur une proie fraîche au bord de l'eau, on dévore d'abord si
 * l'on a faim, et on ne va boire que si l'on est déjà rassasié.
 */
function beginInteract(a: Agent, world: World): void {
  if (a.energy < 1 && nearestCorpse(world, a, PLAYER.interactRange)) {
    applyTransition(a, "Eat", "dévore une carcasse", world.tickCount);
    return;
  }
  if (a.hydration < PLAYER.stopDrinkAt && nearShore(world, a, PLAYER.interactRange)) {
    applyTransition(a, "Drink", "boit", world.tickCount);
  }
}

/**
 * Un tick de joueur. Écrit `steer` et renvoie le cap de vitesse + s'il bouge ;
 * l'intégration du mouvement reste faite par `tickAgent` (code partagé).
 */
export function tickPlayer(a: Agent, world: World, dt: number, steer: SteerOut): PlayerOut {
  const i = world.playerIntent;
  playerOut.moving = true;
  playerOut.speedCap = PLAYER.maxSpeed;
  const wantsMove = i.moveX !== 0 || i.moveZ !== 0;

  // Impulsions : la SIM les consomme (le client tourne à 60 Hz, la sim à 20 —
  // sans ça un clic tombé entre deux ticks serait perdu, ou joué deux fois).
  if (i.strike) { i.strike = false; strike(a, world); }
  if (i.interact) { i.interact = false; beginInteract(a, world); }

  // Boire / dévorer : immobile. Bouger interrompt le repas.
  if (a.state === "Drink") {
    if (wantsMove || a.hydration >= PLAYER.stopDrinkAt) {
      applyTransition(a, "Wander", wantsMove ? "interrompu" : "désaltéré", world.tickCount);
    } else {
      a.hydration = Math.min(1, a.hydration + PLAYER.drinkPerSec * dt);
      a.vx = a.vz = 0;
      playerOut.moving = false;
      return playerOut;
    }
  } else if (a.state === "Eat") {
    const corpse = nearestCorpse(world, a, PLAYER.interactRange);
    if (wantsMove || !corpse || a.energy >= 1) {
      applyTransition(a, "Wander", corpse ? "interrompu" : "carcasse épuisée", world.tickCount);
    } else {
      const take = Math.min(PLAYER.eatCorpsePerSec * dt, corpse.mealLeft, 1 - a.energy);
      a.energy += take;
      corpse.mealLeft -= take;
      if (corpse.mealLeft <= 0) corpse.deadForSeconds = Infinity; // carcasse finie
      a.vx = a.vz = 0;
      playerOut.moving = false;
      return playerOut;
    }
  }

  // Endurance : le sprint la vide, tout le reste la recharge.
  if (i.sprint && wantsMove && a.stamina > 0) {
    a.stamina = Math.max(0, a.stamina - PLAYER.staminaDrainPerSec * dt);
    playerOut.speedCap = PLAYER.sprintSpeed;
  } else {
    a.stamina = Math.min(1, a.stamina + PLAYER.staminaRegenPerSec * dt);
  }

  if (wantsMove) {
    const len = Math.hypot(i.moveX, i.moveZ) || 1;
    seek(a, a.x + (i.moveX / len) * 10, a.z + (i.moveZ / len) * 10,
      playerOut.speedCap, PLAYER.maxForce, steer);
  } else {
    a.vx *= 0.6; a.vz *= 0.6; // freinage : sans ça l'inertie fait déraper
  }
  return playerOut;
}
