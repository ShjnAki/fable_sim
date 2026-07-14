/** Tronc commun des espèces — tous « à tuner » (PROGRESS.md). */
export interface SpeciesParams {
  maxSpeed: number;              // m/s (vitesse de croisière)
  maxForce: number;              // m/s² — accélération max de steering
  /**
   * Multiplicateur de vitesse dans l'eau. C'EST LE REFUGE DES PROIES : un cerf
   * nage bien, un loup nage mal. Une proie poursuivie traverse la rivière et
   * gagne du terrain ; le prédateur qui s'y engage perd la course. Sans cet
   * écart, les loups atteignent tout le monde partout et rasent les troupeaux
   * (extinction observée au harness sur certaines graines).
   */
  swimSpeedFactor: number;
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
  /** Sous cet effectif, l'espèce est « rare » : reproduction facilitée (refuge). */
  rarityThreshold: number;
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
  // sommeil groupé nocturne (Phase 4 suite)
  sleepHerdMin: number;          // congénères mini autour pour oser dormir
  sleepHerdRadius: number;       // m
  sleepMetabolism: number;       // × décroissance faim/soif en dormant (repos)
  sleepWakeRadius: number;       // m — un prédateur plus proche réveille (≪ fleeTrigger)
}

export interface CarnivoreParams extends SpeciesParams {
  huntBelow: number;             // seuil de faim qui déclenche la chasse
  huntCommitRadius: number;      // m — distance max d'engagement d'une proie (< perception)
  sprintRange: number;           // m — en deçà, on sprinte (et on vide la stamina)
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
  homeRange: number;             // m — au-delà, un carnivore repu rentre vers sa tanière
  homingWeight: number;          // force du rappel vers la tanière (0..1 de maxSpeed)
  // --- Duel loup ↔ humain (Phase 6). N'affecte PAS la prédation des herbivores. ---
  /** Congénères mini dans humanHuntPackRadius pour OSER s'en prendre à un humain. */
  humanHuntPackMin: number;
  /** Idem, la nuit : seuil abaissé — ils sont plus hardis. */
  humanHuntPackMinNight: number;
  /** m — rayon dans lequel on compte la meute. */
  humanHuntPackRadius: number;
  /** Vitalité retirée à l'humain par morsure. */
  biteDamage: number;
  /** s — délai entre deux morsures d'un même loup. */
  biteCooldownSeconds: number;
}

/** L'humain chasse avec la même machinerie que le carnivore (mêmes champs). */
export type HumanParams = CarnivoreParams;

export const HERBIVORE: HerbivoreParams = {
  // Le cerf nage bien : l'eau est SA porte de sortie face à une meute.
  maxSpeed: 4, maxForce: 6, swimSpeedFactor: 0.62, perceptionRadius: 60,
  energyDecayPerSec: 1 / 150, hydrationDecayPerSec: 1 / 130, drinkPerSec: 0.35,
  criticalNeed: 0.25, seekWaterBelow: 0.5, stopDrinkAt: 0.95,
  // Fécondité proie : la brider assez pour que les prédateurs puissent la
  // contenir (sinon les proies explosent, épuisent l'herbe et s'effondrent,
  // entraînant les prédateurs dans leur chute).
  adultAgeSeconds: 58, mateEnergyMin: 0.82, mateHydrationMin: 0.62,
  mateEnergyCost: 0.42, mateCooldownSeconds: 112, mateRetrySeconds: 10,
  // Cadavres persistants : ils sont le garde-manger de secours des prédateurs
  // dans le creux du cycle (sans quoi le creux touche l'extinction).
  maxAgeSeconds: 600, maxAgeVarianceSeconds: 120, corpseDespawnSeconds: 90,
  rarityThreshold: 150,
  eatEnergyPerSec: 0.08, eatBiomassPerSec: 0.2,
  seekFoodBelow: 0.6, stopEatAt: 0.9, minFoodBiomass: 0.25,
  boidsRadius: 8, separationWeight: 1.2, alignmentWeight: 0.4, cohesionWeight: 0.35,
  fleeTriggerRadius: 8, fleeSafeRadius: 14, fleeBoost: 1.5,
  sleepHerdMin: 4, sleepHerdRadius: 10, sleepMetabolism: 0.5, sleepWakeRadius: 4,
};

