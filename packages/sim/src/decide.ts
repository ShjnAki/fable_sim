import type {
  AgentState, CarnivoreParams, HerbivoreParams, HumanParams, SpeciesParams,
} from "@eco/shared";
import type { Agent } from "./agent";

export interface Decision { state: AgentState; cause: string; }

/**
 * Éligible à la reproduction : adulte, repu, désaltéré, cooldown écoulé.
 * REFUGE DE RARETÉ : quand l'espèce est en danger (effectif < rarityThreshold),
 * ses survivants se reproduisent bien plus facilement — moins de compétition,
 * plus de ressources par tête. C'est ce qui empêche le creux du cycle
 * proie/prédateur de toucher l'extinction (cf. docs/tuning-phase4.md).
 */
export function isMateEligible(a: Agent, p: SpeciesParams, rare = false): boolean {
  const energyMin = rare ? p.mateEnergyMin * 0.6 : p.mateEnergyMin;
  const hydrationMin = rare ? p.mateHydrationMin * 0.6 : p.mateHydrationMin;
  const adultAge = rare ? p.adultAgeSeconds * 0.6 : p.adultAgeSeconds;
  const cooldownOk = rare
    ? a.ageSeconds >= a.nextMateAgeSeconds - p.mateCooldownSeconds * 0.6
    : a.ageSeconds >= a.nextMateAgeSeconds;
  return a.ageSeconds >= adultAge
    && cooldownOk
    && a.energy >= energyMin
    && a.hydration >= hydrationMin;
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
  // Réveil : fin de nuit ou groupe dispersé → Wander ; un besoin réveille aussi
  // (les blocs besoins plus bas ne testent que Wander, on délègue explicitement).
  if (a.state === "Sleep") {
    if (!a.night || !a.sheltered) return { state: "Wander", cause: "réveil" };
    if (a.hydration < p.seekWaterBelow) return { state: "SeekWater", cause: "soif" };
    if (a.energy < p.seekFoodBelow) return { state: "SeekFood", cause: "faim" };
    return null; // continue de dormir
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
    if (isMateEligible(a, p, a.rare)) return { state: "SeekMate", cause: "prêt à se reproduire" };
    // Priorité la plus basse : dormir la nuit si entouré (sécurité du groupe).
    if (a.night && a.sheltered) return { state: "Sleep", cause: "sommeil" };
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
    if (isMateEligible(a, p, a.rare) && (!a.crowded || a.rare)) return { state: "SeekMate", cause: "prêt à se reproduire" };
  }
  return null;
}

/**
 * Priorités humain : comme le carnivore mais SANS reproduction (apex non-
 * reproducteur, outil de perturbation). Soif critique > faim (Hunt) > boire
 * (hystérésis) > soif ordinaire > chasse > errance.
 */
export function decideHuman(a: Agent, p: HumanParams): Decision | null {
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
  if (a.state === "Wander") {
    if (a.hydration < p.seekWaterBelow) return { state: "SeekWater", cause: "soif" };
    if (a.energy < p.huntBelow && canHunt) return { state: "Hunt", cause: "faim" };
  }
  return null;
}
