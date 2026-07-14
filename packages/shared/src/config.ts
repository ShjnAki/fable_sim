/** Configuration complète d'un monde. Tous les « paramètres à tuner » vivent ici. */
export interface WorldConfig {
  seed: string;
  /** Côté du monde en mètres (monde centré sur l'origine). */
  sizeMeters: number;
  /** Résolution de la grille de hauteurs : (n+1)² sommets. */
  terrainResolution: number;
  /** Longueur d'onde de base du bruit (m) — plus grand = relief plus large. */
  noiseWavelength: number;
  /** Hauteur max du relief (m), avant falloff insulaire. */
  maxHeight: number;
  /** Niveau de l'eau (m). */
  waterLevel: number;
  /** Demi-largeur des rivières (m). 0 = pas de rivières. */
  riverWidth: number;
  /** Profondeur des chenaux sous le niveau de l'eau (m). */
  riverDepth: number;
  /** Amplitude des méandres des rivières (m). */
  riverMeander: number;
  /** Demi-largeur du pont naturel central (m). 0 = pas de pont. */
  bridgeWidth: number;
  /** Demi-longueur du pont central (m). */
  bridgeReach: number;
  /** Hauteur du pont au-dessus du niveau de l'eau (m). */
  bridgeHeight: number;
  /** Pente (dy par mètre horizontal) au-delà de laquelle c'est de la roche. */
  rockSlope: number;
  /** Résolution de la grille de biomasse/zones (cellules par côté). */
  biomassResolution: number;
  /** Taux de repousse logistique par seconde. */
  biomassRegrowthRate: number;
  /** Durée d'un jour complet en secondes de sim. */
  dayLengthSeconds: number;
  /** Nuit = timeOfDay > nightStart OU < nightEnd (0=minuit, 0.5=midi). */
  nightStart: number;
  nightEnd: number;
  /** Fréquence de tick de la sim (Hz). */
  tickRateHz: number;
  /** Nombre d'herbivores au démarrage du monde. */
  initialHerbivores: number;
  /** Nombre de carnivores au démarrage du monde. */
  initialCarnivores: number;
  /** Nombre d'humains au démarrage (0 : ils n'apparaissent qu'au spawn manuel). */
  initialHumans: number;
  /** Nombre de clans de carnivores (tanières réparties sur l'île). */
  carnivoreClans: number;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  seed: "fable-1",
  sizeMeters: 512,
  terrainResolution: 256,
  noiseWavelength: 180,
  maxHeight: 36,
  waterLevel: 5,
  riverWidth: 11,
  riverDepth: 4,
  riverMeander: 26,
  // Pont désactivé : les berges en pente douce rendent les rivières
  // franchissables à gué — plus naturel qu'une passerelle plate (retour Shin).
  bridgeWidth: 0,
  bridgeReach: 60,
  bridgeHeight: 3,
  rockSlope: 0.7,
  biomassResolution: 128,
  biomassRegrowthRate: 0.12,
  dayLengthSeconds: 600,
  nightStart: 0.80,
  nightEnd: 0.22,
  tickRateHz: 20,
  initialHerbivores: 150,
  initialCarnivores: 8,
  initialHumans: 0,
  carnivoreClans: 3,
};
