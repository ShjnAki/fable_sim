# Phase 6 — Incarnation & survie : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le joueur incarne un humain de la simulation — il se déplace, chasse,
dévore, boit, s'épuise, se fait mordre par les meutes et meurt — dans
l'écosystème vivant des phases 1 à 5.

**Architecture:** Le joueur est un `Agent` d'espèce `human` dont le `decide()` est
remplacé par une intention envoyée par le client (`SimHost.setPlayerIntent`). Le
bloc de mouvement partagé de `tickAgent` (glissement le long des berges, bornes,
orientation) est réutilisé tel quel. Spec :
`docs/superpowers/specs/2026-07-14-phase-6-incarnation-design.md`.

**Tech Stack:** identique (TS strict, Vitest, Three.js). **Aucune dépendance nouvelle.**

## Global Constraints

- TS strict. `packages/sim` et `packages/shared` : **aucun import DOM ni Three**.
- **Zéro allocation dans la boucle de tick** (objets scratch au niveau module).
- Tout tirage aléatoire passe par `world.rng` (déterminisme).
- Tick ≤ 3 ms à 600 agents (budget architecture §11).
- Commits au format `[Phase 6] description courte`.
- **GARDE-FOU NON NÉGOCIABLE :** la vitalité (`health`) et les morsures ne
  concernent **QUE** le duel loup ↔ humain. Le chemin **loup → herbivore reste la
  mise à mort instantanée de la Phase 4**. L'équilibre Lotka-Volterra tuné
  (`docs/tuning-phase4.md`) ne doit pas bouger : un test de non-régression et un
  test de déterminisme le vérifient (Task 3).
- Corollaire : `initialHumans` reste à `0`. Sans joueur ni humain, la simulation
  doit produire **exactement** les mêmes snapshots qu'avant cette phase.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `packages/shared/src/species.ts` | **Modifier** : `PLAYER` (params du joueur), champs de combat sur `CarnivoreParams` |
| `packages/shared/src/protocol.ts` | **Modifier** : `PlayerIntent`, `PlayerStatus`, `AgentSnapshot.health`, `TickSnapshot.player`, 3 commandes `SimHost` |
| `packages/sim/src/agentCore.ts` | **Créer** : opérations de base sur un agent — `applyTransition`, `kill`, `damage`, `preyEnergyValue`. Extraites de `agentTick.ts` pour que `player.ts` les réutilise **sans import circulaire** |
| `packages/sim/src/agent.ts` | **Modifier** : champs `health`, `controlled`, `daresHuman`, `mealLeft`, cooldowns ; `paramsOf` → `PLAYER` |
| `packages/sim/src/player.ts` | **Créer** : `spawnPlayer`, `setPlayerControl`, `tickPlayer` (déplacement, sprint, frappe, boire, dévorer) |
| `packages/sim/src/agentTick.ts` | **Modifier** : branche joueur, meutes qui osent l'humain (`daresHuman`), morsure au lieu du kill, cicatrisation |
| `packages/sim/src/world.ts` | **Modifier** : `playerId`, `playerIntent`, `playerStats`, `humanCount` ; `makeSnapshot` émet `player` et `health` |
| `packages/client/src/hosts/mainThreadHost.ts` | **Modifier** : les 3 nouvelles commandes |
| `packages/client/src/input/playerInput.ts` | **Créer** : clavier/souris → `PlayerIntent` (direction en repère monde) |
| `packages/client/src/render/playerCamera.ts` | **Créer** : caméra 3ᵉ personne (orbite, pointer lock, molette) |
| `packages/client/src/ui/hud.ts` | **Créer** : 4 jauges, invite contextuelle, écran de mort |
| `packages/client/src/main.ts` | **Modifier** : bascule jeu ↔ spectateur, envoi de l'intention |
| `packages/client/index.html` | **Modifier** : conteneur `#hud` |

---

### Task 1 : Shared — paramètres du joueur, du combat, et protocole

**Files:**
- Modify: `packages/shared/src/species.ts`
- Modify: `packages/shared/src/protocol.ts`

**Interfaces:**
- Produces: `PLAYER: PlayerParams`, `PlayerParams`, `PlayerIntent`, `PlayerStatus`,
  `AgentSnapshot.health`, `TickSnapshot.player`, et sur `SimHost` :
  `setPlayerIntent(i: PlayerIntent): void`, `spawnPlayer(): void`,
  `setPlayerControl(controlled: boolean): void`.
  Sur `CarnivoreParams` : `humanHuntPackMin`, `humanHuntPackMinNight`,
  `humanHuntPackRadius`, `biteDamage`, `biteCooldownSeconds`.

- [ ] **Step 1 : ajouter les champs de combat à `CarnivoreParams`**

Dans `packages/shared/src/species.ts`, à la fin de `interface CarnivoreParams` (juste avant l'accolade fermante) :

```ts
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
```

- [ ] **Step 2 : donner les valeurs à `CARNIVORE`**

Dans `packages/shared/src/species.ts`, à la fin de l'objet `CARNIVORE` (après `homingWeight: 0.35,`) :

```ts
  // Un loup SEUL n'ose pas l'humain ; il en faut 2 autour de lui. La nuit, un
  // seul compagnon suffit. 3 morsures tuent (0.34) ; à 1.5 s de cadence, une
  // meute de trois dévore un homme en ~5 s.
  humanHuntPackMin: 2, humanHuntPackMinNight: 1, humanHuntPackRadius: 35,
  biteDamage: 0.34, biteCooldownSeconds: 1.5,
```

- [ ] **Step 3 : ajouter `HUMAN` les mêmes champs (il est de type `HumanParams = CarnivoreParams`)**

Dans l'objet `HUMAN`, après `homingWeight: 0,` :

```ts
  // Inutilisés (l'humain n'est pas un loup) mais requis par le type.
  humanHuntPackMin: 0, humanHuntPackMinNight: 0, humanHuntPackRadius: 0,
  biteDamage: 0, biteCooldownSeconds: 0,
```

- [ ] **Step 4 : créer `PlayerParams` et `PLAYER`**

À la fin de `packages/shared/src/species.ts` :

```ts
/**
 * Le JOUEUR. L'humain IA (`HUMAN`) garde ses valeurs : il reste l'outil de
 * perturbation de la Phase 5. Le joueur, lui, est réglé pour le *game feel*.
 *
 * L'équation de la fuite : le loup sprinte à 12 m/s, le joueur à 11 — le loup
 * gagne 1 m/s. Depuis ses 45 m de portée de sprint il lui faudrait ~45 s pour
 * toucher, mais son souffle ne dure que 25 s : IL ABANDONNE AVANT. On ne fuit
 * pas par la vitesse, on fuit par le souffle (30 s pour le joueur).
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
```

- [ ] **Step 5 : protocole — intention, statut, snapshot**

Dans `packages/shared/src/protocol.ts`, ajouter avant `interface TickSnapshot` :

```ts
/**
 * Intention du joueur pour le tick courant. Le client l'envoie à chaque frame
 * (60 Hz) mais la sim ne tourne qu'à 20 Hz : `strike` et `interact` sont des
 * IMPULSIONS COLLANTES — le client les lève, la SIM les baisse en les
 * consommant. Sans ça, un clic serait perdu ou compté deux fois.
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
```

- [ ] **Step 6 : `AgentSnapshot.health` et `TickSnapshot.player`**

Dans `interface AgentSnapshot`, après `hydration: number;` :

```ts
  /** Vitalité 0..1 — ne bouge que dans le duel loup ↔ humain (spec §4). */
  health: number;
```

Dans `interface TickSnapshot`, après `agents: AgentSnapshot[];` :

```ts
  /** null tant que le joueur n'est pas entré en jeu. */
  player: PlayerStatus | null;
```

- [ ] **Step 7 : les 3 commandes sur `SimHost`**

Dans `interface SimHost`, après `applyEnvironment(...)` :

```ts
  /** Phase 6 — incarnation. */
  setPlayerIntent(intent: PlayerIntent): void;
  /** Fait naître (ou renaître) l'humain du joueur, et en prend les commandes. */
  spawnPlayer(): void;
  /**
   * Prend ou lâche les commandes de l'humain courant (Tab). Lâché, il n'est PAS
   * supprimé : la FSM reprend la main et il continue de vivre en IA.
   */
  setPlayerControl(controlled: boolean): void;
```

- [ ] **Step 8 : vérifier que shared compile**

Run: `pnpm --filter @eco/shared typecheck`
Expected: `Done` (0 erreur). `sim` et `client` casseront — c'est attendu, ils sont réparés aux tâches suivantes.

- [ ] **Step 9 : commit**

```bash
git add packages/shared/src/species.ts packages/shared/src/protocol.ts
git commit -m "[Phase 6] Shared : params PLAYER, combat loup/humain, protocole d'intention"
```

---

### Task 2 : Sim — agentCore, champs de l'agent, état du monde

Extraction d'`agentCore.ts` (pour éviter l'import circulaire `agentTick ↔ player`),
nouveaux champs d'agent, et **correction d'un vrai bug** : aujourd'hui un humain est
compté comme un carnivore.

