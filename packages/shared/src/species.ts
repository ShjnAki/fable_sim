/** Paramètres de l'espèce herbivore — tous « à tuner » (PROGRESS.md). */
export interface HerbivoreParams {
  maxSpeed: number;              // m/s
  maxForce: number;              // m/s² — accélération max de steering
  perceptionRadius: number;      // m
  energyDecayPerSec: number;     // faim : 1 → 0 en 150 s
  hydrationDecayPerSec: number;  // soif : 1 → 0 en 100 s
  eatEnergyPerSec: number;       // gain d'énergie en mangeant à plein régime
  eatBiomassPerSec: number;      // biomasse consommée à plein régime
  drinkPerSec: number;
  criticalNeed: number;          // sous ce seuil : priorité absolue
  seekWaterBelow: number;        // seuils de déclenchement depuis Wander
  seekFoodBelow: number;
  stopDrinkAt: number;           // hystérésis : on boit/mange au-delà du seuil d'entrée
  stopEatAt: number;
  minFoodBiomass: number;        // biomasse min d'une cellule « mangeable »
  corpseDespawnSeconds: number;
}

export const HERBIVORE: HerbivoreParams = {
  maxSpeed: 4, maxForce: 6, perceptionRadius: 60,
  energyDecayPerSec: 1 / 150, hydrationDecayPerSec: 1 / 100,
  eatEnergyPerSec: 0.08, eatBiomassPerSec: 0.2, drinkPerSec: 0.15,
  criticalNeed: 0.25, seekWaterBelow: 0.5, seekFoodBelow: 0.6,
  stopDrinkAt: 0.95, stopEatAt: 0.9, minFoodBiomass: 0.25,
  corpseDespawnSeconds: 10,
};
