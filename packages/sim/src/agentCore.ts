import type { AgentState } from "@eco/shared";
import { paramsOf, type Agent } from "./agent";
import type { World } from "./world";

/**
 * Opérations de base sur un agent : transition, mort, blessure, valeur nutritive.
 * Module séparé d'`agentTick` pour que `player.ts` les réutilise sans créer
 * d'import circulaire (`agentTick` importe `player`, qui importe ceci).
 */

/** Mort d'un agent : transition + compteur de cause (diagnostic de tuning). */
export function kill(world: World, a: Agent, cause: string): void {
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

/**
 * Blessure. N'est appelée QUE dans le duel loup ↔ humain (spec Phase 6 §4) : la
 * prédation loup → herbivore reste une mise à mort instantanée (Phase 4), et
 * l'équilibre Lotka-Volterra tuné n'est donc pas touché.
 */
export function damage(world: World, a: Agent, amount: number, cause: string): void {
  a.health -= amount;
  a.lastDamageAgeSeconds = a.ageSeconds;
  if (a.health <= 0) {
    a.health = 0;
    kill(world, a, cause);
  }
}

/**
 * Valeur nutritive d'une proie/charogne selon l'âge : juvénile < adulte, mais
 * un juvénile reste correctement nourrissant (plancher 0.7). Sans ce plancher,
 * un boom de jeunes proies affame les prédateurs malgré l'abondance (effet
 * émergent déstabilisant observé au harness).
 */
export function preyEnergyValue(prey: Agent): number {
  return 0.7 + 0.3 * Math.min(1, prey.ageSeconds / paramsOf(prey).adultAgeSeconds);
}
