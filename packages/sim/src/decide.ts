import type { AgentState, HerbivoreParams } from "@eco/shared";
import type { Agent } from "./agent";

export interface Decision { state: AgentState; cause: string; }

/**
 * Priorités strictes (architecture §7) : soif critique > faim critique >
 * fins d'action (hystérésis) > besoins ordinaires depuis l'errance.
 * Les transitions d'arrivée (SeekWater→Drink, SeekFood→Eat) sont gérées
 * par le comportement dans tickAgent, pas ici.
 */
export function decide(a: Agent, p: HerbivoreParams): Decision | null {
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
  if (a.state === "Wander") {
    if (a.hydration < p.seekWaterBelow) return { state: "SeekWater", cause: "soif" };
    if (a.energy < p.seekFoodBelow) return { state: "SeekFood", cause: "faim" };
  }
  return null;
}
