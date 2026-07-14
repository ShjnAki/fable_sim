# Phase 4 — Chaîne trophique : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carnivores, chasse à l'endurance, fuite des proies, harness headless —
et l'équilibre Lotka-Volterra : ≥ 2 h de sim sans extinction ni explosion.

**Architecture:** Conforme au spec validé
(`docs/superpowers/specs/2026-07-14-phase-4-chaine-trophique-design.md`).
`SpeciesParams` commun + params par espèce ; perception de menace écrite sur
l'agent AVANT `decide()` (qui reste pure) ; deux fonctions de décision ;
vitesses plafonnées par état (sprint/fuite) ; harness = logique testable dans
`src/headless.ts`, script `scripts/harness.ts` lancé par vite-node.

**Tech Stack:** identique. UNE devDependency nouvelle : `vite-node` dans
`@eco/sim` (le binaire n'est pas exposé par Vitest via pnpm — fallback prévu
et validé au spec).

## Global Constraints

- TS strict ; `sim`/`shared` sans DOM/Three ; tout tirage via `world.rng` ;
  zéro allocation dans la boucle de tick (état module pour les callbacks).
- Commits `[Phase 4] …` atomiques ; budget tick ≤ 3 ms.
- Ordre FSM figé (architecture §7) : `fuir > soif critique > faim critique >
  boire > manger/chasser > se reproduire > errer`. `decide*()` pures, jamais
  Drink/Eat en retour, SeekMate/Hunt proposés selon les règles du spec.
- Déterminisme : ordre des tirages rng dans les factories figé (wanderAngle
  PUIS maxAge) ; itération grille stable ; naissances en fin de tableau.
- **La Task 8 (tuning) est le livrable de la phase** : les valeurs d'espèce
  sont des points de départ, le harness tranche. Chaque itération de tuning
  est consignée (voir Task 8) — pas de tâtonnement silencieux.

---

### Task 1 : Shared — SpeciesParams/CarnivoreParams, états Flee/Hunt, species dans le snapshot

**Files:**
- Modify: `packages/shared/src/species.ts` (refonte), `packages/shared/src/protocol.ts`,
  `packages/shared/src/config.ts`
- Modify: `packages/sim/src/world.ts` (makeSnapshot), `packages/sim/src/world.test.ts`

**Interfaces:**
- Produces (consommé par tout le reste) :
```ts
// species.ts
export interface SpeciesParams { /* tronc commun — voir Step 2 */ }
export interface HerbivoreParams extends SpeciesParams { /* + manger, boids, fuite */ }
export interface CarnivoreParams extends SpeciesParams { /* + chasse */ }
export const HERBIVORE: HerbivoreParams; export const CARNIVORE: CarnivoreParams;
// protocol.ts
export type AgentState = ... | "Flee" | "Hunt";
// AgentSnapshot gagne : species: "herbivore" | "carnivore";
// config.ts : WorldConfig gagne initialCarnivores: number (défaut 4)
```

- [ ] **Step 1 : Test (rouge)**

Ajouter à `packages/sim/src/world.test.ts` (describe existant) :
```ts
  it("le snapshot expose l'espèce", () => {
    const w = createWorld();
    expect(makeSnapshot(w, 0).agents[0]!.species).toBe("herbivore");
  });
```
Et créer `packages/shared/src/species.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { CARNIVORE, HERBIVORE } from "./species";

describe("cohérence des paramètres d'espèces", () => {
  it("le sprint du carnivore dépasse la fuite à pleine énergie", () => {
    expect(CARNIVORE.sprintSpeed).toBeGreaterThan(HERBIVORE.maxSpeed * HERBIVORE.fleeBoost);
  });
  it("la fuite d'un affamé est plus lente que le sprint", () => {
    expect(HERBIVORE.maxSpeed * HERBIVORE.fleeBoost * 0.7).toBeLessThan(CARNIVORE.sprintSpeed);
  });
  it("l'hystérésis de fuite est cohérente", () => {
    expect(HERBIVORE.fleeSafeRadius).toBeGreaterThan(HERBIVORE.fleeTriggerRadius);
  });
});
```
Run : `pnpm --filter @eco/shared test && pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter**

`packages/shared/src/species.ts` — REMPLACER le contenu par :
```ts
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
  sprintSpeed: number;           // m/s en Hunt — vide la stamina
  staminaDrainPerSec: number;
  staminaRegenPerSec: number;
  killEnergyGain: number;        // énergie gagnée par proie
  killDistance: number;          // m — distance de mise à mort
  huntCooldownSeconds: number;   // digestion après un kill
  huntRetrySeconds: number;      // délai après un abandon (épuisé / aucune proie)
}

export const HERBIVORE: HerbivoreParams = {
  maxSpeed: 4, maxForce: 6, perceptionRadius: 60,
  energyDecayPerSec: 1 / 150, hydrationDecayPerSec: 1 / 100, drinkPerSec: 0.15,
  criticalNeed: 0.25, seekWaterBelow: 0.5, stopDrinkAt: 0.95,
  adultAgeSeconds: 45, mateEnergyMin: 0.75, mateHydrationMin: 0.6,
  mateEnergyCost: 0.35, mateCooldownSeconds: 60, mateRetrySeconds: 10,
  maxAgeSeconds: 600, maxAgeVarianceSeconds: 120, corpseDespawnSeconds: 10,
  eatEnergyPerSec: 0.08, eatBiomassPerSec: 0.2,
  seekFoodBelow: 0.6, stopEatAt: 0.9, minFoodBiomass: 0.25,
  boidsRadius: 8, separationWeight: 1.2, alignmentWeight: 0.4, cohesionWeight: 0.35,
  fleeTriggerRadius: 20, fleeSafeRadius: 35, fleeBoost: 1.4,
};