export const CARNIVORE: CarnivoreParams = {
  // Le loup nage mal : s'engager dans l'eau derrière une proie, c'est la perdre.
  maxSpeed: 3.5, maxForce: 7, swimSpeedFactor: 0.3, perceptionRadius: 170,
  // Grande réserve d'énergie (idée de Shin : « 150 vs 100 ») : un prédateur
  // survit très longtemps sans manger, ce qui lui permet de traverser le creux
  // du cycle (proies rares) sans mourir de faim avant que les proies remontent.
  // Soif lente aussi (il tire son eau des proies) : évite de fragmenter la chasse.
  energyDecayPerSec: 1 / 1300, hydrationDecayPerSec: 1 / 400, drinkPerSec: 0.35,
  criticalNeed: 0.25, seekWaterBelow: 0.45, stopDrinkAt: 0.95,
  // Reproduction assez vive pour RENOUVELER la cohorte (les fondateurs
  // longévifs meurent de vieillesse en même temps) ; le pic reste plafonné par
  // territoryMax, donc pas de boom malgré ce rythme.
  adultAgeSeconds: 70, mateEnergyMin: 0.82, mateHydrationMin: 0.6,
  mateEnergyCost: 0.6, mateCooldownSeconds: 160, mateRetrySeconds: 15,
  maxAgeSeconds: 1400, maxAgeVarianceSeconds: 500, corpseDespawnSeconds: 12,
  rarityThreshold: 25,
  // territoryMax élevé : les clans (tanières + rappel) régulent déjà la densité
  // spatiale ; un cap serré ferait que les membres d'un même clan se
  // déclarent mutuellement « crowded » et ne se reproduiraient jamais.
  // Le sprint (8 m/s) doit conclure AVANT l'épuisement : à 5,6 m/s pour une
  // proie fraîche, on ne gagne que 2,4 m/s — donc on ne s'engage que de près.
  // sprintRange > fleeTriggerRadius (8 m) ET assez grand pour couvrir la course :
  // au trot (4 m/s) on ne rattrape jamais une proie qui fuit à 6 m/s.
  // territoryMax : cap la densité prédatrice (sans quoi ils surdépassent la
  // capacité de l'île — pic à 50 — puis s'effondrent tous ensemble).
  huntBelow: 0.9, huntCommitRadius: 60, sprintRange: 45,
  territoryRadius: 95, territoryMax: 2, sprintSpeed: 12,
  staminaDrainPerSec: 1 / 25, staminaRegenPerSec: 1 / 15,
  killEnergyGain: 1, killDistance: 2,
  scavengeRadius: 150, scavengeEnergyGain: 0.7,
  preyRefugeRadius: 6, preyRefugePerNeighbor: 0.02, preyRefugeMaxChance: 0.12,
  huntCooldownSeconds: 40, huntRetrySeconds: 6,
  homeRange: 400, homingWeight: 0.35,
  // Un loup SEUL n'ose pas l'humain ; il en faut 2 autour de lui. La nuit, un
  // seul compagnon suffit. 3 morsures tuent (0.34) ; à 1,5 s de cadence, une
  // meute de trois dévore un homme en ~5 s.
  humanHuntPackMin: 2, humanHuntPackMinNight: 1, humanHuntPackRadius: 35,
  biteDamage: 0.34, biteCooldownSeconds: 1.5,
};

/**
 * Humain : super-prédateur au sommet (chasse les deux espèces, n'est chassé par
 * personne). Non-reproducteur pour l'instant (les valeurs mate/territoire sont
 * présentes mais inutilisées : decideHuman ne propose jamais SeekMate). Outil de
 * perturbation contrôlé par le joueur (spawn manuel). Omnivore + reproduction :
 * plus tard (hors périmètre Phase 5).
 */
