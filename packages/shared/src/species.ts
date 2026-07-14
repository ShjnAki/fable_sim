/** Tronc commun des espèces — tous « à tuner » (PROGRESS.md). */
export interface SpeciesParams {
  maxSpeed: number;              // m/s (vitesse de croisière)
  maxForce: number;              // m/s² — accélération max de steering
  perceptionRadius: number;      // m
  energyDecayPerSec: number;
  hydrationDecayPerSec: number;
  drinkPerSec: number;
  criticalNeed: number;          // sous ce seuil : priorité absolue
  seekWaterBelow: number;
  stopDrinkAt: number;
  adultAgeSeconds: number;       // âge adulte : reproduction + taille de rendu
  mateEnergyMin: number;
  mateHydrationMin: number;
  mateEnergyCost: number;        // payé par CHAQUE parent
  mateCooldownSeconds: number;
  mateRetrySeconds: number;
  maxAgeSeconds: number;
  maxAgeVarianceSeconds: number; // ± variance individuelle (tirée au spawn)
  corpseDespawnSeconds: number;
}

export interface HerbivoreParams extends SpeciesParams {
  // manger (champ de biomasse)
  eatEnergyPerSec: number;
  eatBiomassPerSec: number;
  seekFoodBelow: number;
  stopEatAt: number;
  minFoodBiomass: number;
  // troupeau
  boidsRadius: number;
  separationWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  // fuite (Phase 4)
  fleeTriggerRadius: number;     // m — un carnivore plus proche déclenche Flee
  fleeSafeRadius: number;        // m — hystérésis : on ne se calme qu'au-delà
  fleeBoost: number;             // multiplicateur de vitesse en fuite
}

export interface CarnivoreParams extends SpeciesParams {
  huntBelow: number;             // seuil de faim qui déclenche la chasse
  huntCommitRadius: number;      // m — distance max d'engagement d'une proie (< perception)
  territoryRadius: number;       // m — rayon de territoire (densité-dépendance)
  territoryMax: number;          // pas de reproduction si + de N congénères dans le territoire
  sprintSpeed: number;           // m/s en Hunt — vide la stamina
  staminaDrainPerSec: number;
  staminaRegenPerSec: number;
  killEnergyGain: number;        // énergie gagnée par proie
  killDistance: number;          // m — distance de mise à mort
  scavengeRadius: number;        // m — rayon de recherche d'un cadavre
  scavengeEnergyGain: number;    // énergie d'un cadavre (< kill : plancher, pas festin)
  preyRefugeRadius: number;      // m — voisinage compté autour de la proie (troupeau)
  preyRefugePerNeighbor: number; // proba d'échappement ajoutée par congénère (confusion)
  preyRefugeMaxChance: number;   // plafond de la proba d'échappement
  huntCooldownSeconds: number;   // digestion après un kill
  huntRetrySeconds: number;      // délai après un abandon (épuisé / aucune proie)
}

export const HERBIVORE: HerbivoreParams = {
  maxSpeed: 4, maxForce: 6, perceptionRadius: 60,
  energyDecayPerSec: 1 / 150, hydrationDecayPerSec: 1 / 130, drinkPerSec: 0.35,
  criticalNeed: 0.25, seekWaterBelow: 0.5, stopDrinkAt: 0.95,
  adultAgeSeconds: 40, mateEnergyMin: 0.7, mateHydrationMin: 0.55,
  mateEnergyCost: 0.35, mateCooldownSeconds: 55, mateRetrySeconds: 8,
  maxAgeSeconds: 600, maxAgeVarianceSeconds: 120, corpseDespawnSeconds: 30,
  eatEnergyPerSec: 0.08, eatBiomassPerSec: 0.2,
  seekFoodBelow: 0.6, stopEatAt: 0.9, minFoodBiomass: 0.25,
  boidsRadius: 8, separationWeight: 1.2, alignmentWeight: 0.4, cohesionWeight: 0.35,
  fleeTriggerRadius: 8, fleeSafeRadius: 14, fleeBoost: 1.5,
};

export const CARNIVORE: CarnivoreParams = {
  maxSpeed: 3.5, maxForce: 7, perceptionRadius: 90,
  energyDecayPerSec: 1 / 350, hydrationDecayPerSec: 1 / 120, drinkPerSec: 0.15,
  criticalNeed: 0.25, seekWaterBelow: 0.45, stopDrinkAt: 0.95,
  adultAgeSeconds: 55, mateEnergyMin: 0.7, mateHydrationMin: 0.55,
  mateEnergyCost: 0.5, mateCooldownSeconds: 100, mateRetrySeconds: 12,
  maxAgeSeconds: 900, maxAgeVarianceSeconds: 150, corpseDespawnSeconds: 12,
  huntBelow: 0.68, huntCommitRadius: 40, territoryRadius: 55, territoryMax: 2, sprintSpeed: 8,
  staminaDrainPerSec: 1 / 12, staminaRegenPerSec: 1 / 20,
  killEnergyGain: 0.72, killDistance: 1.5,
  scavengeRadius: 110, scavengeEnergyGain: 0.55,
  preyRefugeRadius: 6, preyRefugePerNeighbor: 0.12, preyRefugeMaxChance: 0.75,
  huntCooldownSeconds: 85, huntRetrySeconds: 8,
};
