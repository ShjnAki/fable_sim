import type { WorldConfig } from "./config";

/** États de la FSM agent (architecture §7). */
export type AgentState =
  "Wander" | "SeekWater" | "Drink" | "SeekFood" | "Eat"
  | "SeekMate" | "Flee" | "Hunt" | "Scavenge" | "Sleep" | "Dead";

/** Une transition de la FSM, gardée en ring buffer pour l'inspecteur. */
export interface Transition {
  tick: number;
  from: AgentState;
  to: AgentState;
  cause: string;
}

/** Vue légère d'un agent, émise à chaque tick pour le rendu. */
export interface AgentSnapshot {
  id: number;
  species: "herbivore" | "carnivore" | "human";
  x: number;
  z: number;
  heading: number;
  state: AgentState;
  energy: number;
  hydration: number;
  /** Vitalité 0..1 — ne bouge que dans le duel loup ↔ humain (Phase 6). */
  health: number;
  /** true si ageSeconds ≥ adultAgeSeconds — calculé côté sim. */
  adult: boolean;
}

/**
 * Intention du joueur pour le tick courant (Phase 6). Le client l'envoie à chaque
 * frame (60 Hz) mais la sim ne tourne qu'à 20 Hz : `strike` et `interact` sont des
 * IMPULSIONS COLLANTES — le client les lève, la SIM les baisse en les consommant.
 * Sans ça, un clic tombé entre deux ticks serait perdu (ou compté deux fois).
 */
export interface PlayerIntent {
  /** Direction de déplacement en repère MONDE, normalisée. (0,0) = immobile. */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  strike: boolean;
  interact: boolean;
}

/** Tout ce dont le HUD a besoin, émis à chaque tick. */
export interface PlayerStatus {
  id: number;
  alive: boolean;
  energy: number;
  hydration: number;
  health: number;
  stamina: number;
  survivedSeconds: number;
  preyKilled: number;
  wolvesKilled: number;
  /** Loups qui te traquent en ce moment — la jauge de tension. */
  hunters: number;
}

/** Vue complète d'un agent, à la demande — pour l'inspecteur (débuggabilité). */
export interface AgentDetail extends AgentSnapshot {
  ageSeconds: number;
  memory: {
    hasWater: boolean; waterX: number; waterZ: number;
    hasFood: boolean; foodX: number; foodZ: number;
  };
  transitions: readonly Transition[];
}

/** État émis par la sim à chaque tick. Seul canal sim → rendu (architecture §2). */
export interface TickSnapshot {
  tickCount: number;
  simTimeSeconds: number;
  /** 0..1 : 0 = minuit, 0.25 = aube, 0.5 = midi, 0.75 = crépuscule. */
  timeOfDay: number;
  lastTickDurationMs: number;
  agents: AgentSnapshot[];
  /** null tant que le joueur n'est pas entré en jeu (Phase 6). */
  player: PlayerStatus | null;
}

/**
 * Frontière unique entre le rendu et la sim. Implémentations prévues :
 * main-thread (Phase 1-2), Web Worker (Phase 3), WebSocket distant (Phase 6).
 * NOTE : les getters statiques deviendront asynchrones en mode worker — assumé.
 */
export interface SimHost {
  update(nowMs: number): void;
  getConfig(): WorldConfig;
  getTerrainHeights(): Float32Array;
  getTerrainZones(): Uint8Array;
  getBiomass(): Float32Array;
  latestSnapshots(): readonly [TickSnapshot | null, TickSnapshot | null];
  /** Fraction [0,1) du tick courant déjà écoulée — pour interpoler prev→latest. */
  interpolationAlpha(): number;
  getAgentDetail(id: number): AgentDetail | null;
  setSpeed(multiplier: number): void;
  getSpeed(): number;
  /** Perturbations (Phase 5) : ajoute un agent au clic ; module la biomasse. */
  spawnAgent(species: "herbivore" | "carnivore" | "human", x: number, z: number): void;
  applyEnvironment(kind: "drought" | "abundance"): void;
  /** Phase 6 — incarnation. */
  setPlayerIntent(intent: PlayerIntent): void;
  /** Fait naître (ou renaître) l'humain du joueur, et en prend les commandes. */
  spawnPlayer(): void;
  /**
   * Prend ou lâche les commandes de l'humain courant (Tab). Lâché, il n'est PAS
   * supprimé : la FSM reprend la main et il continue de vivre en IA.
   */
  setPlayerControl(controlled: boolean): void;
}