export const CARNIVORE: CarnivoreParams = {
  maxSpeed: 3.5, maxForce: 7, perceptionRadius: 70,
  energyDecayPerSec: 1 / 220, hydrationDecayPerSec: 1 / 120, drinkPerSec: 0.15,
  criticalNeed: 0.25, seekWaterBelow: 0.45, stopDrinkAt: 0.95,
  adultAgeSeconds: 60, mateEnergyMin: 0.7, mateHydrationMin: 0.55,
  mateEnergyCost: 0.45, mateCooldownSeconds: 120, mateRetrySeconds: 12,
  maxAgeSeconds: 800, maxAgeVarianceSeconds: 150, corpseDespawnSeconds: 12,
  huntBelow: 0.65, sprintSpeed: 7,
  staminaDrainPerSec: 1 / 6, staminaRegenPerSec: 1 / 20,
  killEnergyGain: 0.55, killDistance: 1.5,
  huntCooldownSeconds: 25, huntRetrySeconds: 8,
};
```
NOTE : les champs de `HERBIVORE` sont EXACTEMENT ceux d'avant (mêmes valeurs),
réordonnés + 3 champs de fuite. Rien d'autre ne change de sens.

`packages/shared/src/protocol.ts` :
```ts
export type AgentState =
  "Wander" | "SeekWater" | "Drink" | "SeekFood" | "Eat"
  | "SeekMate" | "Flee" | "Hunt" | "Dead";
```
et dans `AgentSnapshot`, après `id: number;` :
```ts
  species: "herbivore" | "carnivore";
```

`packages/shared/src/config.ts` — dans `WorldConfig` après `initialHerbivores` :
```ts
  /** Nombre de carnivores au démarrage du monde. */
  initialCarnivores: number;
```
et `initialCarnivores: 4,` dans `DEFAULT_WORLD_CONFIG`.

`packages/sim/src/world.ts` — dans le map de `makeSnapshot`, après `id: a.id,` :
```ts
      species: a.species,
```

- [ ] **Step 3 : Vert + typecheck + commit**

```bash
pnpm test && pnpm typecheck
git add packages/shared/src packages/sim/src
git commit -m "[Phase 4] SpeciesParams/CarnivoreParams, états Flee/Hunt, species au protocole"
```

---

### Task 2 : Agent — champs Phase 4, createCarnivore, paramsOf

**Files:**
- Modify: `packages/sim/src/agent.ts`
- Test: `packages/sim/src/agent.test.ts` (ajouts)

**Interfaces:**
- Produces :
```ts
// Agent gagne : stamina: number; nextHuntAgeSeconds: number;
//               hasThreat: boolean; threatX: number; threatZ: number;
// species: "herbivore" | "carnivore" (élargi)
export function createCarnivore(id: number, x: number, z: number, rng: Rng): Agent;
export function paramsOf(a: Agent): SpeciesParams; // HERBIVORE ou CARNIVORE
```

- [ ] **Step 1 : Tests (rouge)**

Ajouter à `packages/sim/src/agent.test.ts` :
```ts
describe("carnivore", () => {
  it("createCarnivore initialise un carnivore déterministe", () => {
    const a = createCarnivore(9, 1, 2, createRng("c"));
    const b = createCarnivore(9, 1, 2, createRng("c"));
    expect(a).toEqual(b);
    expect(a.species).toBe("carnivore");
    expect(a.stamina).toBe(1);
    expect(a.state).toBe("Wander");
  });
  it("paramsOf route vers les bons paramètres", () => {
    const h = createHerbivore(1, 0, 0, createRng("h"));
    const c = createCarnivore(2, 0, 0, createRng("c"));
    expect(paramsOf(h)).toBe(HERBIVORE);
    expect(paramsOf(c)).toBe(CARNIVORE);
  });
});
```
(imports : `createCarnivore`, `paramsOf` depuis `./agent` ; `CARNIVORE`,
`HERBIVORE` depuis `@eco/shared`.)
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter**

`packages/sim/src/agent.ts` :
- Import : ajouter `CARNIVORE` et `type SpeciesParams` à l'import `@eco/shared`.
- `species: "herbivore";` devient `species: "herbivore" | "carnivore";`
- Après `nextMateAgeSeconds` dans l'interface :
```ts
  /** 0..1 — vidée par le sprint de chasse, rechargée hors Hunt (carnivores). */
  stamina: number;
  /** Âge avant lequel pas de chasse (digestion après kill, retry après abandon). */
  nextHuntAgeSeconds: number;
  /** Menace perçue — écrite par tickAgent AVANT decide (decide reste pure). */
  hasThreat: boolean;
  threatX: number;
  threatZ: number;
```
- Remplacer `createHerbivore` par une factory commune + deux façades :
```ts
function createAgent(
  species: "herbivore" | "carnivore", p: SpeciesParams,
  id: number, x: number, z: number, rng: Rng,
): Agent {
  return {
    id, species, x, z, vx: 0, vz: 0, heading: 0,
    energy: 0.8, hydration: 0.8, ageSeconds: 0,
    state: "Wander", deadForSeconds: 0,
    // ORDRE DES TIRAGES FIGÉ (déterminisme) : wanderAngle PUIS maxAge.
    wanderAngle: rng() * Math.PI * 2,
    maxAgeSeconds: p.maxAgeSeconds + (rng() * 2 - 1) * p.maxAgeVarianceSeconds,
    nextMateAgeSeconds: 0,
    stamina: 1, nextHuntAgeSeconds: 0,
    hasThreat: false, threatX: 0, threatZ: 0,
    hasTarget: false, targetX: 0, targetZ: 0,
    memory: { hasWater: false, waterX: 0, waterZ: 0, hasFood: false, foodX: 0, foodZ: 0 },
    transitions: [],
  };
}

export function createHerbivore(id: number, x: number, z: number, rng: Rng): Agent {
  return createAgent("herbivore", HERBIVORE, id, x, z, rng);
}

export function createCarnivore(id: number, x: number, z: number, rng: Rng): Agent {
  return createAgent("carnivore", CARNIVORE, id, x, z, rng);
}

export function paramsOf(a: Agent): SpeciesParams {
  return a.species === "herbivore" ? HERBIVORE : CARNIVORE;
}
```

- [ ] **Step 3 : Vert + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck
git add packages/sim/src
git commit -m "[Phase 4] Agent : stamina, menace, createCarnivore, paramsOf"
```

---

### Task 3 : Décision — decideHerbivore (+Flee) et decideCarnivore