export const HUMAN: HumanParams = {
  maxSpeed: 5, maxForce: 8, swimSpeedFactor: 0.45, perceptionRadius: 200,
  energyDecayPerSec: 1 / 900, hydrationDecayPerSec: 1 / 500, drinkPerSec: 0.4,
  criticalNeed: 0.25, seekWaterBelow: 0.45, stopDrinkAt: 0.95,
  adultAgeSeconds: 80, mateEnergyMin: 2, mateHydrationMin: 2, // > 1 : jamais éligible
  mateEnergyCost: 0.5, mateCooldownSeconds: 1e9, mateRetrySeconds: 1e9,
  maxAgeSeconds: 1600, maxAgeVarianceSeconds: 300, corpseDespawnSeconds: 20,
  rarityThreshold: 0, // pas de refuge de rareté
  huntBelow: 0.85, huntCommitRadius: 70, sprintRange: 50,
  territoryRadius: 1, territoryMax: 1e9, sprintSpeed: 14,
  staminaDrainPerSec: 1 / 30, staminaRegenPerSec: 1 / 12,
  killEnergyGain: 1, killDistance: 2.5,
  scavengeRadius: 180, scavengeEnergyGain: 0.7,
  preyRefugeRadius: 6, preyRefugePerNeighbor: 0, preyRefugeMaxChance: 0, // insensible au troupeau
  huntCooldownSeconds: 30, huntRetrySeconds: 5,
  homeRange: 1e9, homingWeight: 0, // pas de tanière
  // Inutilisés (l'humain n'est pas un loup) mais requis par le type.
  humanHuntPackMin: 0, humanHuntPackMinNight: 0, humanHuntPackRadius: 0,
  biteDamage: 0, biteCooldownSeconds: 0,
};

/**
 * Le JOUEUR (Phase 6). L'humain IA (`HUMAN`) garde ses valeurs : il reste l'outil
 * de perturbation de la Phase 5. Le joueur, lui, est réglé pour le *game feel*.
 *
 * L'ÉQUATION DE LA FUITE : le loup sprinte à 12 m/s, le joueur à 11 — le loup
 * gagne 1 m/s. Depuis ses 45 m de portée de sprint il lui faudrait ~45 s pour
 * toucher, mais son souffle ne dure que 25 s : IL ABANDONNE AVANT. On ne fuit pas
 * par la vitesse, on fuit par le souffle (30 s pour le joueur). Surpris à 10 m,
 * en revanche, on est mordu en 10 s — et trois morsures tuent.
 */
export interface PlayerParams extends HumanParams {
  maxHealth: number;
  healthRegenPerSec: number;
  /** s sans blessure avant que la cicatrisation ne commence (jamais en plein combat). */
  healthRegenDelaySeconds: number;
  strikeRange: number;
  strikeCooldownSeconds: number;
  /** Vitalité retirée à un loup par coup. 0.25 → 4 coups à mains nues. */
  strikeDamageCarnivore: number;
  /** Énergie gagnée par seconde en dévorant une carcasse. */
  eatCorpsePerSec: number;
  /** m — portée pour dévorer une carcasse / boire à la rive. */
  interactRange: number;
}

export const PLAYER: PlayerParams = {
  ...HUMAN,
  maxSpeed: 5,
  sprintSpeed: 11,              // le loup fait 12 : il te rattrape (voir ci-dessus)
  staminaDrainPerSec: 1 / 30,   // 30 s de souffle — le loup n'en a que 25
  staminaRegenPerSec: 1 / 12,
  maxHealth: 1,
  healthRegenPerSec: 0.02,      // ~50 s pour cicatriser entièrement
  healthRegenDelaySeconds: 8,
  strikeRange: 2.5,
  strikeCooldownSeconds: 0.8,
  strikeDamageCarnivore: 0.25,  // 4 coups pour abattre un loup à mains nues
  eatCorpsePerSec: 0.25,        // ~4 s pour un bon repas
  interactRange: 3,
};
