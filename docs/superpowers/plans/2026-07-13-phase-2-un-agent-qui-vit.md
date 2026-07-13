# Phase 2 — Un agent qui vit : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un herbivore unique, vivant et observable : besoins (énergie/hydratation), FSM à priorités, steering, il cherche l'herbe et l'eau, meurt de faim/soif — état interne lisible dans un inspecteur à l'écran.

**Architecture:** Conforme à `docs/architecture.md` §5-§7 : agent = objet TS lisible ; décision = FSM à priorités d'interruption (`decide()` pure) + ring buffer de transitions ; steering seek/arrive/wander en fonctions pures zéro-alloc ; le protocole snapshot s'étend avec `agents[]`, `interpolationAlpha()` et `getAgentDetail()`. Le client rend l'agent en `InstancedMesh` (capacité 512, prêt pour la Phase 3) coloré par état FSM, interpolé entre les deux derniers snapshots.

**Tech Stack:** identique Phase 1 (TS strict, pnpm, Vitest, Three.js). Aucune dépendance nouvelle.

## Global Constraints

- Identiques au plan Phase 1 (TS strict ; `sim`/`shared` sans DOM/Three ; PRNG seedé
  uniquement ; zéro allocation dans la boucle de tick — le scratch de steering est
  partagé au niveau module ; commits `[Phase 1]`→`[Phase 2]` ; budget tick ≤ 3 ms).
- Les transitions d'« arrivée » (SeekWater→Drink, SeekFood→Eat) sont décidées par le
  comportement (dans `tickAgent`), PAS par `decide()` — qui ne gère que les priorités
  de besoins et les fins d'action (hystérésis).
- Couleur du corps de l'agent = état FSM (choix debug assumé, revu en Phase 3 quand
  plusieurs espèces coexisteront).

---

### Task 1 : Protocole agents (shared) + cellules de rive (terrain)

**Files:**
- Modify: `packages/shared/src/protocol.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/species.ts`
- Modify: `packages/sim/src/terrain.ts` (interface `TerrainData` + calcul `shoreCells`)
- Test: `packages/sim/src/terrain.test.ts` (ajout)

**Interfaces:**
- Produces (consommé par toutes les tâches suivantes) :
```ts
// shared/protocol.ts (ajouts)
export type AgentState = "Wander" | "SeekWater" | "Drink" | "SeekFood" | "Eat" | "Dead";
export interface Transition { tick: number; from: AgentState; to: AgentState; cause: string; }
export interface AgentSnapshot {
  id: number; x: number; z: number; heading: number;
  state: AgentState; energy: number; hydration: number;
}
export interface AgentDetail extends AgentSnapshot {
  ageSeconds: number;
  memory: { hasWater: boolean; waterX: number; waterZ: number;
            hasFood: boolean; foodX: number; foodZ: number };
  transitions: readonly Transition[];
}
// TickSnapshot gagne : agents: AgentSnapshot[]
// SimHost gagne : interpolationAlpha(): number; getAgentDetail(id: number): AgentDetail | null;

// shared/species.ts
export interface HerbivoreParams { /* voir code Step 2 */ }
export const HERBIVORE: HerbivoreParams;

// sim/terrain.ts : TerrainData gagne shoreCells: Uint32Array
```

- [ ] **Step 1 : Test des cellules de rive (rouge)**