**Files:**
- Modify: `packages/sim/src/decide.ts`, `packages/sim/src/agentTick.ts`
  (renommage de l'appel), `packages/sim/src/decide.test.ts`

**Interfaces:**
- Produces :
```ts
export function decideHerbivore(a: Agent, p: HerbivoreParams): Decision | null; // ex-decide
export function decideCarnivore(a: Agent, p: CarnivoreParams): Decision | null;
// isMateEligible inchangé (SpeciesParams suffit) — signature :
export function isMateEligible(a: Agent, p: SpeciesParams): boolean;
```

- [ ] **Step 1 : Tests (rouge)**

Dans `packages/sim/src/decide.test.ts` : remplacer tous les `decide(` par
`decideHerbivore(` (import compris), puis ajouter :
```ts
describe("decideHerbivore — fuite", () => {
  it("une menace interrompt tout, même la soif critique", () => {
    const a = mk();
    a.state = "SeekWater"; a.hydration = 0.1;
    a.hasThreat = true;
    expect(decideHerbivore(a, HERBIVORE)).toEqual({ state: "Flee", cause: "prédateur !" });
  });
  it("en fuite avec menace : on ne pense à rien d'autre", () => {
    const a = mk();
    a.state = "Flee"; a.hasThreat = true; a.hydration = 0.1; a.energy = 0.1;
    expect(decideHerbivore(a, HERBIVORE)).toBeNull();
  });
  it("menace écartée : retour à l'errance", () => {
    const a = mk();
    a.state = "Flee"; a.hasThreat = false;
    expect(decideHerbivore(a, HERBIVORE)?.cause).toBe("danger écarté");
  });
});

describe("decideCarnivore", () => {
  const mkc = () => createCarnivore(1, 0, 0, createRng("dc"));

  it("la soif critique interrompt la chasse", () => {
    const a = mkc();
    a.state = "Hunt"; a.hydration = 0.2;
    expect(decideCarnivore(a, CARNIVORE)?.state).toBe("SeekWater");
  });
  it("faim sous huntBelow depuis Wander → Hunt", () => {
    const a = mkc();
    a.state = "Wander"; a.energy = 0.5; a.hydration = 0.9;
    expect(decideCarnivore(a, CARNIVORE)).toEqual({ state: "Hunt", cause: "faim" });
  });
  it("faim critique interrompt SeekWater ordinaire", () => {
    const a = mkc();
    a.state = "SeekWater"; a.energy = 0.2; a.hydration = 0.4; // soif NON critique
    expect(decideCarnivore(a, CARNIVORE)).toEqual({ state: "Hunt", cause: "faim critique" });
  });
  it("le cooldown de chasse bloque Hunt", () => {
    const a = mkc();
    a.state = "Wander"; a.energy = 0.5; a.hydration = 0.9;
    a.nextHuntAgeSeconds = a.ageSeconds + 10;
    expect(decideCarnivore(a, CARNIVORE)).toBeNull();
  });
  it("repu et désaltéré, adulte : SeekMate", () => {
    const a = mkc();
    a.state = "Wander"; a.energy = 0.9; a.hydration = 0.9;
    a.ageSeconds = CARNIVORE.adultAgeSeconds; a.nextMateAgeSeconds = 0;
    expect(decideCarnivore(a, CARNIVORE)?.state).toBe("SeekMate");
  });
  it("Drink n'est pas interrompu par la faim ordinaire", () => {
    const a = mkc();
    a.state = "Drink"; a.energy = 0.5; a.hydration = 0.7;
    expect(decideCarnivore(a, CARNIVORE)).toBeNull();
  });
});
```
(imports à compléter : `decideCarnivore`, `createCarnivore`, `CARNIVORE`.)
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter**

`packages/sim/src/decide.ts` — imports :
```ts
import type { AgentState, CarnivoreParams, HerbivoreParams, SpeciesParams } from "@eco/shared";
```
`isMateEligible` : changer le type du paramètre en `p: SpeciesParams` (corps
inchangé). Renommer `decide` en `decideHerbivore` et insérer EN TÊTE de
fonction (avant la soif critique) :
```ts
  // Fuir > tout (architecture §7). La menace est écrite par la perception.
  if (a.hasThreat && a.state !== "Flee") {
    return { state: "Flee", cause: "prédateur !" };
  }
  if (a.state === "Flee") {
    if (!a.hasThreat) return { state: "Wander", cause: "danger écarté" };
    return null; // on fuit — rien d'autre ne compte
  }
```
Ajouter à la fin du fichier :
```ts
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
      && a.state !== "Hunt" && a.state !== "Drink" && canHunt) {
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
    if (isMateEligible(a, p)) return { state: "SeekMate", cause: "prêt à se reproduire" };
  }
  return null;
}
```
`packages/sim/src/agentTick.ts` : renommer l'import et l'appel
`decide(a, p)` → `decideHerbivore(a, p)` (le dispatch par espèce arrive en
Task 4 — d'ici là le monde n'a que des herbivores).

- [ ] **Step 3 : Vert + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck
git add packages/sim/src
git commit -m "[Phase 4] decideHerbivore (fuite prioritaire) et decideCarnivore"
```

---

### Task 4 : agentTick — perception de menace, Flee, dispatch par espèce

**Files:**
- Modify: `packages/sim/src/agentTick.ts`, `packages/sim/src/boids.ts`
  (filtre espèce), `packages/sim/src/world.ts` (despawn via paramsOf)
- Test: `packages/sim/src/agentTick.test.ts` (ajouts)

**Interfaces:**
- Consumes : Tasks 1-3.
- Produces : `tickAgent` gère les deux espèces ; la vitesse est plafonnée par
  état (`speedCap`) ; le gather boids et findNearestMate filtrent par espèce.

- [ ] **Step 1 : Tests (rouge)**

Ajouter à `packages/sim/src/agentTick.test.ts` :
```ts
import { createCarnivore } from "./agent";

describe("fuite", () => {
  it("hystérésis : menace à 15 m, encore à 25 m, éteinte à 40 m", () => {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
    const prey = w.agents[0]!;
    const wolf = createCarnivore(99, prey.x + 15, prey.z, w.rng);
    wolf.nextHuntAgeSeconds = 1e9; // il ne chasse pas : on teste la perception
    w.agents.push(wolf);
    tickWorld(w);
    expect(prey.hasThreat).toBe(true);
    expect(prey.state).toBe("Flee");
    wolf.x = prey.x + 25; // entre trigger (20) et safe (35)
    tickWorld(w);
    expect(prey.hasThreat).toBe(true);
    wolf.x = prey.x + 40;
    tickWorld(w);
    expect(prey.hasThreat).toBe(false);
    expect(prey.state).toBe("Wander");
    expect(prey.transitions.at(-1)!.cause).toBe("danger écarté");
  });

  it("la fuite s'éloigne de la menace et dépasse maxSpeed", () => {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
    const prey = w.agents[0]!;
    prey.energy = 1;
    const wolf = createCarnivore(99, prey.x - 5, prey.z, w.rng);
    wolf.nextHuntAgeSeconds = 1e9;
    w.agents.push(wolf);
    const x0 = prey.x;
    for (let t = 0; t < 40; t++) { wolf.x = prey.x - 5; wolf.vx = 0; tickWorld(w); }
    expect(prey.x).toBeGreaterThan(x0 + 5); // il s'éloigne en +X
    expect(Math.hypot(prey.vx, prey.vz)).toBeGreaterThan(HERBIVORE.maxSpeed);
  });
});

describe("appariement inter-espèces", () => {
  it("un couple mixte ne produit rien", () => {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
    const h = w.agents[0]!;
    const c = createCarnivore(50, h.x + 1, h.z, w.rng);
    c.nextHuntAgeSeconds = 1e9;
    w.agents.push(c);
    for (const ag of [h, c]) {
      ag.energy = 0.9; ag.hydration = 0.9; ag.nextMateAgeSeconds = 0;
      ag.ageSeconds = 100;
    }
    for (let t = 0; t < 100; t++) tickWorld(w);
    expect(w.agents.length).toBe(2); // aucune naissance
  });
});
```
NOTE : `initialCarnivores: 0` n'existe pas encore côté spawn (Task 5) — la
config l'accepte (Task 1) et `createWorld` l'ignore encore : ces tests
poussent le carnivore à la main dans `w.agents`. Ils doivent être ROUGES ici
(pas de Flee, pas de filtre d'espèce).
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter**

`packages/sim/src/boids.ts` — dans `gather`, la première ligne devient :
```ts
  if (n.id === self.id || n.species !== self.species) return;
```

`packages/sim/src/agentTick.ts` :
- Imports : ajouter `CARNIVORE`, `type CarnivoreParams`, `type HerbivoreParams`
  à l'import `@eco/shared` ; `decideCarnivore` à l'import `./decide` ;
  `paramsOf` à l'import `./agent`.
- Dans `considerMate`, la première ligne devient :
```ts
  if (n.id === mateSeeker.id || n.species !== mateSeeker.species
      || !isMateEligible(n, paramsOf(n))) return;
```
  et dans `findNearestMate`, remplacer les deux `HERBIVORE` par `paramsOf(a)`.
- Perception de menace (au niveau module, avant tickAgent) :
```ts
// Perception de menace (herbivores) — état module, zéro alloc.
let threatSeeker: Agent;
let threatBest: Agent | null = null;
let threatBestD2 = 0;
function considerThreat(n: Agent): void {
  if (n.species !== "carnivore") return;
  const dx = n.x - threatSeeker.x, dz = n.z - threatSeeker.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < threatBestD2) { threatBestD2 = d2; threatBest = n; }
}
/** Écrit hasThreat/threatX/threatZ. Hystérésis : rayon élargi si on fuit déjà. */
function perceiveThreat(world: World, a: Agent, p: HerbivoreParams): void {
  const r = a.hasThreat ? p.fleeSafeRadius : p.fleeTriggerRadius;
  threatSeeker = a; threatBest = null; threatBestD2 = r * r;
  forEachNeighbor(world.grid, a.x, a.z, r, considerThreat);
  if (threatBest !== null) {
    a.hasThreat = true; a.threatX = threatBest.x; a.threatZ = threatBest.z;
  } else {
    a.hasThreat = false;
  }
}
```
- Dans `tickAgent` : remplacer `const p = HERBIVORE;` et l'appel à decide par :
```ts
  const p = paramsOf(a);
