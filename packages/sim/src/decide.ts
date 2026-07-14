import type { AgentState, CarnivoreParams, HerbivoreParams, SpeciesParams } from "@eco/shared";
import type { Agent } from "./agent";

export interface Decision { state: AgentState; cause: string; }

/** Éligible à la reproduction : adulte, repu, désaltéré, cooldown écoulé. */
export function isMateEligible(a: Agent, p: SpeciesParams): boolean {
  return a.ageSeconds >= p.adultAgeSeconds
    && a.ageSeconds >= a.nextMateAgeSeconds
    && a.energy >= p.mateEnergyMin
    && a.hydration >= p.mateHydrationMin;
}

/**
 * Priorités strictes (architecture §7) : soif critique > faim critique >
 * fins d'action (hystérésis) > besoins ordinaires depuis l'errance.
 * Les transitions d'arrivée (SeekWater→Drink, SeekFood→Eat) sont gérées
 * par le comportement dans tickAgent, pas ici.
 */
export function decideHerbivore(a: Agent, p: HerbivoreParams): Decision | null {
  // Fuir > tout (architecture §7). La menace est écrite par la perception.
  if (a.hasThreat && a.state !== "Flee") {
    return { state: "Flee", cause: "prédateur !" };
  }
  if (a.state === "Flee") {
    if (!a.hasThreat) return { state: "Wander", cause: "danger écarté" };
    return null; // on fuit — rien d'autre ne compte
  }
  if (a.hydration < p.criticalNeed && a.state !== "SeekWater" && a.state !== "Drink") {
    return { state: "SeekWater", cause: "soif critique" };
  }
  if (a.hydration >= p.criticalNeed && a.energy < p.criticalNeed
      && a.state !== "SeekFood" && a.state !== "Eat") {
    return { state: "SeekFood", cause: "faim critique" };
  }
  if (a.state === "Drink" && a.hydration >= p.stopDrinkAt) {
    if (a.energy < p.seekFoodBelow) return { state: "SeekFood", cause: "désaltéré, faim" };
    return { state: "Wander", cause: "désaltéré" };
  }
  if (a.state === "Eat" && a.energy >= p.stopEatAt) {
    if (a.hydration < p.seekWaterBelow) return { state: "SeekWater", cause: "repu, soif" };
    return { state: "Wander", cause: "repu" };
  }
  if (a.state === "SeekMate") {
    if (a.hydration < p.seekWaterBelow) return { state: "SeekWater", cause: "soif" };
    if (a.energy < p.seekFoodBelow) return { state: "SeekFood", cause: "faim" };
  }
  if (a.state === "Wander") {
    if (a.hydration < p.seekWaterBelow) return { state: "SeekWater", cause: "soif" };
    if (a.energy < p.seekFoodBelow) return { state: "SeekFood", cause: "faim" };
    if (isMateEligible(a, p)) return { state: "SeekMate", cause: "prêt à se reproduire" };
  }
  return null;
}

/**
 * Priorités carnivore : soif critique > faim critique > boire (hystérésis)
 * > soif ordinaire > chasse (faim ordinaire) > reproduction > errance.
 * Hunt n'est proposé que si le cooldown (digestion/retry) est écoulé.
 */
export function decideCarnivore(a: Agent, p: CarnivoreParams): Decision | null {
  const canHunt = a.ageSeconds >= a.nextHuntAgeSeconds;
  if (a.hydration < p.criticalNeed && a.state !== "SeekWater" && a.state !== "Drink") {
    return { state: "SeekWater", cause: "soif critique" };
  }
  if (a.hydration >= p.criticalNeed && a.energy < p.criticalNeed
      && a.state !== "Hunt" && a.state !== "Scavenge" && a.state !== "Drink" && canHunt) {
    return { state: "Hunt", cause: "faim critique" };
  }
  if (a.state === "Drink" && a.hydration >= p.stopDrinkAt) {
    if (a.energy < p.huntBelow && canHunt) return { state: "Hunt", cause: "désaltéré, faim" };
    return { state: "Wander", cause: "désaltéré" };
  }
  if (a.state === "SeekMate") {
    if (a.hydration < p.seekWaterBelow) return { state: "SeekWater", cause: "soif" };
    if (a.energy < p.huntBelow && canHunt) return { state: "Hunt", cause: "faim" };
  }
  if (a.state === "Wander") {
    if (a.hydration < p.seekWaterBelow) return { state: "SeekWater", cause: "soif" };
    if (a.energy < p.huntBelow && canHunt) return { state: "Hunt", cause: "faim" };
    // Territorialité : pas de reproduction en territoire saturé (densité-dépendance).
    if (isMateEligible(a, p) && !a.crowded) return { state: "SeekMate", cause: "prêt à se reproduire" };
  }
  return null;
}