Ajouter à `packages/sim/src/terrain.test.ts` :
```ts
describe("shoreCells", () => {
  it("chaque cellule de rive est de l'herbe avec un voisin eau", () => {
    const t = generateTerrain(cfg);
    const b = cfg.biomassResolution;
    expect(t.shoreCells.length).toBeGreaterThan(0);
    for (const i of t.shoreCells) {
      expect(t.zones[i]).toBe(ZONE_GRASS);
      const ix = i % b, iz = Math.floor(i / b);
      const hasWater =
        (ix > 0 && t.zones[i - 1] === ZONE_WATER) ||
        (ix < b - 1 && t.zones[i + 1] === ZONE_WATER) ||
        (iz > 0 && t.zones[i - b] === ZONE_WATER) ||
        (iz < b - 1 && t.zones[i + b] === ZONE_WATER);
      expect(hasWater).toBe(true);
    }
  });
});
```
Run : `pnpm --filter @eco/sim test` → FAIL (`shoreCells` n'existe pas).

- [ ] **Step 2 : Implémenter**

`packages/shared/src/species.ts` :
```ts
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
```

`packages/shared/src/protocol.ts` : ajouter les types du bloc Interfaces ci-dessus,
et dans `TickSnapshot` le champ `agents: AgentSnapshot[]`, dans `SimHost` les deux
méthodes. `packages/shared/src/index.ts` : `export * from "./species";`

`packages/sim/src/terrain.ts` : ajouter à `TerrainData` le champ
`/** Indices des cellules d'herbe adjacentes à l'eau (points où boire). */ shoreCells: Uint32Array;`,
initialiser le littéral temporaire avec `shoreCells: new Uint32Array(0)`, et après le
calcul des zones :
```ts
// Cellules de rive : herbe en 4-voisinage d'une cellule d'eau — les abreuvoirs.
const shore: number[] = [];
for (let iz = 0; iz < b; iz++) {
  for (let ix = 0; ix < b; ix++) {
    const i = iz * b + ix;
    if (zones[i] !== ZONE_GRASS) continue;
    if ((ix > 0 && zones[i - 1] === ZONE_WATER) ||
        (ix < b - 1 && zones[i + 1] === ZONE_WATER) ||
        (iz > 0 && zones[i - b] === ZONE_WATER) ||
        (iz < b - 1 && zones[i + b] === ZONE_WATER)) shore.push(i);
  }
}
terrain.shoreCells = Uint32Array.from(shore);
```
ATTENTION : le client (Task 6) reçoit le terrain via
`{ heights, zones }` dans `main.ts` — ajouter `shoreCells: host.getTerrainShore()` ?
NON : `buildTerrainMesh`/`vegetation` n'en ont pas besoin. Le littéral `terrain` de
`main.ts` restera typé structurellement — le mettre à jour en Task 6 avec un cast
explicite n'est PAS nécessaire car ces fonctions prennent `TerrainData` ; il faudra
donc exposer les rives : ajouter `getTerrainShore(): Uint32Array` est superflu —
à la place, `main.ts` construira `terrain` avec `shoreCells: new Uint32Array(0)`
(le client n'utilise jamais les rives). Compromis documenté.

- [ ] **Step 3 : Vert + typecheck + commit**

Run : `pnpm --filter @eco/sim test && pnpm typecheck` → PASS (le world.test existant
casse si `makeSnapshot` n'a pas encore `agents` — TS le signalera en Task 5, pas ici,
car `TickSnapshot.agents` rend `makeSnapshot` non conforme : AJOUTER temporairement
`agents: []` dans `makeSnapshot` (world.ts) dans CETTE tâche pour garder le vert).
```bash
git add -A && git commit -m "[Phase 2] Protocole agents + paramètres espèce + cellules de rive"
```

---

### Task 2 : Agent — type, création, spawn + helpers de grille biomasse

**Files:**
- Create: `packages/sim/src/agent.ts`
- Modify: `packages/sim/src/biomass.ts` (helpers), `packages/sim/src/index.ts`
- Test: `packages/sim/src/agent.test.ts`

**Interfaces:**
- Produces :
```ts
// biomass.ts (ajouts)
export function cellIndexAt(config: WorldConfig, x: number, z: number): number;
export function cellCenterX(config: WorldConfig, i: number): number;
export function cellCenterZ(config: WorldConfig, i: number): number;
// agent.ts
export interface Agent { /* voir code — champs plats, sérialisation triviale */ }
export function createHerbivore(id: number, x: number, z: number, rng: Rng): Agent;
export function findSpawnCell(terrain: TerrainData, config: WorldConfig): { x: number; z: number };
```

- [ ] **Step 1 : Tests (rouge)**

`packages/sim/src/agent.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_CONFIG, createRng } from "@eco/shared";
import { createHerbivore, findSpawnCell } from "./agent";
import { cellCenterX, cellCenterZ, cellIndexAt } from "./biomass";
import { ZONE_GRASS, generateTerrain } from "./terrain";

const cfg = DEFAULT_WORLD_CONFIG;

describe("cellIndexAt / cellCenter", () => {
  it("aller-retour : le centre d'une cellule retombe sur son index", () => {
    for (const i of [0, 100, 5000, cfg.biomassResolution ** 2 - 1]) {
      expect(cellIndexAt(cfg, cellCenterX(cfg, i), cellCenterZ(cfg, i))).toBe(i);
    }
  });
  it("clampe hors du monde", () => {
    expect(() => cellIndexAt(cfg, 1e6, -1e6)).not.toThrow();
  });
});

describe("agent", () => {
  it("createHerbivore initialise un agent vivant et déterministe", () => {
    const a = createHerbivore(1, 5, -3, createRng("a"));
    const b = createHerbivore(1, 5, -3, createRng("a"));
    expect(a).toEqual(b);
    expect(a.state).toBe("Wander");
    expect(a.energy).toBeGreaterThan(0);
  });
  it("findSpawnCell retourne une cellule d'herbe proche du centre", () => {
    const t = generateTerrain(cfg);
    const s = findSpawnCell(t, cfg);
    expect(t.zones[cellIndexAt(cfg, s.x, s.z)]).toBe(ZONE_GRASS);
    expect(Math.hypot(s.x, s.z)).toBeLessThan(cfg.sizeMeters / 4);
  });
});
```
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter**

Ajouts `packages/sim/src/biomass.ts` :
```ts
/** Index de la cellule biomasse/zone contenant (x, z) — clampé aux bords. */
export function cellIndexAt(config: WorldConfig, x: number, z: number): number {
  const b = config.biomassResolution;
  const half = config.sizeMeters / 2;
  const ix = Math.min(b - 1, Math.max(0, Math.floor(((x + half) / config.sizeMeters) * b)));
  const iz = Math.min(b - 1, Math.max(0, Math.floor(((z + half) / config.sizeMeters) * b)));
  return iz * b + ix;
}
export function cellCenterX(config: WorldConfig, i: number): number {
  const b = config.biomassResolution;
  return ((i % b) + 0.5) * (config.sizeMeters / b) - config.sizeMeters / 2;
}
export function cellCenterZ(config: WorldConfig, i: number): number {
  const b = config.biomassResolution;
  return (Math.floor(i / b) + 0.5) * (config.sizeMeters / b) - config.sizeMeters / 2;
}
```
(importer `type WorldConfig` est déjà fait dans ce fichier.)

`packages/sim/src/agent.ts` :
```ts
import type { AgentState, Rng, Transition, WorldConfig } from "@eco/shared";
import { cellCenterX, cellCenterZ } from "./biomass";
import { ZONE_GRASS, type TerrainData } from "./terrain";

/**
 * Un agent = un objet lisible (architecture §5). Champs plats (pas de Vector
 * imbriqué) : sérialisation et inspection triviales, zéro indirection.
 */
export interface Agent {
  id: number;
  species: "herbivore";
  x: number; z: number;
  vx: number; vz: number;
  heading: number;          // radians, 0 = +Z (convention rotationY de Three)
  energy: number;           // 0..1
  hydration: number;        // 0..1
  ageSeconds: number;
  state: AgentState;
  deadForSeconds: number;   // pour le despawn du cadavre
  wanderAngle: number;
  hasTarget: boolean; targetX: number; targetZ: number;
  memory: {
    hasWater: boolean; waterX: number; waterZ: number;
    hasFood: boolean; foodX: number; foodZ: number;
  };
  transitions: Transition[]; // ring buffer (16 max) pour l'inspecteur
}

export function createHerbivore(id: number, x: number, z: number, rng: Rng): Agent {
  return {
    id, species: "herbivore", x, z, vx: 0, vz: 0, heading: 0,
    energy: 0.8, hydration: 0.8, ageSeconds: 0,
    state: "Wander", deadForSeconds: 0,
    wanderAngle: rng() * Math.PI * 2,
    hasTarget: false, targetX: 0, targetZ: 0,
    memory: { hasWater: false, waterX: 0, waterZ: 0, hasFood: false, foodX: 0, foodZ: 0 },
    transitions: [],
  };
}

/** Cellule d'herbe la plus proche du centre de l'île — point de spawn stable. */
export function findSpawnCell(terrain: TerrainData, config: WorldConfig): { x: number; z: number } {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < terrain.zones.length; i++) {
    if (terrain.zones[i] !== ZONE_GRASS) continue;
    const x = cellCenterX(config, i), z = cellCenterZ(config, i);
    const d = x * x + z * z;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { x: cellCenterX(config, best), z: cellCenterZ(config, best) };
}
```
`packages/sim/src/index.ts` : ajouter `export * from "./agent";`

- [ ] **Step 3 : Vert + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck
git add -A && git commit -m "[Phase 2] Type Agent, spawn, helpers de grille"
```

---

### Task 3 : Steering — seek, arrive, wander

**Files:**
- Create: `packages/sim/src/steering.ts`
- Modify: `packages/sim/src/index.ts`
- Test: `packages/sim/src/steering.test.ts`

**Interfaces:**
- Produces :
```ts
export interface SteerOut { ax: number; az: number; }
export function seek(a: Agent, tx: number, tz: number, maxSpeed: number, maxForce: number, out: SteerOut): void;
export function arrive(a: Agent, tx: number, tz: number, slowRadius: number, maxSpeed: number, maxForce: number, out: SteerOut): void;
export function wander(a: Agent, rng: Rng, maxSpeed: number, maxForce: number, out: SteerOut): void;
```

- [ ] **Step 1 : Tests (rouge)**

`packages/sim/src/steering.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { createRng } from "@eco/shared";
import { createHerbivore } from "./agent";
import { arrive, seek, wander, type SteerOut } from "./steering";

const out: SteerOut = { ax: 0, az: 0 };
const mk = () => createHerbivore(1, 0, 0, createRng("s"));

describe("steering", () => {
  it("seek accélère vers la cible, borné par maxForce", () => {
    const a = mk();
    seek(a, 100, 0, 4, 6, out);
    expect(out.ax).toBeCloseTo(4); // désiré (4,0) − vitesse (0,0), sous maxForce
    expect(out.az).toBeCloseTo(0);
    seek(a, 0, -100, 10, 6, out); // désiré (0,−10) : norme 10 > maxForce 6
    expect(Math.hypot(out.ax, out.az)).toBeCloseTo(6);
  });

  it("arrive ralentit dans le rayon d'approche", () => {
    const far = mk();
    arrive(far, 100, 0, 6, 4, 6, out);
    const speedFar = Math.hypot(out.ax, out.az);
    const near = mk();
    arrive(near, 1, 0, 6, 4, 6, out);
    const speedNear = Math.hypot(out.ax, out.az);
    expect(speedNear).toBeLessThan(speedFar);
  });

  it("wander est déterministe et fait dériver l'angle", () => {
    const a = mk(), b = mk();
    const ra = createRng("w"), rb = createRng("w");
    const before = a.wanderAngle;
    for (let i = 0; i < 10; i++) { wander(a, ra, 4, 6, out); wander(b, rb, 4, 6, out); }
    expect(a.wanderAngle).toBe(b.wanderAngle);
    expect(a.wanderAngle).not.toBe(before);
  });
});
```
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter**

`packages/sim/src/steering.ts` :
```ts
import type { Rng } from "@eco/shared";
import type { Agent } from "./agent";

/** Sortie de steering : accélération. Rempli en place — zéro allocation. */
export interface SteerOut { ax: number; az: number; }

/** Accélération = (vitesse désirée − vitesse actuelle), bornée par maxForce. */
function steerToward(a: Agent, dvx: number, dvz: number, maxForce: number, out: SteerOut): void {
  let ax = dvx - a.vx, az = dvz - a.vz;
  const m = Math.hypot(ax, az);
  if (m > maxForce) { ax = (ax / m) * maxForce; az = (az / m) * maxForce; }
  out.ax = ax; out.az = az;
}

export function seek(a: Agent, tx: number, tz: number, maxSpeed: number, maxForce: number, out: SteerOut): void {
  const dx = tx - a.x, dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) { steerToward(a, 0, 0, maxForce, out); return; }
  steerToward(a, (dx / d) * maxSpeed, (dz / d) * maxSpeed, maxForce, out);
}

/** Comme seek, mais la vitesse désirée décroît linéairement dans slowRadius. */
export function arrive(a: Agent, tx: number, tz: number, slowRadius: number, maxSpeed: number, maxForce: number, out: SteerOut): void {
  const dx = tx - a.x, dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) { steerToward(a, 0, 0, maxForce, out); return; }
  const speed = d < slowRadius ? maxSpeed * (d / slowRadius) : maxSpeed;
  steerToward(a, (dx / d) * speed, (dz / d) * speed, maxForce, out);
}