```
  puis, après le bloc mort de faim (avant la décision) :
```ts
  // Perception (écrit sur l'agent) PUIS décision pure (architecture §7).
  let d = null;
  if (a.species === "herbivore") {
    perceiveThreat(world, a, HERBIVORE);
    d = decideHerbivore(a, HERBIVORE);
  } else {
    if (a.state !== "Hunt") {
      a.stamina = Math.min(1, a.stamina + CARNIVORE.staminaRegenPerSec * dt);
    }
    d = decideCarnivore(a, CARNIVORE);
  }
  if (d) applyTransition(a, d.state, d.cause, world.tickCount);
```
- Après `let boidsMode` ajouter `let speedCap = p.maxSpeed;`, et dans le
  switch, ajouter le case Flee (avant `case "Eat"`) :
```ts
    case "Flee": {
      const dx = a.x - a.threatX, dz = a.z - a.threatZ;
      const dist = Math.hypot(dx, dz) || 1;
      // Un affamé court moins vite : les faibles se font attraper (émergence).
      const fleeSpeed = HERBIVORE.maxSpeed * HERBIVORE.fleeBoost * (0.7 + 0.3 * a.energy);
      seek(a, a.x + (dx / dist) * 20, a.z + (dz / dist) * 20, fleeSpeed, HERBIVORE.maxForce, steer);
      speedCap = fleeSpeed;
      break; // pas de boids : la panique prime
    }
```
  (import `seek` depuis `./steering` si absent.)
- Dans le bloc mouvement, remplacer les deux `p.maxSpeed` du clamp par
  `speedCap` :
```ts
    const sp = Math.hypot(a.vx, a.vz);
    if (sp > speedCap) { a.vx = (a.vx / sp) * speedCap; a.vz = (a.vz / sp) * speedCap; }
```
- Les états herbivores (`SeekFood`, `Eat`, boids `2`) et la mémoire de
  nourriture ne concernent que les herbivores : les carnivores n'entrent
  jamais dans ces états (decideCarnivore ne les propose pas). `Hunt` sans
  case tombe dans le vide jusqu'à la Task 5 — accepté (tests carnivores de
  chasse arrivent en Task 5 ; ici `nextHuntAgeSeconds = 1e9` les neutralise).

`packages/sim/src/world.ts` — despawn : remplacer
`HERBIVORE.corpseDespawnSeconds` par `paramsOf(a).corpseDespawnSeconds`
(import `paramsOf` depuis `./agent` ; l'import `HERBIVORE` reste pour le
spawn).

- [ ] **Step 3 : Vert + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck
git add packages/sim/src
git commit -m "[Phase 4] Perception de menace, fuite, dispatch par espèce"
```

---

### Task 5 : Hunt — chasse à l'endurance, kill, spawn des carnivores