**Files:**
- Create: `packages/sim/src/agentCore.ts`
- Modify: `packages/sim/src/agentTick.ts` (retirer les fonctions déplacées)
- Modify: `packages/sim/src/agent.ts`
- Modify: `packages/sim/src/world.ts`
- Test: `packages/sim/src/agent.test.ts`

**Interfaces:**
- Consumes: `PLAYER`, `PlayerIntent` (Task 1).
- Produces: `agentCore.ts` exporte `applyTransition(a, to, cause, tick)`,
  `kill(world, a, cause)`, `damage(world, a, amount, cause)`,
  `preyEnergyValue(prey)`. `Agent` gagne `health`, `lastDamageAgeSeconds`,
  `nextBiteAgeSeconds`, `nextStrikeAgeSeconds`, `controlled`, `daresHuman`,
  `mealLeft`. `World` gagne `playerId`, `playerIntent`, `playerStats`, `humanCount`.

- [ ] **Step 1 : écrire le test qui échoue**

Dans `packages/sim/src/agent.test.ts`, ajouter :

```ts
import { createRng } from "@eco/shared";
import { createHuman, paramsOf } from "./agent";
import { PLAYER, HUMAN } from "@eco/shared";

describe("Phase 6 — champs du joueur", () => {
  it("un agent naît en pleine vitalité, non contrôlé, avec un repas entier", () => {
    const a = createHuman(1, 0, 0, createRng("t"));
    expect(a.health).toBe(1);
    expect(a.controlled).toBe(false);
    expect(a.daresHuman).toBe(false);
    expect(a.mealLeft).toBe(1);
  });

  it("paramsOf renvoie PLAYER pour l'humain contrôlé, HUMAN sinon", () => {
    const a = createHuman(1, 0, 0, createRng("t"));
    expect(paramsOf(a)).toBe(HUMAN);
    a.controlled = true;
    expect(paramsOf(a)).toBe(PLAYER);
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @eco/sim test -- agent.test`
Expected: FAIL — `health` n'existe pas sur `Agent`.

- [ ] **Step 3 : créer `packages/sim/src/agentCore.ts`**

Copier depuis `agentTick.ts` les fonctions `kill`, `applyTransition`,
`preyEnergyValue` (les **supprimer** de `agentTick.ts`), et ajouter `damage` :

```ts
import type { AgentState } from "@eco/shared";
import { paramsOf, type Agent } from "./agent";
import type { World } from "./world";

/**
 * Opérations de base sur un agent : transition, mort, blessure, valeur nutritive.
 * Module séparé d'`agentTick` pour que `player.ts` les réutilise sans créer
 * d'import circulaire.
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
 * Blessure. N'est appelée QUE dans le duel loup ↔ humain (spec §4) : la
 * prédation loup → herbivore reste une mise à mort instantanée (Phase 4).
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
 * un boom de jeunes proies affame les prédateurs malgré l'abondance.
 */
export function preyEnergyValue(prey: Agent): number {
  return 0.7 + 0.3 * Math.min(1, prey.ageSeconds / paramsOf(prey).adultAgeSeconds);
}
```

- [ ] **Step 4 : brancher `agentTick.ts` sur `agentCore`**

Dans `packages/sim/src/agentTick.ts` : supprimer les définitions de `kill`,
`applyTransition`, `preyEnergyValue`, et ajouter en tête (après les autres imports) :

```ts
import { applyTransition, damage, kill, preyEnergyValue } from "./agentCore";

// Ré-export : `agentTick` reste la porte d'entrée publique de ces helpers
// (des tests et `index.ts` les importent déjà d'ici).
export { applyTransition, preyEnergyValue };
```

`damage` est importé ici pour la Task 3 ; si le linter proteste d'un import
inutilisé à ce stade, laisser la Task 3 le consommer immédiatement après.

- [ ] **Step 5 : nouveaux champs sur `Agent`**

Dans `packages/sim/src/agent.ts`, `interface Agent`, après `stamina: number;` :

```ts
  /**
   * Vitalité 0..1. Portée par TOUS les agents, mais lue/écrite UNIQUEMENT dans
   * le duel loup ↔ humain (spec §4) — la prédation des herbivores reste un
   * tue-au-contact, l'équilibre de la Phase 4 n'est pas touché.
   */
  health: number;
  /** Âge à la dernière blessure — la cicatrisation attend healthRegenDelaySeconds. */
  lastDamageAgeSeconds: number;
  /** Loup : âge avant lequel il ne peut pas mordre à nouveau. */
  nextBiteAgeSeconds: number;
  /** Joueur : âge avant lequel il ne peut pas frapper à nouveau. */
  nextStrikeAgeSeconds: number;
  /** true : le joueur tient les commandes — sa FSM est court-circuitée. */
  controlled: boolean;
  /** Loup : assez de congénères autour pour OSER s'en prendre à un humain. */
  daresHuman: boolean;
  /** Cadavre : part de repas restante (1 = entier). Consommée par le JOUEUR seul. */
  mealLeft: number;
```

Dans `createAgent`, après `stamina: 1, nextHuntAgeSeconds: 0,` :

```ts
    // NB : aucun tirage rng ici → l'ordre des tirages reste figé (déterminisme).
    health: 1, lastDamageAgeSeconds: -1e9,
    nextBiteAgeSeconds: 0, nextStrikeAgeSeconds: 0,
    controlled: false, daresHuman: false, mealLeft: 1,
```

- [ ] **Step 6 : `paramsOf` renvoie `PLAYER` pour l'humain contrôlé**

Dans `packages/sim/src/agent.ts` : ajouter `PLAYER` à l'import depuis `@eco/shared`, puis :

```ts
export function paramsOf(a: Agent): SpeciesParams {
  if (a.species === "herbivore") return HERBIVORE;
  if (a.species === "carnivore") return CARNIVORE;
  // Le joueur est réglé pour le game feel ; lâché, son corps redevient un
  // humain IA ordinaire (spec §2).
  return a.controlled ? PLAYER : HUMAN;
}
```

- [ ] **Step 7 : état du monde**

Dans `packages/sim/src/world.ts`, `interface World`, après `carnivoreCount: number;` :

```ts
  /** Effectif humain vivant (joueur compris). 0 → le coût du jeu est nul. */
  humanCount: number;
  /** Agent piloté par le joueur (null : personne n'est entré en jeu). */
  playerId: number | null;
  /** Intention du tick courant. La sim CONSOMME les impulsions strike/interact. */
  playerIntent: PlayerIntent;
  playerStats: { preyKilled: number; wolvesKilled: number; bornAtSeconds: number };
```

Importer `type PlayerIntent` depuis `@eco/shared`. Dans le `return` de `createWorld`, après `carnivoreCount: config.initialCarnivores,` :

```ts
    humanCount: config.initialHumans,
    playerId: null,
    playerIntent: { moveX: 0, moveZ: 0, sprint: false, strike: false, interact: false },
    playerStats: { preyKilled: 0, wolvesKilled: 0, bornAtSeconds: 0 },
```

