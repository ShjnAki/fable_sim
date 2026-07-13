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
  // Phase 3 — voisinage & reproduction
  boidsRadius: number;           // m — rayon des interactions de troupeau
  separationWeight: number;      // poids des 3 forces boids
  alignmentWeight: number;
  cohesionWeight: number;
  adultAgeSeconds: number;       // âge adulte : reproduction + taille de rendu
  mateEnergyMin: number;         // éligibilité reproduction
  mateHydrationMin: number;
  mateEnergyCost: number;        // payé par CHAQUE parent à la naissance
  mateCooldownSeconds: number;   // délai entre deux reproductions
  mateRetrySeconds: number;      // délai avant nouvel essai si aucun partenaire
  maxAgeSeconds: number;         // espérance de vie moyenne
  maxAgeVarianceSeconds: number; // ± variance individuelle (tirée au spawn)
}

export const HERBIVORE: HerbivoreParams = {
  maxSpeed: 4, maxForce: 6, perceptionRadius: 60,
  energyDecayPerSec: 1 / 150, hydrationDecayPerSec: 1 / 100,
  eatEnergyPerSec: 0.08, eatBiomassPerSec: 0.2, drinkPerSec: 0.15,
  criticalNeed: 0.25, seekWaterBelow: 0.5, seekFoodBelow: 0.6,
  stopDrinkAt: 0.95, stopEatAt: 0.9, minFoodBiomass: 0.25,
  corpseDespawnSeconds: 10,
  boidsRadius: 8, separationWeight: 1.2, alignmentWeight: 0.4, cohesionWeight: 0.35,
  adultAgeSeconds: 45, mateEnergyMin: 0.75, mateHydrationMin: 0.6,
  mateEnergyCost: 0.35, mateCooldownSeconds: 60, mateRetrySeconds: 10,
  maxAgeSeconds: 600, maxAgeVarianceSeconds: 120,
};