**Files:**
- Modify: `packages/sim/src/agentTick.ts` (case Hunt), `packages/sim/src/world.ts` (spawn)
- Test: `packages/sim/src/agentTick.test.ts` (ajouts)

**Interfaces:**
- Consumes : Tasks 1-4.
- Produces : monde complet à deux espèces ; `createWorld` spawne
  `initialCarnivores` adultes étalés.

- [ ] **Step 1 : Tests (rouges)**

Ajouter à `packages/sim/src/agentTick.test.ts` :
```ts
describe("chasse", () => {
  /** Monde 1 proie + 1 chasseur affamé, positions et états contrôlés. */
  function huntWorld(preyEnergy: number, gap: number) {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 1 });
    const prey = w.agents.find((a) => a.species === "herbivore")!;
    const wolf = w.agents.find((a) => a.species === "carnivore")!;
    prey.energy = preyEnergy; prey.hydration = 1;
    wolf.x = prey.x - gap; wolf.z = prey.z;
    wolf.energy = 0.5; wolf.hydration = 1; wolf.stamina = 1;
    wolf.nextHuntAgeSeconds = 0; wolf.nextMateAgeSeconds = 1e9;
    return { w, prey, wolf };
  }

  it("attrape une proie affamée (lente) : kill, gain, digestion", () => {
    const { w, prey, wolf } = huntWorld(0.15, 8);
    for (let t = 0; t < 300 && prey.state !== "Dead"; t++) tickWorld(w);
    expect(prey.state).toBe("Dead");
    expect(prey.transitions.at(-1)!.cause).toBe("prédation");
    expect(wolf.energy).toBeGreaterThan(0.7); // 0.5 + 0.55 borné, moins la décroissance
    expect(wolf.nextHuntAgeSeconds).toBeGreaterThan(wolf.ageSeconds);
    expect(wolf.transitions.some((tr) => tr.cause === "proie tuée")).toBe(true);
  });

  it("abandonne épuisé face à une proie rapide partie de loin", () => {
    const { w, prey, wolf } = huntWorld(1.0, 35);
    for (let t = 0; t < 400 && !wolf.transitions.some((tr) => tr.cause === "épuisé"); t++) {
      prey.energy = 1; // la proie reste fraîche : elle ne DOIT pas être rattrapée
      tickWorld(w);
    }
    expect(wolf.transitions.some((tr) => tr.cause === "épuisé")).toBe(true);
    expect(prey.state).not.toBe("Dead");
  });

  it("le monde spawne les carnivores demandés", () => {
    const w = createWorld();
    const carn = w.agents.filter((a) => a.species === "carnivore");
    expect(carn.length).toBe(w.config.initialCarnivores);
    expect(carn[0]!.ageSeconds).toBeGreaterThanOrEqual(CARNIVORE.adultAgeSeconds);
  });

  it("déterminisme complet à deux espèces", () => {
    const w1 = createWorld(), w2 = createWorld();
    for (let t = 0; t < 1500; t++) { tickWorld(w1); tickWorld(w2); }
    expect(w1.agents.map((a) => [a.id, a.species, a.x, a.z, a.state]))
      .toEqual(w2.agents.map((a) => [a.id, a.species, a.x, a.z, a.state]));
  });
});
```
(import `CARNIVORE` depuis `@eco/shared`.)
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter**

`packages/sim/src/agentTick.ts` — au niveau module (sous la recherche de
partenaire) :
```ts
// Recherche de proie (carnivores) — état module, zéro alloc.
let preySeeker: Agent;
let preyBest: Agent | null = null;
let preyBestD2 = 0;
function considerPrey(n: Agent): void {
  if (n.species !== "herbivore") return;
  const dx = n.x - preySeeker.x, dz = n.z - preySeeker.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < preyBestD2) { preyBestD2 = d2; preyBest = n; }
}
function findNearestPrey(world: World, a: Agent): Agent | null {
  preySeeker = a; preyBest = null;
  preyBestD2 = CARNIVORE.perceptionRadius ** 2;
  forEachNeighbor(world.grid, a.x, a.z, CARNIVORE.perceptionRadius, considerPrey);
  return preyBest;
}
```
Dans le switch de `tickAgent`, après le case `"Flee"` :
```ts
    case "Hunt": {
      const pc = CARNIVORE;
      const prey = findNearestPrey(world, a);
      if (!prey) {
        a.nextHuntAgeSeconds = a.ageSeconds + pc.huntRetrySeconds;
        applyTransition(a, "Wander", "aucune proie", world.tickCount);
        wander(a, rng, pc.maxSpeed, pc.maxForce, steer);
        break;
      }
      a.stamina -= pc.staminaDrainPerSec * dt;
      if (a.stamina <= 0) {
        a.stamina = 0;
        a.nextHuntAgeSeconds = a.ageSeconds + pc.huntRetrySeconds;
        applyTransition(a, "Wander", "épuisé", world.tickCount);
        wander(a, rng, pc.maxSpeed, pc.maxForce, steer);
        break;
      }
      seek(a, prey.x, prey.z, pc.sprintSpeed, pc.maxForce, steer);
      speedCap = pc.sprintSpeed;
      const dx = prey.x - a.x, dz = prey.z - a.z;
      if (dx * dx + dz * dz < pc.killDistance * pc.killDistance) {
        prey.vx = prey.vz = 0;
        applyTransition(prey, "Dead", "prédation", world.tickCount);
        a.energy = Math.min(1, a.energy + pc.killEnergyGain);
        a.nextHuntAgeSeconds = a.ageSeconds + pc.huntCooldownSeconds;
        applyTransition(a, "Wander", "proie tuée", world.tickCount);
      }
      break;
    }
```
NOTE déterminisme : une proie tuée pendant le tick d'un carnivore placé avant
elle dans le tableau ne bouge plus ce tick (état Dead) — ordre de traitement
= ordre du tableau, stable.

`packages/sim/src/world.ts` — dans `createWorld`, remplacer le bloc spawn par :
```ts
  const spawns = findSpawnCells(
    terrain, config, config.initialHerbivores + config.initialCarnivores,
  );
  const agents = spawns.map((s, k) => {
    const isHerb = k < config.initialHerbivores;
    const a = isHerb
      ? createHerbivore(k + 1, s.x, s.z, rng)
      : createCarnivore(k + 1, s.x, s.z, rng);
    // Les fondateurs sont adultes, premiers essais étalés (pas de rush au tick 1).
    const p = isHerb ? HERBIVORE : CARNIVORE;
    a.ageSeconds = p.adultAgeSeconds;
    a.nextMateAgeSeconds = a.ageSeconds + rng() * p.mateCooldownSeconds;
    if (!isHerb) a.nextHuntAgeSeconds = a.ageSeconds + rng() * 20;
    return a;
  });
```
(imports : `createCarnivore` depuis `./agent`, `CARNIVORE` depuis `@eco/shared` ;
`nextAgentId` devient `config.initialHerbivores + config.initialCarnivores + 1`.)