- [ ] **Step 8 : corriger le comptage des espèces (bug réel)**

Dans `tickWorld` (`world.ts`), le compteur actuel range les **humains parmi les
carnivores** (`if (herbivore) herb++; else carn++;`) — inoffensif tant qu'il n'y a
aucun humain, mais faux dès que le joueur existe : il ferait croire à un carnivore
de plus et fausserait le refuge de rareté. Remplacer :

```ts
  let herb = 0, carn = 0, humans = 0;
  for (const a of world.agents) {
    if (a.state === "Dead") continue;
    if (a.species === "herbivore") herb++;
    else if (a.species === "carnivore") carn++;
    else humans++;
  }
  world.herbivoreCount = herb;
  world.carnivoreCount = carn;
  world.humanCount = humans;
```

Sans humain, `carn` est identique à avant → **déterminisme préservé**.

- [ ] **Step 9 : lancer les tests**

Run: `pnpm --filter @eco/sim test`
Expected: PASS — les 2 nouveaux tests passent ET les 106 existants aussi
(`makeSnapshot` ne compile pas encore `health`/`player` : si `typecheck` échoue,
c'est réparé en Task 4 ; les tests, eux, doivent passer).

- [ ] **Step 10 : commit**

```bash
git add packages/sim/src packages/shared/src
git commit -m "[Phase 6] Sim : agentCore (transition/mort/blessure), champs joueur, fix du comptage des humains"
```

---

### Task 3 : Sim — la menace : quand les loups osent (+ NON-RÉGRESSION Phase 4)

**Files:**
- Modify: `packages/sim/src/agentTick.ts`
- Test: `packages/sim/src/agentTick.test.ts`

**Interfaces:**
- Consumes: `damage` (Task 2), `CARNIVORE.humanHuntPack*`, `CARNIVORE.bite*` (Task 1).
- Produces: `a.daresHuman` renseigné par tick ; morsure sur les humains.

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `packages/sim/src/agentTick.test.ts` (adapter les helpers de création de monde
déjà présents dans ce fichier) :

```ts
describe("Phase 6 — les loups osent l'humain", () => {
  it("un loup SEUL ne prend jamais l'humain pour cible", () => {
    const w = createWorld({ initialHerbivores: 0, initialCarnivores: 0, initialHumans: 0 });
    const wolf = spawnAgentAt(w, "carnivore", 0, 0);
    const man = spawnAgentAt(w, "human", 5, 0);
    wolf.energy = 0.5; // affamé : il chasse
    for (let i = 0; i < 40; i++) tickWorld(w);
    expect(wolf.daresHuman).toBe(false);
    expect(man.state).not.toBe("Dead");
    expect(man.health).toBe(1);
  });

  it("trois loups groupés le chassent et le mordent (vitalité, pas mort nette)", () => {
    const w = createWorld({ initialHerbivores: 0, initialCarnivores: 0, initialHumans: 0 });
    const wolves = [
      spawnAgentAt(w, "carnivore", 0, 0),
      spawnAgentAt(w, "carnivore", 2, 0),
      spawnAgentAt(w, "carnivore", 0, 2),
    ];
    for (const wo of wolves) wo.energy = 0.5;
    const man = spawnAgentAt(w, "human", 6, 6);
    tickWorld(w);
    expect(wolves[0]!.daresHuman).toBe(true);
    // Une morsure blesse mais ne tue pas.
    tickWorld(w);
    for (let i = 0; i < 6 && man.health === 1; i++) tickWorld(w);
    expect(man.health).toBeLessThan(1);
    expect(man.health).toBeGreaterThan(0);
  });

  it("trois morsures tuent (cause « dévoré »)", () => {
    const w = createWorld({ initialHerbivores: 0, initialCarnivores: 0, initialHumans: 0 });
    const wolf = spawnAgentAt(w, "carnivore", 0, 0);
    const man = spawnAgentAt(w, "human", 1, 0);
    damage(w, man, CARNIVORE.biteDamage, "dévoré");
    damage(w, man, CARNIVORE.biteDamage, "dévoré");
    expect(man.state).not.toBe("Dead");
    damage(w, man, CARNIVORE.biteDamage, "dévoré");
    expect(man.state).toBe("Dead");
    expect(w.deaths["human:dévoré"]).toBe(1);
    expect(wolf.id).toBeGreaterThan(0); // le loup existe (garde le lint tranquille)
  });
});

describe("Phase 6 — NON-RÉGRESSION Phase 4", () => {
  it("loup → herbivore : mise à mort INSTANTANÉE, la vitalité n'entre pas en jeu", () => {
    const w = createWorld({ initialHerbivores: 0, initialCarnivores: 0, initialHumans: 0 });
    const wolf = spawnAgentAt(w, "carnivore", 0, 0);
    const deer = spawnAgentAt(w, "herbivore", 1, 0);
    wolf.energy = 0.5;
    for (let i = 0; i < 20 && deer.state !== "Dead"; i++) tickWorld(w);
    expect(deer.state).toBe("Dead");
    expect(deer.health).toBe(1); // il est mort SANS perdre un seul point de vie
    expect(w.deaths["herbivore:prédation"]).toBe(1);
  });

  it("sans joueur ni humain, la partie est IDENTIQUE à graine égale (équilibre intact)", () => {
    const run = () => {
      const w = createWorld({ seed: "regression-p6" });
      for (let i = 0; i < 600; i++) tickWorld(w);
      return makeSnapshot(w, 0).agents.map((a) => `${a.id}:${a.x.toFixed(6)}:${a.z.toFixed(6)}:${a.state}`);
    };
    expect(run()).toEqual(run());
    // Et la population n'est pas dégénérée : la sim tourne bien.
    const w = createWorld({ seed: "regression-p6" });
    for (let i = 0; i < 600; i++) tickWorld(w);
    expect(w.herbivoreCount).toBeGreaterThan(0);
    expect(w.humanCount).toBe(0);
  });
});
```

Imports à ajouter en tête du fichier de test : `damage` depuis `./agentCore`,
`CARNIVORE` depuis `@eco/shared`, `makeSnapshot`/`spawnAgentAt` depuis `./world`.

- [ ] **Step 2 : lancer, vérifier l'échec**

Run: `pnpm --filter @eco/sim test -- agentTick.test`
Expected: FAIL — `daresHuman` reste `false`, le loup ne mord pas l'humain.

- [ ] **Step 3 : compter la meute**

Dans `packages/sim/src/agentTick.ts`, à côté des autres compteurs à état module :

```ts
// Comptage de la meute autour d'un loup (oser l'humain) — état module, zéro alloc.
let packSeeker: Agent;
let packCount = 0;
function countPackMate(n: Agent): void {
  if (n.id !== packSeeker.id && n.species === "carnivore" && n.state !== "Dead") packCount++;
}
function countPack(world: World, a: Agent, r: number): number {
  packSeeker = a; packCount = 0;
  forEachNeighbor(world.grid, a.x, a.z, r, countPackMate);
  return packCount;
}
```

- [ ] **Step 4 : le loup décide s'il ose**

Dans `tickAgent`, branche carnivore (celle qui fait déjà `a.crowded = isCrowded(...)`),
juste avant `a.crowded = ...` :

```ts
    // Oser l'humain : il faut une meute (la nuit, moins de monde suffit).
    // COÛT NUL quand aucun humain n'existe : c'est le cas du harness, du test de
    // charge et de tous les runs de tuning (initialHumans = 0).
    a.daresHuman = world.humanCount > 0
      && countPack(world, a, CARNIVORE.humanHuntPackRadius)
         >= (world.isNight ? CARNIVORE.humanHuntPackMinNight : CARNIVORE.humanHuntPackMin);
```

- [ ] **Step 5 : l'humain devient une cible (et seulement lui)**

Remplacer `considerPrey` par (la branche herbivore reste **rigoureusement**
identique — c'est ce qui protège l'équilibre) :

```ts
function considerPrey(n: Agent): void {
  if (preySeeker.species === "human") {
    if (n.species === "human" || n.state === "Dead") return;
  } else if (n.species === "human") {
    // Phase 6 : un loup n'ose l'humain qu'en meute.
    if (!preySeeker.daresHuman || n.state === "Dead") return;
  } else if (n.species !== "herbivore") {
    return;
  }
  const dx = n.x - preySeeker.x, dz = n.z - preySeeker.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < preyBestD2) { preyBestD2 = d2; preyBest = n; }
}
```

- [ ] **Step 6 : mordre au lieu de tuer — mais SEULEMENT l'humain**

Dans le `case "Hunt"`, remplacer le bloc de mise à mort par :

```ts
      const hdx = prey.x - a.x, hdz = prey.z - a.z;
      if (hdx * hdx + hdz * hdz < pc.killDistance * pc.killDistance) {
        if (prey.species === "human") {
          // DUEL LOUP ↔ HUMAIN (spec §4) : morsure à points de vie. Le loup reste
          // en Hunt et remord après son cooldown. Le chemin herbivore ci-dessous
          // est INCHANGÉ : l'équilibre de la Phase 4 ne bouge pas.
          if (a.ageSeconds >= a.nextBiteAgeSeconds) {
            a.nextBiteAgeSeconds = a.ageSeconds + CARNIVORE.biteCooldownSeconds;
            damage(world, prey, CARNIVORE.biteDamage, "dévoré");
            if (prey.state === "Dead") {
              a.energy = Math.min(1, a.energy + pc.killEnergyGain * preyEnergyValue(prey));
              a.nextHuntAgeSeconds = a.ageSeconds + pc.huntCooldownSeconds;
              applyTransition(a, "Wander", "proie tuée", world.tickCount);
            }
          }
        } else if (rng() < herdEscapeChance(world, prey, pc)) {
          a.nextHuntAgeSeconds = a.ageSeconds + pc.huntRetrySeconds;
          applyTransition(a, "Wander", "proie échappée", world.tickCount);
          wander(a, rng, pc.maxSpeed, pc.maxForce, steer);
        } else {
          kill(world, prey, "prédation");
          a.energy = Math.min(1, a.energy + pc.killEnergyGain * preyEnergyValue(prey));
          a.nextHuntAgeSeconds = a.ageSeconds + pc.huntCooldownSeconds;
          applyTransition(a, "Wander", "proie tuée", world.tickCount);
        }
      }
```

L'ordre des tirages `rng()` n'est modifié que sur le chemin humain (inexistant
sans joueur) → déterminisme préservé.

- [ ] **Step 7 : cicatrisation**

Dans `tickAgent`, juste après le bloc de décroissance faim/soif et avant la
perception :

```ts
  // Cicatrisation : jamais pendant le combat. `a.health < 1` court-circuite
  // pour la quasi-totalité des agents → coût nul.
  if (a.health < 1 && a.ageSeconds - a.lastDamageAgeSeconds > PLAYER.healthRegenDelaySeconds) {
    a.health = Math.min(1, a.health + PLAYER.healthRegenPerSec * dt);
  }
```

Importer `PLAYER` depuis `@eco/shared`.

- [ ] **Step 8 : tests verts**

Run: `pnpm --filter @eco/sim test`
Expected: PASS — les 5 nouveaux tests **et** les 106 anciens.

- [ ] **Step 9 : commit**

```bash
git add packages/sim/src
git commit -m "[Phase 6] La meute ose l'humain : morsures à vitalité, prédation des herbivores intacte"
```

---

### Task 4 : Sim — le joueur joue

**Files:**
- Create: `packages/sim/src/player.ts`
- Modify: `packages/sim/src/agentTick.ts` (branche joueur)
- Modify: `packages/sim/src/world.ts` (`makeSnapshot`)
- Modify: `packages/sim/src/index.ts`
- Test: `packages/sim/src/player.test.ts`

**Interfaces:**
- Produces: `spawnPlayer(world): Agent`, `setPlayerControl(world, controlled): void`,
  `tickPlayer(a, world, dt, steer): PlayerOut` où
  `interface PlayerOut { speedCap: number; moving: boolean }`.

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `packages/sim/src/player.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { PLAYER } from "@eco/shared";
import { setPlayerControl, spawnPlayer } from "./player";
import { createWorld, makeSnapshot, spawnAgentAt, tickWorld } from "./world";

const EMPTY = { initialHerbivores: 0, initialCarnivores: 0, initialHumans: 0 };

describe("Phase 6 — le joueur", () => {
  it("spawnPlayer crée un humain adulte contrôlé et l'expose dans le snapshot", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    expect(p.species).toBe("human");
    expect(p.controlled).toBe(true);
    expect(w.playerId).toBe(p.id);
    tickWorld(w);
    const snap = makeSnapshot(w, 0);
    expect(snap.player?.id).toBe(p.id);
    expect(snap.player?.alive).toBe(true);
  });

  it("l'intention le déplace ; la FSM ne décide PAS pour lui", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    const x0 = p.x;
    w.playerIntent.moveX = 1; w.playerIntent.moveZ = 0;
    for (let i = 0; i < 20; i++) tickWorld(w);
    expect(p.x).toBeGreaterThan(x0);
    // Aucune décision de FSM : il n'est jamais parti chasser tout seul.
    expect(p.transitions.some((t) => t.to === "Hunt")).toBe(false);
  });

  it("le sprint vide l'endurance, le repos la recharge", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    w.playerIntent.moveX = 1; w.playerIntent.sprint = true;
    for (let i = 0; i < 100; i++) tickWorld(w);
    expect(p.stamina).toBeLessThan(1);
    const drained = p.stamina;
    w.playerIntent.sprint = false; w.playerIntent.moveX = 0;
    for (let i = 0; i < 40; i++) tickWorld(w);
    expect(p.stamina).toBeGreaterThan(drained);
  });

  it("frapper tue un herbivore et ne donne AUCUNE énergie : il faut dévorer", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    const deer = spawnAgentAt(w, "herbivore", p.x + 1, p.z);
    const e0 = p.energy;
    w.playerIntent.strike = true;
    tickWorld(w);
    expect(deer.state).toBe("Dead");
    expect(p.energy).toBeLessThanOrEqual(e0); // rien gagné (la faim a même baissé)
    expect(w.playerStats.preyKilled).toBe(1);
    expect(w.playerIntent.strike).toBe(false); // impulsion consommée
  });

  it("dévorer une carcasse remonte l'énergie et épuise le repas", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    p.energy = 0.3;
    const deer = spawnAgentAt(w, "herbivore", p.x + 1, p.z);
    w.playerIntent.strike = true;
    tickWorld(w);
    w.playerIntent.interact = true;
    for (let i = 0; i < 60; i++) tickWorld(w);
    expect(p.energy).toBeGreaterThan(0.3);
    expect(deer.mealLeft).toBeLessThan(1);
  });

  it("quatre coups abattent un loup", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    const wolf = spawnAgentAt(w, "carnivore", p.x + 1, p.z);
    for (let i = 0; i < 4; i++) {
      w.playerIntent.strike = true;
      tickWorld(w);
      p.nextStrikeAgeSeconds = 0; // on force le cooldown pour le test
    }
    expect(wolf.state).toBe("Dead");
    expect(w.playerStats.wolvesKilled).toBe(1);
  });

  it("setPlayerControl(false) rend la main à la FSM", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    setPlayerControl(w, false);
    expect(p.controlled).toBe(false);
    p.energy = 0.5; // affamé : la FSM doit l'envoyer chasser
    spawnAgentAt(w, "herbivore", p.x + 20, p.z);
    for (let i = 0; i < 30; i++) tickWorld(w);
    expect(p.transitions.some((t) => t.to === "Hunt")).toBe(true);
  });

  it("le joueur meurt de soif comme n'importe quel agent", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    p.hydration = 0.001;
    for (let i = 0; i < 40 && p.state !== "Dead"; i++) tickWorld(w);
    expect(p.state).toBe("Dead");
    expect(makeSnapshot(w, 0).player?.alive).toBe(false);
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run: `pnpm --filter @eco/sim test -- player.test`
Expected: FAIL — `./player` n'existe pas.

- [ ] **Step 3 : créer `packages/sim/src/player.ts`**

```ts
import { PLAYER } from "@eco/shared";
import { createHuman, type Agent } from "./agent";
import { applyTransition, damage, kill } from "./agentCore";
import { cellCenterX, cellCenterZ } from "./biomass";
import { seek, type SteerOut } from "./steering";
import { ZONE_GRASS } from "./terrain";
import type { World } from "./world";

/**
 * Le joueur (spec §2) : un `Agent` d'espèce `human` dont le `decide()` est
 * remplacé par une intention. Il traverse le MÊME bloc de mouvement que les
 * autres agents (glissement le long des berges, bornes, orientation) — il
 * hérite gratuitement de toute la physique de terrain déjà déboguée.
 */

export interface PlayerOut { speedCap: number; moving: boolean }
const playerOut: PlayerOut = { speedCap: 0, moving: true }; // scratch — zéro alloc

export function playerAgent(world: World): Agent | undefined {
  if (world.playerId === null) return undefined;
  return world.agents.find((a) => a.id === world.playerId);
}

function resetIntent(world: World): void {
  const i = world.playerIntent;
  i.moveX = 0; i.moveZ = 0; i.sprint = false; i.strike = false; i.interact = false;
}

/**
 * Fait naître (ou renaître) le joueur sur la cellule d'herbe la PLUS ÉLOIGNÉE du
 * loup le plus proche — on ne réapparaît pas dans la gueule d'une meute.
 * Scan O(cellules × loups), exécuté une fois par renaissance : négligeable.
 */
export function spawnPlayer(world: World): Agent {
  const { terrain, config } = world;
  let best = -1, bestD = -1;
  for (let i = 0; i < terrain.zones.length; i++) {
    if (terrain.zones[i] !== ZONE_GRASS) continue;
    const x = cellCenterX(config, i), z = cellCenterZ(config, i);
    let nearest = Infinity;
    for (const a of world.agents) {
      if (a.species !== "carnivore" || a.state === "Dead") continue;
      const dx = a.x - x, dz = a.z - z;
      nearest = Math.min(nearest, dx * dx + dz * dz);
    }
    if (nearest > bestD) { bestD = nearest; best = i; }
  }
  const sx = best < 0 ? 0 : cellCenterX(config, best);
  const sz = best < 0 ? 0 : cellCenterZ(config, best);

  // L'ancien corps, s'il vit encore, retourne à l'IA (il ne disparaît pas).
  const old = playerAgent(world);
  if (old && old.state !== "Dead") old.controlled = false;

  const a = createHuman(world.nextAgentId++, sx, sz, world.rng);
  a.controlled = true;
  a.ageSeconds = PLAYER.adultAgeSeconds; // on naît adulte
  world.agents.push(a);
  world.playerId = a.id;
  world.playerStats.preyKilled = 0;
  world.playerStats.wolvesKilled = 0;
  world.playerStats.bornAtSeconds = world.simTimeSeconds;
  resetIntent(world);
  return a;
}

/** Prend ou lâche les commandes. Lâché, le corps continue de vivre en IA. */
export function setPlayerControl(world: World, controlled: boolean): void {
  const a = playerAgent(world);
  if (!a || a.state === "Dead") return;
  a.controlled = controlled;
  if (!controlled) resetIntent(world);
}

/** Une rive est-elle à portée ? (scan linéaire des rives — appelé sur action.) */
function nearShore(world: World, a: Agent, r: number): boolean {
  const { terrain, config } = world;
  const r2 = r * r;
  for (let s = 0; s < terrain.shoreCells.length; s++) {
    const i = terrain.shoreCells[s]!;
    const dx = cellCenterX(config, i) - a.x, dz = cellCenterZ(config, i) - a.z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

/** Carcasse encore entamable la plus proche, à portée. */
function nearestCorpse(world: World, a: Agent, r: number): Agent | null {
  let best: Agent | null = null;
  let bestD2 = r * r;
  for (const n of world.agents) {
    if (n.state !== "Dead" || n.mealLeft <= 0 || !Number.isFinite(n.deadForSeconds)) continue;
    const dx = n.x - a.x, dz = n.z - a.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = n; }
  }
  return best;
}

/**
 * Frappe : touche l'agent vivant le plus proche dans strikeRange (pas de cône de
 * visée — compromis assumé, spec §12). Un cerf meurt d'un coup ; un loup encaisse
 * (4 coups à mains nues), et il rend les coups.
 */
function strike(a: Agent, world: World): void {
  if (a.ageSeconds < a.nextStrikeAgeSeconds) return;
  a.nextStrikeAgeSeconds = a.ageSeconds + PLAYER.strikeCooldownSeconds;
  let target: Agent | null = null;
  let bestD2 = PLAYER.strikeRange * PLAYER.strikeRange;
  for (const n of world.agents) {
    if (n.id === a.id || n.state === "Dead" || n.species === "human") continue;
    const dx = n.x - a.x, dz = n.z - a.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; target = n; }
  }
  if (!target) return;
  if (target.species === "carnivore") {
    damage(world, target, PLAYER.strikeDamageCarnivore, "abattu");
    if (target.state === "Dead") world.playerStats.wolvesKilled++;
  } else {
    // Le cerf ne se bat pas. AUCUNE énergie immédiate : il faut dévorer la
    // carcasse (spec §6) — et elle attire les loups.
    kill(world, target, "abattu");
    world.playerStats.preyKilled++;
  }
}

/** Action contextuelle : boire au bord de l'eau, sinon dévorer une carcasse. */
function beginInteract(a: Agent, world: World): void {
  if (nearShore(world, a, PLAYER.interactRange)) {
    applyTransition(a, "Drink", "boit", world.tickCount);
    return;
  }
  if (nearestCorpse(world, a, PLAYER.interactRange)) {
    applyTransition(a, "Eat", "dévore une carcasse", world.tickCount);
  }
}

/**
 * Un tick de joueur. Écrit `steer` et renvoie le cap de vitesse + s'il bouge ;
 * l'intégration du mouvement reste faite par `tickAgent` (code partagé).
 */
export function tickPlayer(a: Agent, world: World, dt: number, steer: SteerOut): PlayerOut {
  const i = world.playerIntent;
  playerOut.moving = true;
  playerOut.speedCap = PLAYER.maxSpeed;
  const wantsMove = i.moveX !== 0 || i.moveZ !== 0;

  // Impulsions : la sim les CONSOMME (le client tourne à 60 Hz, la sim à 20).
  if (i.strike) { i.strike = false; strike(a, world); }
  if (i.interact) { i.interact = false; beginInteract(a, world); }

  // Boire / dévorer : immobile. Bouger annule le repas.
  if (a.state === "Drink") {
    if (wantsMove || a.hydration >= PLAYER.stopDrinkAt) {
      applyTransition(a, "Wander", wantsMove ? "repas interrompu" : "désaltéré", world.tickCount);
    } else {
      a.hydration = Math.min(1, a.hydration + PLAYER.drinkPerSec * dt);
      a.vx = a.vz = 0;
      playerOut.moving = false;
      return playerOut;
    }
  } else if (a.state === "Eat") {
    const corpse = nearestCorpse(world, a, PLAYER.interactRange);
    if (wantsMove || !corpse || a.energy >= 1) {
      applyTransition(a, "Wander", corpse ? "repas interrompu" : "carcasse épuisée", world.tickCount);
    } else {
      const take = Math.min(PLAYER.eatCorpsePerSec * dt, corpse.mealLeft, 1 - a.energy);
      a.energy += take;
      corpse.mealLeft -= take;
      if (corpse.mealLeft <= 0) corpse.deadForSeconds = Infinity; // carcasse finie
      a.vx = a.vz = 0;
      playerOut.moving = false;
      return playerOut;
    }
  }

  // Endurance : le sprint la vide, tout le reste la recharge.
  if (i.sprint && wantsMove && a.stamina > 0) {
    a.stamina = Math.max(0, a.stamina - PLAYER.staminaDrainPerSec * dt);
    playerOut.speedCap = PLAYER.sprintSpeed;
  } else {
    a.stamina = Math.min(1, a.stamina + PLAYER.staminaRegenPerSec * dt);
  }

  if (wantsMove) {
    const len = Math.hypot(i.moveX, i.moveZ) || 1;
    seek(a, a.x + (i.moveX / len) * 10, a.z + (i.moveZ / len) * 10,
      playerOut.speedCap, PLAYER.maxForce, steer);
  } else {
    a.vx *= 0.6; a.vz *= 0.6; // freinage : sans ça l'inertie fait déraper
  }
  return playerOut;
}
```

- [ ] **Step 4 : brancher la branche joueur dans `tickAgent`**

Dans `packages/sim/src/agentTick.ts`, remplacer la structure
« décision puis `switch` » par une bifurcation. Concrètement :

1. **Déplacer** les déclarations `steer.ax = 0; steer.az = 0; let moving = true;
   let boidsMode: 0 | 1 | 2 = 0; let speedCap = p.maxSpeed;` **AVANT** le bloc de
   décision (elles sont aujourd'hui après).
2. Envelopper décision + `switch` + boids dans un `else`, et ajouter la branche
   joueur :

```ts
  steer.ax = 0; steer.az = 0;
  let moving = true;
  let boidsMode: 0 | 1 | 2 = 0;
  let speedCap = p.maxSpeed;

  if (a.controlled) {
    // LE JOUEUR : pas de perception, pas de decide(), pas de FSM (spec §2).
    const out = tickPlayer(a, world, dt, steer);
    speedCap = out.speedCap;
    moving = out.moving;
  } else {
    // ... tout le bloc existant : a.rare = ..., decide*(), if (d) applyTransition,
    //     switch (a.state) { ... }, puis le bloc boids ...
  }

  if (moving) {
    // ... bloc de mouvement existant, INCHANGÉ ...
  }
```

Importer `tickPlayer` depuis `./player`.

- [ ] **Step 5 : `makeSnapshot` émet la vitalité et le statut du joueur**

Dans `packages/sim/src/world.ts` :

```ts
/** Loups qui traquent le joueur en ce moment — la jauge de tension du HUD. */
function countHunters(world: World, player: Agent): number {
  let n = 0;
  for (const a of world.agents) {
    if (a.species !== "carnivore" || a.state !== "Hunt" || !a.daresHuman) continue;
    const dx = a.x - player.x, dz = a.z - player.z;
    if (dx * dx + dz * dz < CARNIVORE.huntCommitRadius ** 2) n++;
  }
  return n;
}

export function makeSnapshot(world: World, lastTickDurationMs: number): TickSnapshot {
  const p = world.playerId === null
    ? undefined
    : world.agents.find((a) => a.id === world.playerId);
  return {
    tickCount: world.tickCount,
    simTimeSeconds: world.simTimeSeconds,
    timeOfDay: timeOfDay(world),
    lastTickDurationMs,
    player: p
      ? {
        id: p.id,
        alive: p.state !== "Dead",
        energy: p.energy, hydration: p.hydration, health: p.health, stamina: p.stamina,
        survivedSeconds: world.simTimeSeconds - world.playerStats.bornAtSeconds,
        preyKilled: world.playerStats.preyKilled,
        wolvesKilled: world.playerStats.wolvesKilled,
        hunters: p.state === "Dead" ? 0 : countHunters(world, p),
      }
      : null,
    agents: world.agents.map((a) => ({
      id: a.id, species: a.species, x: a.x, z: a.z, heading: a.heading,
      state: a.state, energy: a.energy, hydration: a.hydration, health: a.health,
      adult: a.ageSeconds >= HERBIVORE.adultAgeSeconds,
    })),
  };
}
```

- [ ] **Step 6 : exporter `player.ts`**

Dans `packages/sim/src/index.ts`, ajouter : `export * from "./player";`

- [ ] **Step 7 : tests verts**

Run: `pnpm --filter @eco/sim test && pnpm --filter @eco/sim typecheck`
Expected: PASS — les 8 tests de `player.test.ts`, les 5 de la Task 3, les 106 anciens.

- [ ] **Step 8 : commit**

```bash
git add packages/sim/src
git commit -m "[Phase 6] Le joueur : intention, sprint, frappe, dévoration, boire, renaissance"
```

---

### Task 5 : Host — les 3 commandes du joueur

**Files:**
- Modify: `packages/client/src/hosts/mainThreadHost.ts`
- Test: `packages/client/src/hosts/mainThreadHost.test.ts`

**Interfaces:**
- Consumes: `spawnPlayer`, `setPlayerControl` (Task 4), `PlayerIntent` (Task 1).

- [ ] **Step 1 : écrire le test qui échoue**

Ajouter dans `packages/client/src/hosts/mainThreadHost.test.ts` :

```ts
it("spawnPlayer expose un joueur dans le snapshot, l'intention le déplace", () => {
  const host = createMainThreadHost({
    initialHerbivores: 0, initialCarnivores: 0, initialHumans: 0,
  });
  host.spawnPlayer();
  host.update(0);
  host.update(1000); // ~20 ticks
  const [, snap] = host.latestSnapshots();
  expect(snap?.player).not.toBeNull();
  const x0 = snap!.agents.find((a) => a.id === snap!.player!.id)!.x;

  host.setPlayerIntent({ moveX: 1, moveZ: 0, sprint: false, strike: false, interact: false });
  host.update(3000);
  const [, snap2] = host.latestSnapshots();
  const x1 = snap2!.agents.find((a) => a.id === snap2!.player!.id)!.x;
  expect(x1).toBeGreaterThan(x0);
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run: `pnpm --filter @eco/client test`
Expected: FAIL — `host.spawnPlayer` n'est pas une fonction.

- [ ] **Step 3 : implémenter**

Dans `packages/client/src/hosts/mainThreadHost.ts`, ajouter aux imports
`spawnPlayer, setPlayerControl` depuis `@eco/sim` et `type PlayerIntent` depuis
`@eco/shared`, puis dans l'objet retourné :

```ts
    setPlayerIntent(intent: PlayerIntent): void {
      // On RECOPIE dans l'objet du monde (jamais de remplacement de référence) :
      // la sim consomme les impulsions sur place, et on garde le zéro-alloc.
      const t = world.playerIntent;
      t.moveX = intent.moveX;
      t.moveZ = intent.moveZ;
      t.sprint = intent.sprint;
      // Impulsions COLLANTES : on ne les efface jamais ici, seule la sim les
      // consomme. Sinon un clic entre deux ticks serait perdu.
      if (intent.strike) t.strike = true;
      if (intent.interact) t.interact = true;
    },
    spawnPlayer(): void {
      spawnPlayer(world);
    },
    setPlayerControl(controlled: boolean): void {
      setPlayerControl(world, controlled);
    },
```

- [ ] **Step 4 : test vert**

Run: `pnpm --filter @eco/client test && pnpm --filter @eco/client typecheck`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add packages/client/src/hosts
git commit -m "[Phase 6] Host : setPlayerIntent, spawnPlayer, setPlayerControl"
```

---

### Task 6 : Client — caméra 3ᵉ personne & entrées

**Files:**
- Create: `packages/client/src/render/playerCamera.ts`
- Create: `packages/client/src/input/playerInput.ts`

**Interfaces:**
- Produces: `createPlayerCamera(camera, dom)` → `{ update(targetX, targetY, targetZ, dt), yaw(): number, setEnabled(b: boolean): void }` ;
  `createPlayerInput(dom)` → `{ intent(yaw: number): PlayerIntent, setEnabled(b: boolean): void }`.

- [ ] **Step 1 : `playerCamera.ts`**

```ts
import * as THREE from "three";

/**
 * Caméra 3ᵉ personne : orbite derrière l'épaule du joueur. La souris (pointer
 * lock) tourne, la molette éloigne. Elle suit une cible LISSÉE — sinon la caméra
 * tremble au rythme des ticks de sim (20 Hz) au lieu du rendu (60 FPS).
 */
export function createPlayerCamera(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
  let yaw = 0;
  let pitch = 0.35;          // radians au-dessus de l'horizon
  let distance = 9;
  let enabled = false;
  const follow = new THREE.Vector3();
  let hasFollow = false;

  function onMouseMove(e: MouseEvent): void {
    if (!enabled || document.pointerLockElement !== dom) return;
    yaw -= e.movementX * 0.0025;
    pitch = Math.min(1.2, Math.max(-0.2, pitch + e.movementY * 0.0025));
  }
  function onWheel(e: WheelEvent): void {
    if (!enabled) return;
    distance = Math.min(25, Math.max(4, distance + e.deltaY * 0.01));
  }
  document.addEventListener("mousemove", onMouseMove);
  dom.addEventListener("wheel", onWheel, { passive: true });

  return {
    setEnabled(b: boolean): void {
      enabled = b;
      if (b) void dom.requestPointerLock();
      else if (document.pointerLockElement === dom) document.exitPointerLock();
    },
    yaw: (): number => yaw,
    update(tx: number, ty: number, tz: number, dt: number): void {
      if (!enabled) return;
      if (!hasFollow) { follow.set(tx, ty, tz); hasFollow = true; }
      // Lissage exponentiel, indépendant du framerate.
      const k = 1 - Math.exp(-12 * dt);
      follow.x += (tx - follow.x) * k;
      follow.y += (ty - follow.y) * k;
      follow.z += (tz - follow.z) * k;
      const horiz = Math.cos(pitch) * distance;
      camera.position.set(
        follow.x - Math.sin(yaw) * horiz,
        follow.y + Math.sin(pitch) * distance + 1.5,
        follow.z - Math.cos(yaw) * horiz,
      );
      camera.lookAt(follow.x, follow.y + 1.2, follow.z);
    },
  };
}
```

- [ ] **Step 2 : `playerInput.ts`**

```ts
import type { PlayerIntent } from "@eco/shared";

/**
 * Clavier/souris → intention. La direction est convertie en repère MONDE ici
 * (le client a la caméra ; `packages/sim` reste sans DOM — architecture §2).
 * ZQSD et WASD sont acceptés tous les deux (clavier FR ou US).
 */
export function createPlayerInput(dom: HTMLElement) {
  const down = new Set<string>();
  let enabled = false;
  // Réutilisé à chaque frame : zéro allocation dans la boucle de rendu.
  const intent: PlayerIntent = {
    moveX: 0, moveZ: 0, sprint: false, strike: false, interact: false,
  };

  const onKeyDown = (e: KeyboardEvent): void => { down.add(e.code); };
  const onKeyUp = (e: KeyboardEvent): void => { down.delete(e.code); };
  const onMouseDown = (e: MouseEvent): void => {
    if (enabled && e.button === 0) intent.strike = true;
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  dom.addEventListener("mousedown", onMouseDown);

  return {
    setEnabled(b: boolean): void {
      enabled = b;
      if (!b) { down.clear(); intent.moveX = 0; intent.moveZ = 0; }
    },
    /** Intention du frame, en repère monde (yaw = orientation caméra). */
    intent(yaw: number): PlayerIntent {
      // Avant/arrière, gauche/droite dans le repère de la CAMÉRA…
      const fwd = (down.has("KeyW") || down.has("KeyZ") ? 1 : 0)
        - (down.has("KeyS") ? 1 : 0);
      const right = (down.has("KeyD") ? 1 : 0)
        - (down.has("KeyA") || down.has("KeyQ") ? 1 : 0);
      // … projetés en repère MONDE : la caméra regarde vers (sin yaw, cos yaw).
      intent.moveX = fwd * Math.sin(yaw) + right * Math.cos(yaw);
      intent.moveZ = fwd * Math.cos(yaw) - right * Math.sin(yaw);
      intent.sprint = down.has("ShiftLeft") || down.has("ShiftRight");
      if (down.has("KeyE")) intent.interact = true;
      return intent;
    },
    /** À appeler APRÈS l'envoi : les impulsions ne valent qu'un frame côté client. */
    clearImpulses(): void {
      intent.strike = false;
      intent.interact = false;
    },
  };
}
```

- [ ] **Step 3 : typecheck**

Run: `pnpm --filter @eco/client typecheck`
Expected: `Done` (les deux fichiers ne sont pas encore utilisés — c'est normal).

- [ ] **Step 4 : commit**

```bash
git add packages/client/src/render/playerCamera.ts packages/client/src/input/playerInput.ts
git commit -m "[Phase 6] Client : caméra 3e personne, entrées clavier/souris"
```

---

### Task 7 : Client — HUD & bascule jeu / spectateur

**Files:**
- Create: `packages/client/src/ui/hud.ts`
- Modify: `packages/client/index.html`
- Modify: `packages/client/src/main.ts`

**Interfaces:**
- Consumes: `createPlayerCamera`, `createPlayerInput` (Task 6), `TickSnapshot.player` (Task 1).

- [ ] **Step 1 : conteneur HUD dans `index.html`**

Ajouter, à côté des conteneurs existants (`#overlay`, `#inspector`, `#tools`…) :

```html
    <div id="hud"></div>
```

Et dans la feuille de style existante :

```css
    #hud {
      position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%);
      display: none; flex-direction: column; gap: 6px; width: 320px;
      font: 12px/1.4 ui-monospace, monospace; color: #fff;
      text-shadow: 0 1px 2px #0008; pointer-events: none;
    }
    #hud.on { display: flex; }
    #hud .bar { height: 10px; background: #0006; border-radius: 5px; overflow: hidden; }
    #hud .bar > i { display: block; height: 100%; width: 0; transition: width .1s linear; }
    #hud .hint { text-align: center; opacity: .85; }
    #hud .danger { text-align: center; color: #ff6b5e; font-weight: bold; }
    #death {
      position: fixed; inset: 0; display: none; place-items: center;
      background: #000a; color: #fff; font: 16px/1.6 ui-monospace, monospace;
      text-align: center; z-index: 10;
    }
    #death.on { display: grid; }
    #death button {
      margin-top: 14px; padding: 8px 18px; font: inherit; cursor: pointer;
      background: #e8c65c; border: 0; border-radius: 6px; color: #222;
    }
```

Ajouter aussi `<div id="death"></div>` dans le body.

- [ ] **Step 2 : `packages/client/src/ui/hud.ts`**

```ts
import type { PlayerStatus } from "@eco/shared";

const GAUGES = [
  { key: "health", label: "vitalité", color: "#e05a4f" },
  { key: "energy", label: "faim", color: "#7ec850" },
  { key: "hydration", label: "soif", color: "#4fa8e0" },
  { key: "stamina", label: "souffle", color: "#e8c65c" },
] as const;

/** HUD de survie : 4 jauges, invite contextuelle, écran de mort. */
export function createHud(root: HTMLDivElement, death: HTMLDivElement, onRespawn: () => void) {
  const fills = new Map<string, HTMLElement>();
  for (const g of GAUGES) {
    const row = document.createElement("div");
    row.textContent = g.label;
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("i");
    fill.style.background = g.color;
    bar.appendChild(fill);
    root.appendChild(row);
    root.appendChild(bar);
    fills.set(g.key, fill);
  }
  const danger = document.createElement("div");
  danger.className = "danger";
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "ZQSD bouger · Maj sprint · clic frapper · E boire/dévorer · Tab spectateur";
  root.appendChild(danger);
  root.appendChild(hint);

  let wasAlive = true;

  return {
    setVisible(v: boolean): void { root.classList.toggle("on", v); },
    update(p: PlayerStatus | null): void {
      if (!p) return;
      for (const g of GAUGES) {
        fills.get(g.key)!.style.width = `${Math.max(0, Math.min(1, p[g.key])) * 100}%`;
      }
      danger.textContent = p.hunters > 0
        ? `⚠ ${p.hunters} loup${p.hunters > 1 ? "s" : ""} te traque${p.hunters > 1 ? "nt" : ""} !`
        : "";
      if (!p.alive && wasAlive) {
        death.innerHTML = "";
        const box = document.createElement("div");
        box.innerHTML = `<div style="font-size:22px">Tu es mort.</div>
          <div>Survécu ${Math.round(p.survivedSeconds)} s ·
          ${p.preyKilled} proie(s) · ${p.wolvesKilled} loup(s) abattu(s)</div>`;
        const btn = document.createElement("button");
        btn.textContent = "Renaître";
        btn.onclick = () => { death.classList.remove("on"); onRespawn(); };
        box.appendChild(btn);
        death.appendChild(box);
        death.classList.add("on");
      }
      wasAlive = p.alive;
    },
  };
}
```

- [ ] **Step 3 : brancher dans `main.ts`**

Ajouter les imports (`createHud`, `createPlayerCamera`, `createPlayerInput`), puis
après la création de `controls` :

```ts
const playerCam = createPlayerCamera(camera, renderer.domElement);
const playerInput = createPlayerInput(renderer.domElement);
const hud = createHud(
  document.querySelector<HTMLDivElement>("#hud")!,
  document.querySelector<HTMLDivElement>("#death")!,
  () => host.spawnPlayer(),
);

// Deux modes : jeu (incarnation) et spectateur (la caméra libre + les outils
// Phase 5, intacts). Tab bascule.
let playing = false;
function setPlaying(on: boolean): void {
  playing = on;
  hud.setVisible(on);
  playerCam.setEnabled(on);
  playerInput.setEnabled(on);
  cameraControls.setEnabled?.(!on);
  host.setPlayerControl(on);
  if (on && host.latestSnapshots()[1]?.player == null) host.spawnPlayer();
}
window.addEventListener("keydown", (e) => {
  if (e.code === "Tab") { e.preventDefault(); setPlaying(!playing); }
});
if (urlParams.has("play")) setPlaying(true);
```

Si `cameraControls` n'expose pas `setEnabled`, l'ajouter dans
`packages/client/src/render/cameraControls.ts` (un booléen qui court-circuite
`update()` et les écouteurs de souris) — **c'est nécessaire** : sans ça, la caméra
libre continue de réagir au clavier pendant le jeu.

Dans la boucle de rendu, après `agentsMesh.update(...)` :

```ts
  if (playing && snapshot?.player) {
    // On envoie l'intention à CHAQUE frame ; la sim consomme les impulsions.
    host.setPlayerIntent(playerInput.intent(playerCam.yaw()));
    playerInput.clearImpulses();
    const me = snapshot.agents.find((a) => a.id === snapshot.player!.id);
    if (me) {
      const y = sampleHeight(terrain, config, me.x, me.z);
      playerCam.update(me.x, y, me.z, frameMs / 1000);
    }
    hud.update(snapshot.player);
  }
```

Le clic gauche du canevas ne doit **pas** déclencher l'outil Phase 5 en mode jeu :
dans le `pointerdown` existant, ajouter en première ligne `if (playing) return;`.

Importer `sampleHeight` depuis `@eco/sim` (il est déjà exporté par `terrain.ts`).
Et remplacer `cameraControls.update(...)` par `if (!playing) cameraControls.update(frameMs / 1000);`.

- [ ] **Step 4 : typecheck + build**

Run: `pnpm --filter @eco/client typecheck && pnpm --filter @eco/client build`
Expected: `Done`, build OK.

- [ ] **Step 5 : vérification navigateur (UN SEUL serveur Vite à la fois)**

Run: `pnpm dev --host` puis ouvrir `http://<ip-wsl>:5173/?play`

Vérifier, dans l'ordre :
1. La caméra est derrière le personnage ; ZQSD le déplace **relativement à la caméra**.
2. `Maj` sprinte : la jauge « souffle » descend, puis remonte au repos.
3. Un clic sur un cerf au contact le tue → **carcasse** ; `E` dessus → la jauge
   « faim » remonte.
4. `E` au bord de l'eau → la jauge « soif » remonte.
5. Spawner 3 loups en mode spectateur (`Tab`, pinceau) près du joueur, revenir en
   jeu : ils attaquent, la vitalité descend, **l'écran de mort s'affiche**.
6. « Renaître » → nouveau corps, le monde a continué.
7. `Tab` → mode spectateur : les outils Phase 5 fonctionnent toujours, et
   **l'humain lâché continue de vivre tout seul** (il chasse).

- [ ] **Step 6 : commit**

```bash
git add packages/client
git commit -m "[Phase 6] Client : HUD de survie, écran de mort, bascule jeu/spectateur"
```

---

### Task 8 : Clôture

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1 : suite complète**

Run: `pnpm test && pnpm typecheck`
Expected: tous verts (≈ 130 tests).

- [ ] **Step 2 : perf — le budget n'a pas bougé**

Run: `pnpm --filter @eco/sim test -- perf.test`
Expected: PASS, tick ≤ 3 ms à 600 agents. Le comptage de meute est inactif
(`humanCount === 0`) — si le tick a dérivé, le dire explicitement dans PROGRESS.md
plutôt que de laisser filer (règle CLAUDE.md §5).

- [ ] **Step 3 : l'équilibre de la Phase 4 est intact**

Run: `pnpm harness hours=1 seed=fable-1`
Expected: verdict identique à celui d'avant la phase (`docs/tuning-phase4.md`) —
aucun humain n'existe dans le harness, donc **les chiffres doivent être les mêmes**.
Si ce n'est pas le cas, c'est une régression : ne pas clore la phase.

- [ ] **Step 4 : PROGRESS.md**

Mettre à jour « État actuel » (Phase 6 livrée), ajouter la section Phase 6 à
l'historique, et ajouter aux « Paramètres à tuner » le bloc `PLAYER` +
les params de combat de `CARNIVORE`, en notant que **l'équilibre du jeu (fuite,
morsures, coups) n'est PAS tuné** — c'est le premier retour d'usage attendu de Shin.

Ajouter aux « Points fragiles » :
- vitalité asymétrique (loups à PV face au joueur, tue-au-contact face aux cerfs) ;
- frappe sans cône de visée ;
- pas d'animation de personnage (pas de skinning — architecture §9) ;
- sprint du joueur à 11 m/s : irréaliste, choix de game feel assumé.

- [ ] **Step 5 : commit + push**

```bash
git add -A
git commit -m "[Phase 6] Clôture : incarnation & survie livrées"
git push
```

---

## Self-review

**Couverture de la spec :**
- §2 le joueur est un Agent → T2 (champs), T4 (tickPlayer, branche `controlled`).
- §3 contrôles & caméra → T6 ; bascule Tab + outils Phase 5 intacts → T7.
- §4 vitalité & garde-fou Phase 4 → T2 (`damage`), T3 (morsure humaine seule,
  test de non-régression + test de déterminisme).
- §5 quand les loups osent → T3 (`daresHuman`, seuil nocturne, coût nul sans humain).
- §6 boucle chasser/tuer/dévorer + boire → T4 (`strike`, `beginInteract`, `mealLeft`).
- §7 mort & renaissance → T4 (`spawnPlayer`), T7 (écran de mort).
- §8 protocole & SimHost → T1, T5.
- §9 client → T6, T7.
- §10 tests → T2 (2), T3 (5, dont non-régression), T4 (8), T5 (1).
- §11 paramètres → T1.

**Cohérence des types entre tâches :** `PlayerOut { speedCap, moving }` (T4) est
consommé par `tickAgent` (T4 step 4) ; `playerInput.intent(yaw)` (T6) alimente
`host.setPlayerIntent` (T5) ; `snapshot.player: PlayerStatus | null` (T1) est lu
par `hud.update` (T7). `PLAYER` (T1) est lu par `paramsOf` (T2), `tickPlayer` (T4)
et la cicatrisation (T3).

**Risques identifiés :**
- `cameraControls` n'a peut-être pas de `setEnabled` → T7 step 3 l'exige explicitement.
- La restructuration de `tickAgent` (T4 step 4) déplace des déclarations : c'est le
  seul endroit où une erreur casserait les 106 tests existants — ils sont le filet.
- `Tab` est intercepté par le navigateur (focus) → `preventDefault()` est prévu.