/** Errance : le cap dérive par marche aléatoire — exploration sans but. */
export function wander(a: Agent, rng: Rng, maxSpeed: number, maxForce: number, out: SteerOut): void {
  a.wanderAngle += (rng() - 0.5) * 0.6;
  steerToward(a, Math.sin(a.wanderAngle) * maxSpeed * 0.5, Math.cos(a.wanderAngle) * maxSpeed * 0.5, maxForce, out);
}
```
`index.ts` : ajouter `export * from "./steering";`

- [ ] **Step 3 : Vert + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck
git add -A && git commit -m "[Phase 2] Steering : seek, arrive, wander (zéro alloc)"
```

---

### Task 4 : `decide()` — FSM à priorités d'interruption

**Files:**
- Create: `packages/sim/src/decide.ts`
- Modify: `packages/sim/src/index.ts`
- Test: `packages/sim/src/decide.test.ts`

**Interfaces:**
- Produces : `decide(a: Agent, p: HerbivoreParams): { state: AgentState; cause: string } | null`
  (null = pas de changement ; ne retourne JAMAIS Drink/Eat — transitions d'arrivée gérées par tickAgent).

- [ ] **Step 1 : Tests (rouge)**

`packages/sim/src/decide.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { HERBIVORE, createRng } from "@eco/shared";
import { createHerbivore } from "./agent";
import { decide } from "./decide";

const mk = () => createHerbivore(1, 0, 0, createRng("d"));

describe("decide — priorités strictes", () => {
  it("soif critique interrompt tout (même manger)", () => {
    const a = mk();
    a.state = "Eat"; a.hydration = 0.2; a.energy = 0.3;
    expect(decide(a, HERBIVORE)).toEqual({ state: "SeekWater", cause: "soif critique" });
  });
  it("faim critique passe devant la soif ordinaire", () => {
    const a = mk();
    a.state = "Wander"; a.energy = 0.2; a.hydration = 0.45; // soif non critique
    expect(decide(a, HERBIVORE)).toEqual({ state: "SeekFood", cause: "faim critique" });
  });
  it("hystérésis : on boit jusqu'à stopDrinkAt", () => {
    const a = mk();
    a.state = "Drink"; a.hydration = 0.8; a.energy = 0.9;
    expect(decide(a, HERBIVORE)).toBeNull(); // continue de boire
    a.hydration = 0.96;
    expect(decide(a, HERBIVORE)?.state).toBe("Wander");
  });
  it("après avoir mangé à satiété, va boire si soif", () => {
    const a = mk();
    a.state = "Eat"; a.energy = 0.92; a.hydration = 0.4;
    expect(decide(a, HERBIVORE)).toEqual({ state: "SeekWater", cause: "repu, soif" });
  });
  it("depuis Wander : soif ordinaire avant faim ordinaire", () => {
    const a = mk();
    a.state = "Wander"; a.hydration = 0.45; a.energy = 0.55;
    expect(decide(a, HERBIVORE)?.state).toBe("SeekWater");
  });
  it("repu et désaltéré : aucun changement", () => {
    const a = mk();
    a.state = "Wander"; a.hydration = 0.9; a.energy = 0.9;
    expect(decide(a, HERBIVORE)).toBeNull();
  });
});
```
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter**

`packages/sim/src/decide.ts` :
```ts
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
```
`index.ts` : ajouter `export * from "./decide";`

- [ ] **Step 3 : Vert + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck
git add -A && git commit -m "[Phase 2] FSM decide() à priorités d'interruption"
```

---

### Task 5 : `tickAgent` — besoins, comportements, mouvement, mort ; intégration World

**Files:**
- Create: `packages/sim/src/agentTick.ts`
- Modify: `packages/sim/src/world.ts` (agents, rng, tick, snapshot), `packages/sim/src/index.ts`
- Test: `packages/sim/src/agentTick.test.ts` + ajout dans `packages/sim/src/world.test.ts`

**Interfaces:**
- Consumes : Tasks 1-4.
- Produces :
```ts
// agentTick.ts
export function applyTransition(a: Agent, to: AgentState, cause: string, tick: number): void;
export function tickAgent(a: Agent, world: World, dt: number, rng: Rng): void;
// world.ts : World gagne agents: Agent[], rng: Rng, nextAgentId: number ;
// tickWorld fait vivre les agents et despawn les cadavres ;
// makeSnapshot remplit agents: AgentSnapshot[].
```

- [ ] **Step 1 : Tests (rouge)**

`packages/sim/src/agentTick.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { cellIndexAt } from "./biomass";
import { cellCenterX, cellCenterZ } from "./biomass";
import { createWorld, tickWorld } from "./world";

describe("un agent qui vit", () => {
  it("le monde spawne 1 herbivore sur l'herbe", () => {
    const w = createWorld();
    expect(w.agents.length).toBe(1);
    expect(w.agents[0]!.state).toBe("Wander");
  });

  it("meurt de soif dans un monde sans eau", () => {
    const w = createWorld({ waterLevel: -5 }); // plus aucune cellule d'eau
    for (let t = 0; t < 3000 && w.agents.length > 0 && w.agents[0]!.state !== "Dead"; t++) {
      tickWorld(w);
    }
    const a = w.agents[0];
    expect(a).toBeDefined();
    expect(a!.state).toBe("Dead");
    expect(a!.transitions.at(-1)!.cause).toBe("mort de soif");
  });

  it("boit quand il a soif près d'une rive", () => {
    const w = createWorld();
    const a = w.agents[0]!;
    const shore = w.terrain.shoreCells[0]!;
    a.x = cellCenterX(w.config, shore); a.z = cellCenterZ(w.config, shore);
    a.hydration = 0.3;
    for (let t = 0; t < 400; t++) tickWorld(w);
    expect(a.hydration).toBeGreaterThan(0.6);
    expect(a.transitions.some((tr) => tr.to === "Drink")).toBe(true);
    expect(a.memory.hasWater).toBe(true);
  });

  it("mange une cellule riche et la consomme", () => {
    const w = createWorld();
    const a = w.agents[0]!;
    a.energy = 0.3; a.hydration = 1.0;
    const i = cellIndexAt(w.config, a.x, a.z);
    w.biomass.values[i] = 1.0;
    for (let t = 0; t < 300; t++) tickWorld(w);
    expect(a.energy).toBeGreaterThan(0.4);
    expect(a.transitions.some((tr) => tr.to === "Eat")).toBe(true);
  });

  it("est déterministe : même graine → même trajectoire", () => {
    const w1 = createWorld(), w2 = createWorld();
    for (let t = 0; t < 500; t++) { tickWorld(w1); tickWorld(w2); }
    expect(w1.agents[0]!.x).toBe(w2.agents[0]!.x);
    expect(w1.agents[0]!.z).toBe(w2.agents[0]!.z);
    expect(w1.agents[0]!.state).toBe(w2.agents[0]!.state);
  });

  it("le cadavre disparaît après corpseDespawnSeconds", () => {
    const w = createWorld({ waterLevel: -5 });
    for (let t = 0; t < 4000 && w.agents.length > 0; t++) tickWorld(w);
    expect(w.agents.length).toBe(0);
  });
});
```
Ajouter à `world.test.ts` (dans le describe existant) :
```ts
  it("le snapshot contient les agents", () => {
    const w = createWorld();
    tickWorld(w);
    const s = makeSnapshot(w, 0);
    expect(s.agents.length).toBe(1);
    expect(s.agents[0]).toMatchObject({ id: 1, state: expect.any(String) });
  });
```
(et importer `makeSnapshot` si absent — déjà importé.)
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter `agentTick.ts`**

```ts
import { HERBIVORE, type AgentState, type HerbivoreParams, type Rng } from "@eco/shared";
import type { Agent } from "./agent";
import { cellCenterX, cellCenterZ, cellIndexAt } from "./biomass";
import { decide } from "./decide";
import { arrive, wander, type SteerOut } from "./steering";
import { ZONE_GRASS, sampleHeight } from "./terrain";
import type { World } from "./world";

const steer: SteerOut = { ax: 0, az: 0 }; // scratch module — zéro alloc par tick

export function applyTransition(a: Agent, to: AgentState, cause: string, tick: number): void {
  a.transitions.push({ tick, from: a.state, to, cause });
  if (a.transitions.length > 16) a.transitions.shift();
  a.state = to;
  a.hasTarget = false;
}

/** Rive la plus proche dans le rayon de perception ; mémorise si trouvée. */
function findNearestShore(world: World, a: Agent, maxDist: number): boolean {
  const { terrain, config } = world;
  let best = -1, bestD = maxDist * maxDist;
  for (let s = 0; s < terrain.shoreCells.length; s++) {
    const i = terrain.shoreCells[s]!;
    const dx = cellCenterX(config, i) - a.x, dz = cellCenterZ(config, i) - a.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best < 0) return false;
  a.targetX = cellCenterX(config, best); a.targetZ = cellCenterZ(config, best);
  a.hasTarget = true;
  a.memory.hasWater = true; a.memory.waterX = a.targetX; a.memory.waterZ = a.targetZ;
  return true;
}

/** Cellule mangeable la plus proche dans la perception ; mémorise si trouvée. */
function findNearestFood(world: World, a: Agent, p: HerbivoreParams): boolean {
  const { config, terrain, biomass } = world;
  const b = config.biomassResolution;
  const cell = config.sizeMeters / b;
  const half = config.sizeMeters / 2;
  const r = Math.ceil(p.perceptionRadius / cell);
  const cx = Math.min(b - 1, Math.max(0, Math.floor((a.x + half) / cell)));
  const cz = Math.min(b - 1, Math.max(0, Math.floor((a.z + half) / cell)));
  let best = -1, bestD = Infinity;
  for (let iz = Math.max(0, cz - r); iz <= Math.min(b - 1, cz + r); iz++) {
    for (let ix = Math.max(0, cx - r); ix <= Math.min(b - 1, cx + r); ix++) {
      const i = iz * b + ix;
      if (terrain.zones[i] !== ZONE_GRASS || biomass.values[i]! < p.minFoodBiomass) continue;
      const dx = cellCenterX(config, i) - a.x, dz = cellCenterZ(config, i) - a.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  if (best < 0) return false;
  a.targetX = cellCenterX(config, best); a.targetZ = cellCenterZ(config, best);
  a.hasTarget = true;
  a.memory.hasFood = true; a.memory.foodX = a.targetX; a.memory.foodZ = a.targetZ;
  return true;
}

export function tickAgent(a: Agent, world: World, dt: number, rng: Rng): void {
  const p = HERBIVORE;
  if (a.state === "Dead") { a.deadForSeconds += dt; return; }

  a.ageSeconds += dt;
  a.energy -= p.energyDecayPerSec * dt;
  a.hydration -= p.hydrationDecayPerSec * dt;
  if (a.hydration <= 0) {
    a.hydration = 0; a.vx = a.vz = 0;
    applyTransition(a, "Dead", "mort de soif", world.tickCount);
    return;
  }
  if (a.energy <= 0) {
    a.energy = 0; a.vx = a.vz = 0;
    applyTransition(a, "Dead", "mort de faim", world.tickCount);
    return;
  }

  const d = decide(a, p);
  if (d) applyTransition(a, d.state, d.cause, world.tickCount);

  steer.ax = 0; steer.az = 0;
  let moving = true;

  switch (a.state) {
    case "Wander":
      wander(a, rng, p.maxSpeed, p.maxForce, steer);
      break;
    case "SeekWater": {
      if (!a.hasTarget && !findNearestShore(world, a, p.perceptionRadius) && a.memory.hasWater) {
        a.targetX = a.memory.waterX; a.targetZ = a.memory.waterZ; a.hasTarget = true;
      }
      if (a.hasTarget) {
        arrive(a, a.targetX, a.targetZ, 6, p.maxSpeed, p.maxForce, steer);
        const dx = a.targetX - a.x, dz = a.targetZ - a.z;
        if (dx * dx + dz * dz < 4) applyTransition(a, "Drink", "arrivé à l'eau", world.tickCount);
      } else {
        wander(a, rng, p.maxSpeed, p.maxForce, steer); // explore : aucune eau connue
      }
      break;
    }
    case "Drink":
      a.hydration = Math.min(1, a.hydration + p.drinkPerSec * dt);
      a.vx = a.vz = 0; moving = false;
      break;
    case "SeekFood": {
      if (!a.hasTarget && !findNearestFood(world, a, p) && a.memory.hasFood) {
        a.targetX = a.memory.foodX; a.targetZ = a.memory.foodZ; a.hasTarget = true;
      }
      if (a.hasTarget) {
        arrive(a, a.targetX, a.targetZ, 4, p.maxSpeed, p.maxForce, steer);
        const dx = a.targetX - a.x, dz = a.targetZ - a.z;
        if (dx * dx + dz * dz < 2.25) applyTransition(a, "Eat", "arrivé sur l'herbe", world.tickCount);
      } else {
        wander(a, rng, p.maxSpeed, p.maxForce, steer);
      }
      break;
    }
    case "Eat": {
      const i = cellIndexAt(world.config, a.x, a.z);
      const avail = world.biomass.values[i]!;
      const take = Math.min(p.eatBiomassPerSec * dt, avail);
      world.biomass.values[i] = avail - take;
      a.energy = Math.min(1, a.energy + take * (p.eatEnergyPerSec / p.eatBiomassPerSec));
      a.vx = a.vz = 0; moving = false;
      if (avail - take < 0.05) {
        a.memory.hasFood = false; // cellule épuisée : l'oublier
        applyTransition(a, "SeekFood", "cellule épuisée", world.tickCount);
      }
      break;
    }
  }

  if (moving) {
    a.vx += steer.ax * dt; a.vz += steer.az * dt;
    const sp = Math.hypot(a.vx, a.vz);
    if (sp > p.maxSpeed) { a.vx = (a.vx / sp) * p.maxSpeed; a.vz = (a.vz / sp) * p.maxSpeed; }
    const nx = a.x + a.vx * dt, nz = a.z + a.vz * dt;
    // Jamais dans l'eau profonde : on boit depuis la rive.
    if (sampleHeight(world.terrain, world.config, nx, nz) >= world.config.waterLevel - 0.2) {
      a.x = nx; a.z = nz;
    } else {
      a.vx = a.vz = 0;
    }
    const lim = world.config.sizeMeters / 2 - 2;
    a.x = Math.min(lim, Math.max(-lim, a.x));
    a.z = Math.min(lim, Math.max(-lim, a.z));
    if (sp > 0.1) a.heading = Math.atan2(a.vx, a.vz);
  }
}
```

- [ ] **Step 3 : Intégrer dans `world.ts`**

```ts
// imports ajoutés :
import { HERBIVORE, type Rng } from "@eco/shared";     // fusionner avec l'existant
import { createHerbivore, findSpawnCell, type Agent } from "./agent";
import { tickAgent } from "./agentTick";

// World gagne :
//   agents: Agent[]; rng: Rng; nextAgentId: number;

// createWorld : après terrain —
const rng = createRng(config.seed + ":world");
const spawn = findSpawnCell(terrain, config);
// ... dans l'objet retourné :
//   agents: [createHerbivore(1, spawn.x, spawn.z, rng)],
//   rng, nextAgentId: 2,

// tickWorld : après regrowBiomass —
for (const a of world.agents) tickAgent(a, world, dt, world.rng);
// despawn des cadavres (rare : la boucle inverse + splice est acceptable ici)
for (let i = world.agents.length - 1; i >= 0; i--) {
  const a = world.agents[i]!;
  if (a.state === "Dead" && a.deadForSeconds > HERBIVORE.corpseDespawnSeconds) {
    world.agents.splice(i, 1);
  }
}

// makeSnapshot : remplacer agents: [] par —
agents: world.agents.map((a) => ({
  id: a.id, x: a.x, z: a.z, heading: a.heading,
  state: a.state, energy: a.energy, hydration: a.hydration,
})),
```
`index.ts` : ajouter `export * from "./agentTick";`

- [ ] **Step 4 : Vert + commit**

Run : `pnpm --filter @eco/sim test && pnpm typecheck` — le test « meurt de soif »
est le plus long (~3000 ticks) mais doit rester < 2 s.
```bash
git add -A && git commit -m "[Phase 2] tickAgent : besoins, comportements, mort ; intégration World"
```

---

### Task 6 : Client — rendu de l'agent, interpolation, inspecteur

**Files:**
- Create: `packages/client/src/render/agentsMesh.ts`, `packages/client/src/ui/inspector.ts`
- Modify: `packages/client/src/hosts/mainThreadHost.ts`, `packages/client/src/main.ts`, `packages/client/index.html`

**Interfaces:**
- Consumes : `AgentSnapshot`, `AgentDetail`, `SimHost` étendu (Task 1) ; snapshot.agents (Task 5).
- Produces :
```ts
// agentsMesh.ts
export function createAgentsMesh(scene: THREE.Scene, terrain: TerrainData, config: WorldConfig):
  { update(prev: AgentSnapshot[] | null, latest: AgentSnapshot[] | null, alpha: number): void };
// inspector.ts
export function createInspector(parent: HTMLElement): { update(d: AgentDetail | null): void };
// mainThreadHost : implémente interpolationAlpha() et getAgentDetail(id)
```

- [ ] **Step 1 : Étendre le host**

Dans `mainThreadHost.ts`, ajouter aux méthodes retournées :
```ts
    interpolationAlpha: () => accumulatorMs / tickIntervalMs,
    getAgentDetail(id: number) {
      return world.agents.find((a) => a.id === id) ?? null;
    },
```
(L'objet `Agent` vivant satisfait structurellement `AgentDetail` — en mode local
l'inspecteur lit l'état réel sans copie ; le mode distant enverra une copie.)

- [ ] **Step 2 : Mesh des agents**

`packages/client/src/render/agentsMesh.ts` :
```ts
import * as THREE from "three";
import type { AgentSnapshot, WorldConfig } from "@eco/shared";
import { sampleHeight, type TerrainData } from "@eco/sim";
import { createToonGradient } from "./materials";

/** Couleur du corps = état FSM (debug assumé — revu quand plusieurs espèces). */
const STATE_COLORS: Record<string, number> = {
  Wander: 0xf5f5f5, SeekWater: 0x42a5f5, Drink: 0x26c6da,
  SeekFood: 0xffa726, Eat: 0xffee58, Dead: 0x616161,
};

const CAPACITY = 512; // dimensionné pour la Phase 3

export function createAgentsMesh(scene: THREE.Scene, terrain: TerrainData, config: WorldConfig) {
  const geo = new THREE.SphereGeometry(0.7, 7, 5);
  geo.scale(0.9, 0.75, 1.2); // corps trapu, museau vers +Z (convention heading)
  const mat = new THREE.MeshToonMaterial({ gradientMap: createToonGradient() });
  const mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const prevById = new Map<number, AgentSnapshot>();

  return {
    /** Interpole prev→latest (alpha ∈ [0,1]) : positions lisses à 60 FPS malgré le tick 20 Hz. */
    update(prev: AgentSnapshot[] | null, latest: AgentSnapshot[] | null, alpha: number): void {
      prevById.clear();
      if (prev) for (const a of prev) prevById.set(a.id, a);
      const list = latest ?? [];
      const n = Math.min(list.length, CAPACITY);
      for (let k = 0; k < n; k++) {
        const a = list[k]!;
        const b = prevById.get(a.id);
        const x = b ? b.x + (a.x - b.x) * alpha : a.x;
        const z = b ? b.z + (a.z - b.z) * alpha : a.z;
        let heading = a.heading;
        if (b) { // interpolation d'angle par le plus court chemin
          let dh = a.heading - b.heading;
          if (dh > Math.PI) dh -= Math.PI * 2;
          if (dh < -Math.PI) dh += Math.PI * 2;
          heading = b.heading + dh * alpha;
        }
        pos.set(x, sampleHeight(terrain, config, x, z) + 0.55, z);
        quat.setFromAxisAngle(up, heading);
        m.compose(pos, quat, one);
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, color.setHex(STATE_COLORS[a.state] ?? 0xffffff));
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
```

- [ ] **Step 3 : Inspecteur**

`packages/client/src/ui/inspector.ts` :
```ts
import type { AgentDetail } from "@eco/shared";

function bar(v: number): string {
  const n = Math.round(Math.max(0, Math.min(1, v)) * 10);
  return "█".repeat(n) + "░".repeat(10 - n) + ` ${(v * 100).toFixed(0)}%`;
}

/** Panneau debug : état interne complet de l'agent suivi (architecture : débuggabilité). */
export function createInspector(parent: HTMLElement) {
  return {
    update(d: AgentDetail | null): void {
      if (!d) { parent.textContent = "aucun agent vivant"; return; }
      parent.textContent = [
        `herbivore #${d.id} — ${d.state}`,
        `énergie     ${bar(d.energy)}`,
        `hydratation ${bar(d.hydration)}`,
        `âge ${d.ageSeconds.toFixed(0)} s   pos (${d.x.toFixed(0)}, ${d.z.toFixed(0)})`,
        `mémoire : eau ${d.memory.hasWater ? "connue" : "?"} · herbe ${d.memory.hasFood ? "connue" : "?"}`,
        `— dernières transitions —`,
        ...d.transitions.slice(-5).map((t) => `#${t.tick} ${t.from} → ${t.to} (${t.cause})`),
      ].join("\n");
    },
  };
}
```

`packages/client/index.html` : ajouter dans le `<style>` :
```css
      #inspector {
        position: fixed; bottom: 8px; left: 8px; padding: 8px 10px;
        font: 12px/1.5 monospace; color: #fff3e0;
        background: rgba(25, 15, 10, 0.7); border-radius: 6px;
        pointer-events: none; white-space: pre;
      }
```
et `<div id="inspector"></div>` après `#overlay`.

- [ ] **Step 4 : Câbler `main.ts`**

Ajouter les imports :
```ts
import { createAgentsMesh } from "./render/agentsMesh";
import { createInspector } from "./ui/inspector";
```
Après `createVegetation` :
```ts
const agentsMesh = createAgentsMesh(scene, terrain, config);
const inspector = createInspector(document.querySelector<HTMLDivElement>("#inspector")!);
```
Dans la boucle : remplacer `const [, snapshot] = host.latestSnapshots();` par
`const [prevSnap, snapshot] = host.latestSnapshots();` puis, après le bloc végétation :
```ts
  agentsMesh.update(prevSnap?.agents ?? null, snapshot?.agents ?? null, host.interpolationAlpha());
```
Dans le bloc overlay lent (500 ms) :
```ts
      const watched = snapshot.agents[0];
      inspector.update(watched ? host.getAgentDetail(watched.id) : null);
```
NOTE : `terrain` dans `main.ts` doit maintenant satisfaire `TerrainData` complet →
le construire ainsi : `const terrain = { heights: host.getTerrainHeights(), zones: host.getTerrainZones(), shoreCells: new Uint32Array(0) };`
(le client n'utilise pas les rives — compromis Task 1).

- [ ] **Step 5 : Vérifier**

Run : `pnpm test && pnpm typecheck` → tout PASS.
Puis (serveur dev lancé) : capture navigateur — attendu : une petite créature claire
sur l'île qui erre, s'oriente dans sa direction de déplacement, change de couleur
selon son état (blanc errance / orange cherche à manger / jaune mange / bleu va
boire / cyan boit), et l'inspecteur en bas à gauche affiche barres + transitions.

- [ ] **Step 6 : Commit**

```bash
git add -A && git commit -m "[Phase 2] Rendu agent instancié + interpolation + inspecteur"
```

---

### Task 7 : Clôture de la Phase 2

**Files:**
- Modify: `PROGRESS.md`, `README.md` (une ligne d'état)

- [ ] **Step 1 : Vérification finale**

```bash
pnpm test && pnpm typecheck
```
Attendu : ~40 tests PASS, 0 erreur. Observation navigateur ≥ 2 min : l'agent
alterne errance/manger/boire selon ses besoins ; en le suivant on comprend chaque
choix via l'inspecteur (critère de débuggabilité du prompt initial). Screenshot
d'attestation pour Shin.

- [ ] **Step 2 : PROGRESS.md**

État actuel → Phase 2 terminée (validation Shin en attente). Paramètres à tuner :
ajouter `HERBIVORE` (`packages/shared/src/species.ts`) — décroissances, seuils FSM,
vitesses. Points fragiles : ajouter (1) recherche d'eau = scan linéaire des rives à
l'acquisition de cible (OK à 1 agent, à surveiller en Phase 3) ; (2) couleur du corps
= état FSM, à revoir multi-espèces ; (3) l'agent ignore les pentes (pas d'évitement
de roche) — steering d'évitement en Phase 3+ si gênant.

- [ ] **Step 3 : Commit de clôture**

```bash
git add -A && git commit -m "[Phase 2] Clôture : un herbivore vivant et inspectable"
```

---

## Self-review (faite à la rédaction)

- **Couverture spec Phase 2** : steering ✓ (T3), besoins faim/soif ✓ (T5), FSM ✓ (T4),
  cherche à manger/boit/meurt ✓ (T5, tests dédiés), debug overlay de l'état interne ✓ (T6).
- **Types inter-tâches** : `AgentState`/`Transition` définis en shared (T1), utilisés par
  agent/decide/agentTick ; `cellCenterX/Z` (T2) utilisés par T5 ; signatures `arrive(a, tx,
  tz, slowRadius, maxSpeed, maxForce, out)` identiques T3/T5 ; `latestSnapshots()` renvoie
  `[prev, latest]` — main.ts destructure dans cet ordre.
- **Écarts assumés** : `terrain` côté client porte un `shoreCells` vide (inutilisé au rendu) ;
  `makeSnapshot` reçoit `agents: []` dès la Task 1 pour garder le typecheck vert entre les tâches.