- [ ] **Step 3 : Vert + commit**

Run : `pnpm --filter @eco/sim test && pnpm typecheck`.
ATTENTION : les tests Phase 3 qui utilisent `createWorld({ initialHerbivores: 1 })`
subissent maintenant 4 carnivores par défaut → y passer
`initialCarnivores: 0` PARTOUT où le test veut un monde sans prédateur
(tests « un agent qui vit », « reproduction » de la Task 6 P3, perf.test à
laisser AVEC carnivores par défaut ? → NON : perf.test mesure 600 herbivores,
ajouter `initialCarnivores: 0` pour garder la mesure comparable).
Les tests de fuite/appariement de la Task 4 utilisent déjà `initialCarnivores: 0`.
Le test « la population croît depuis les fondateurs » (P3) : passer
`initialCarnivores: 0` aussi (la croissance pure se teste sans prédation).
```bash
git add packages/sim/src
git commit -m "[Phase 4] Chasse à l'endurance : sprint, épuisement, kill, spawn carnivores"
```

---

### Task 6 : Client — mesh carnivore, couleurs, graphe 2 courbes

**Files:**
- Modify: `packages/client/src/render/agentsMesh.ts`,
  `packages/client/src/ui/populationGraph.ts`, `packages/client/src/main.ts`

**Interfaces:**
- Consumes : `AgentSnapshot.species` (Task 1).
- Produces :
```ts
// populationGraph.ts — nouvelle signature :
update(simTimeSeconds: number, herbivores: number, carnivores: number): void;
```

- [ ] **Step 1 : agentsMesh — un InstancedMesh par espèce**

Remplacer le corps de `createAgentsMesh` : même matériau toon, deux
géométries et deux meshes.
```ts
export function createAgentsMesh(scene: THREE.Scene, terrain: TerrainData, config: WorldConfig) {
  const mat = new THREE.MeshToonMaterial({ gradientMap: createToonGradient() });

  const herbGeo = new THREE.SphereGeometry(0.7, 7, 5);
  herbGeo.scale(0.9, 0.75, 1.2); // corps trapu, museau vers +Z
  const herbMesh = new THREE.InstancedMesh(herbGeo, mat, 1024);

  const carnGeo = new THREE.SphereGeometry(0.7, 7, 5);
  carnGeo.scale(1.1, 0.95, 2.2); // plus grand, élancé — silhouette de chasseur
  const carnMesh = new THREE.InstancedMesh(carnGeo, mat, 256);

  for (const mesh of [herbMesh, carnMesh]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    scene.add(mesh);
  }
  // ... (scratchs m/pos/quat/scale/up/color/prevById inchangés)
```
et dans `update`, une seule boucle qui écrit dans le mesh de l'espèce :
```ts
      let nh = 0, nc = 0;
      for (let k = 0; k < list.length; k++) {
        const a = list[k]!;
        const isHerb = a.species === "herbivore";
        const mesh = isHerb ? herbMesh : carnMesh;
        const idx = isHerb ? nh : nc;
        if (idx >= (isHerb ? 1024 : 256)) continue;
        // ... interpolation x/z/heading inchangée ...
        // ... pos/quat/scale + setMatrixAt(idx, m) + setColorAt(idx, ...) ...
        if (isHerb) nh++; else nc++;
      }
      herbMesh.count = nh; carnMesh.count = nc;
      // needsUpdate sur les deux meshes (matrix + instanceColor)
```
Ajouter à `STATE_COLORS` : `Flee: 0xba68c8, Hunt: 0xef5350,`.

- [ ] **Step 2 : populationGraph à deux courbes**

Remplacer le contenu de `createPopulationGraph` : deux ring buffers
(`herbSamples`, `carnSamples`, même `WINDOW`/`head`/`count`), max commun aux
deux séries, deux `strokeStyle` (`#aed581` herbivores, `#ef9a9a` carnivores),
libellé `ctx.fillText(\`H ${herbivores} · C ${carnivores}\`, 6, 12)`.
Signature : `update(simTimeSeconds, herbivores, carnivores)`.

- [ ] **Step 3 : main.ts**

Dans la boucle, remplacer l'appel au graphe par :
```ts
  if (snapshot) {
    let herb = 0, carn = 0;
    for (const a of snapshot.agents) {
      if (a.species === "herbivore") herb++; else carn++;
    }
    popGraph.update(snapshot.simTimeSeconds, herb, carn);
    lastHerb = herb; lastCarn = carn;
  }
```
(déclarer `let lastHerb = 0, lastCarn = 0;` près de `lastVegTick`), et dans
l'overlay lent : remplacer la ligne agents par
```ts
      overlay.setLine("agents", `herbivores ${lastHerb} · carnivores ${lastCarn}`);
```
L'inspecteur suit le plus vieux herbivore VIVANT : remplacer
`const watched = snapshot.agents[0];` par
```ts
      const watched = snapshot.agents.find((a) => a.species === "herbivore");
```

- [ ] **Step 4 : Vérifier + commit**

Run : `pnpm test && pnpm typecheck` → PASS.
Vérification navigateur (UN SEUL serveur — tuer l'existant d'abord) :
troupeaux + silhouettes allongées qui patrouillent, poursuites (rouge qui
sprinte, violets qui s'égayent), graphe à deux courbes.
```bash
git add packages/client
git commit -m "[Phase 4] Client : mesh carnivore, couleurs Hunt/Flee, graphe 2 courbes"
```

---

### Task 7 : Harness headless — runHeadless + script + vite-node

**Files:**
- Create: `packages/sim/src/headless.ts`, `packages/sim/scripts/harness.ts`
- Modify: `packages/sim/package.json`, `package.json` (racine),
  `packages/sim/tsconfig.json` (inclure scripts/), `packages/sim/src/index.ts`
- Test: `packages/sim/src/headless.test.ts`

**Interfaces:**
- Produces :
```ts
export interface HeadlessSample { t: number; herbivores: number; carnivores: number; biomass: number; }
export interface HeadlessResult {
  samples: HeadlessSample[];
  verdict: "stable" | "extinction" | "explosion";
  detail: string; // ex : "extinction carnivore à t=1834s"
}
export function runHeadless(opts: {
  hours?: number; sampleSeconds?: number;
  overrides?: Partial<WorldConfig>;
  onSample?: (s: HeadlessSample) => void;
}): HeadlessResult;
```

- [ ] **Step 1 : Test (rouge)**

`packages/sim/src/headless.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { runHeadless } from "./headless";

describe("runHeadless", () => {
  it("simule, échantillonne et rend un verdict", () => {
    const r = runHeadless({ hours: 2 / 60, sampleSeconds: 30 }); // 2 min de sim
    expect(r.samples.length).toBeGreaterThanOrEqual(4);
    expect(r.samples[0]).toMatchObject({
      t: expect.any(Number), herbivores: expect.any(Number),
      carnivores: expect.any(Number), biomass: expect.any(Number),
    });
    expect(["stable", "extinction", "explosion"]).toContain(r.verdict);
  });
  it("détecte l'extinction et s'arrête tôt", () => {
    // Sans eau, tout meurt en < 2 min de sim.
    const r = runHeadless({ hours: 1, sampleSeconds: 10, overrides: { waterLevel: -5 } });
    expect(r.verdict).toBe("extinction");
    expect(r.samples.at(-1)!.t).toBeLessThan(600); // arrêt tôt, pas 3600 s
  });
});
```
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter `headless.ts`**

```ts
import type { WorldConfig } from "@eco/shared";
import { ZONE_GRASS } from "./terrain";
import { createWorld, tickWorld } from "./world";

export interface HeadlessSample { t: number; herbivores: number; carnivores: number; biomass: number; }
export interface HeadlessResult {
  samples: HeadlessSample[];
  verdict: "stable" | "extinction" | "explosion";
  detail: string;
}

const POP_CEILING = 2000; // au-delà : explosion déclarée, run arrêté

/**
 * Fait tourner la sim headless en accéléré (aucune limite de temps réel) et
 * surveille les populations. C'est l'outil de tuning de la Phase 4
 * (architecture §2 : « l'avantage caché le plus précieux »).
 */
export function runHeadless(opts: {
  hours?: number; sampleSeconds?: number;
  overrides?: Partial<WorldConfig>;
  onSample?: (s: HeadlessSample) => void;
} = {}): HeadlessResult {
  const hours = opts.hours ?? 2;
  const sampleSeconds = opts.sampleSeconds ?? 30;
  const world = createWorld(opts.overrides ?? {});
  const totalTicks = Math.round(hours * 3600 * world.config.tickRateHz);
  const ticksPerSample = Math.max(1, Math.round(sampleSeconds * world.config.tickRateHz));

  const grassCells: number[] = [];
  for (let i = 0; i < world.terrain.zones.length; i++) {
    if (world.terrain.zones[i] === ZONE_GRASS) grassCells.push(i);
  }

  const samples: HeadlessSample[] = [];
  const sample = (): HeadlessSample => {
    let herbivores = 0, carnivores = 0;
    for (const a of world.agents) {
      if (a.state === "Dead") continue;
      if (a.species === "herbivore") herbivores++;
      else carnivores++;
    }
    let biomass = 0;
    for (const i of grassCells) biomass += world.biomass.values[i]!;
    const s = {
      t: Math.round(world.simTimeSeconds),
      herbivores, carnivores,
      biomass: biomass / grassCells.length,
    };
    samples.push(s);
    opts.onSample?.(s);
    return s;
  };

  sample();
  for (let t = 0; t < totalTicks; t++) {
    tickWorld(world);
    if ((t + 1) % ticksPerSample === 0) {
      const s = sample();
      if (s.herbivores === 0 || s.carnivores === 0) {
        const espece = s.herbivores === 0 ? "herbivore" : "carnivore";
        return { samples, verdict: "extinction", detail: `extinction ${espece} à t=${s.t}s` };
      }
      if (s.herbivores + s.carnivores > POP_CEILING) {
        return { samples, verdict: "explosion", detail: `population ${s.herbivores + s.carnivores} > ${POP_CEILING} à t=${s.t}s` };
      }
    }
  }
  let minH = Infinity, maxH = 0, minC = Infinity, maxC = 0;
  for (const s of samples) {
    minH = Math.min(minH, s.herbivores); maxH = Math.max(maxH, s.herbivores);
    minC = Math.min(minC, s.carnivores); maxC = Math.max(maxC, s.carnivores);
  }
  return {
    samples, verdict: "stable",
    detail: `herbivores [${minH}..${maxH}], carnivores [${minC}..${maxC}] sur ${hours} h`,
  };
}
```
`packages/sim/src/index.ts` : ajouter `export * from "./headless";`

- [ ] **Step 3 : Script + branchements**

`packages/sim/scripts/harness.ts` :
```ts
/**
 * Harness de tuning Phase 4 : pnpm harness [hours=2] [sample=30] [seed=...]
 * [initialHerbivores=30] [initialCarnivores=4] ...
 * CSV sur stdout, verdict sur stderr. Code sortie 0 = stable.
 */
import type { WorldConfig } from "@eco/shared";
import { runHeadless } from "../src/headless";

const overrides: Record<string, string | number> = {};
let hours = 2, sampleSeconds = 30;
for (const arg of process.argv.slice(2)) {
  const [key, raw] = arg.split("=");
  if (!key || raw === undefined) continue;
  const num = Number(raw);
  const value = Number.isFinite(num) ? num : raw;
  if (key === "hours") hours = num;
  else if (key === "sample") sampleSeconds = num;
  else overrides[key] = value;
}

console.log("t,herbivores,carnivores,biomasse");
const result = runHeadless({
  hours, sampleSeconds,
  overrides: overrides as Partial<WorldConfig>,
  onSample: (s) => console.log(`${s.t},${s.herbivores},${s.carnivores},${s.biomass.toFixed(3)}`),
});
console.error(`\nverdict : ${result.verdict.toUpperCase()} — ${result.detail}`);
process.exit(result.verdict === "stable" ? 0 : 1);
```
`packages/sim/package.json` : ajouter aux devDependencies
`"vite-node": "^3.0.0"` et aux scripts `"harness": "vite-node scripts/harness.ts"`.
`package.json` racine, scripts : `"harness": "pnpm --filter @eco/sim harness"`.
`packages/sim/tsconfig.json` : si `include` ne couvre que `src`, ajouter
`"scripts"` pour que le typecheck couvre le harness.
Run : `pnpm install` (nouvelle devDep) puis `pnpm harness hours=0.05` →
CSV + verdict en quelques secondes.

- [ ] **Step 4 : Vert + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck && pnpm harness hours=0.05
git add packages/sim package.json pnpm-lock.yaml
git commit -m "[Phase 4] Harness headless : runHeadless + script CSV/verdict (vite-node)"
```

---

### Task 8 : TUNING — le livrable de la phase

**Files:**
- Create: `packages/sim/src/stability.test.ts`, `docs/tuning-phase4.md`
- Modify: `packages/shared/src/species.ts` (les valeurs finales),
  éventuellement `packages/shared/src/config.ts`

- [ ] **Step 1 : Test de stabilité court (garde-fou de suite)**

`packages/sim/src/stability.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { runHeadless } from "./headless";

describe("stabilité — garde-fou (le critère 2 h se vérifie au harness)", () => {
  it("10 min de sim : les deux espèces survivent, pas d'explosion", () => {
    const r = runHeadless({ hours: 10 / 60, sampleSeconds: 30 });
    expect(r.verdict).toBe("stable");
    const last = r.samples.at(-1)!;
    expect(last.herbivores).toBeGreaterThanOrEqual(5);
  });
});
```
Ce test peut être ROUGE au premier run : c'est le point de départ du tuning,
pas un échec du plan.

- [ ] **Step 2 : Boucle de tuning au harness (itérative, documentée)**

Créer `docs/tuning-phase4.md` avec un tableau d'itérations, et pour CHAQUE
run noter : date, paramètres modifiés (avant → après), verdict harness,
min/max des deux populations, lecture (« les carnivores meurent avant la
première oscillation », etc.).

Protocole :
1. `pnpm harness hours=0.5` (30 min de sim, boucle rapide) jusqu'à survie.
2. Puis `pnpm harness hours=2` (le critère). Trois runs de graines
   différentes (`seed=fable-2`, `seed=fable-3`) pour éviter un équilibre
   de coïncidence.
3. Leviers dans l'ordre (amortisseurs d'abord, jamais plus de 1-2 params
   par itération) : `killEnergyGain` / `huntCooldownSeconds` (pression de
   prédation), `mateEnergyCost`/`mateCooldownSeconds` carnivore
   (démographie prédateur), `energyDecayPerSec` carnivore (famine),
   `initialCarnivores`, puis en dernier recours les vitesses
   (`sprintSpeed`/`fleeBoost` — elles changent la nature du jeu, pas
   seulement l'équilibre).
4. Si après ~10 itérations aucune combinaison ne tient 2 h : STOP —
   documenter l'impasse dans docs/tuning-phase4.md et en discuter avec Shin
   (règle CLAUDE.md n°5 : arbitrer explicitement, pas de dérive silencieuse).

- [ ] **Step 3 : Verrouiller**

Quand `pnpm harness hours=2` est STABLE sur ≥ 2 graines ET
`pnpm --filter @eco/sim test` est vert (stability.test compris) :
```bash
git add packages/shared/src packages/sim/src docs/tuning-phase4.md
git commit -m "[Phase 4] Équilibre Lotka-Volterra : paramètres tunés au harness (2 h stable)"
```

---

### Task 9 : Clôture de la Phase 4

**Files:**
- Modify: `PROGRESS.md`, `README.md`

- [ ] **Step 1 : Vérification finale**

```bash
pnpm test && pnpm typecheck && pnpm harness hours=2
```
Observation navigateur ≥ 3 min : poursuites lisibles (rouge sprinte, violet
fuit), kills, oscillations sur le graphe 2 courbes. Screenshots d'attestation.

- [ ] **Step 2 : PROGRESS.md**

- État actuel → Phase 4 terminée (validation Shin en attente), verdict
  harness cité (min/max des populations sur 2 h).
- Paramètres à tuner : `CARNIVORE` complet + les 3 params de fuite herbivore ;
  pointer docs/tuning-phase4.md pour l'historique.
- Points fragiles : (1) perception de menace = requête grille par herbivore
  et par tick (rayon 20-35 m) — mesuré OK, à surveiller ; (2) équilibre
  sensible à la graine — 2-3 graines testées seulement ; (3) la fuite peut
  acculer une proie contre l'eau (assumé, réaliste) ; (4) Hunt sprinte dès
  l'acquisition même à 70 m — l'endurance le punit, comportement à
  réévaluer si les carnivores meurent trop de chasses vaines.

- [ ] **Step 3 : Commit + push**

```bash
git add PROGRESS.md README.md
git commit -m "[Phase 4] Clôture : chaîne trophique en équilibre"
git push origin main
```
(Shin suit en remote sur github.com/ShjnAki/fable_sim — pousser en fin de
phase fait partie de la clôture désormais.)

---

## Self-review (faite à la rédaction)

- **Couverture spec** : espèces §1 ✓ (T1, T2), chasse/fuite §2+§4 ✓ (T4, T5),
  décision §3 ✓ (T3), monde §5 ✓ (T5), client §6 ✓ (T6), harness §7 ✓ (T7),
  stabilité §8 ✓ (T8), critère de sortie ✓ (T8-T9), tests spec 1-8 ✓
  (T3=1-2, T5=3+6, T4=4-5, T8=7, T7=8).
- **Types inter-tâches** : `paramsOf(a): SpeciesParams` T2→T4/T5 ;
  `decideHerbivore/decideCarnivore` T3→T4 ; `speedCap` introduit T4, utilisé
  T5 ; `runHeadless` T7→T8 ; `update(t, herb, carn)` T6 interne client.
- **Pièges signalés** : tests P3 à passer en `initialCarnivores: 0` (T5
  Step 3, liste explicite) ; perf.test comparable (sans carnivores) ;
  `isMateEligible` élargi à SpeciesParams (T3) ; l'ordre de traitement
  tableau = ordre de kill (déterminisme, T5) ; vite-node = devDep nouvelle
  assumée (spec §7).
- **Écart plan vs spec** : aucun — les valeurs CARNIVORE du spec sont
  reprises telles quelles comme point de départ du tuning.
