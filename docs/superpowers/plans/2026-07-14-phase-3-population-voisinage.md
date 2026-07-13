# Phase 3 — Population & voisinage : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Passer de 1 à N herbivores : grille spatiale, boids, reproduction par
recherche de partenaire, mort de vieillesse, graphe de population temps réel —
500+ agents à 60 FPS (tick ≤ 3 ms).

**Architecture:** Conforme au spec validé
(`docs/superpowers/specs/2026-07-14-phase-3-population-design.md`) et à
`docs/architecture.md` §6 (grille uniforme XZ, rebuild par tick) et §7 (ordre de
priorités FSM figé). Grille par tri de comptage (stable, zéro alloc en régime
permanent), boids en fonctions à état module (zéro alloc), naissance déclenchée
par le parent au plus petit id.

**Tech Stack:** identique Phases 1-2 (TS strict, pnpm, Vitest, Three.js). Aucune
dépendance nouvelle.

## Global Constraints

- TS strict ; `sim`/`shared` sans DOM/Three ; PRNG seedé uniquement (tout tirage
  vivant passe par `world.rng`) ; zéro allocation dans la boucle de tick (état
  module pour les callbacks, buffers réutilisés — les seules allocations
  tolérées : naissance d'un agent, croissance amortie de `grid.entries`,
  snapshot).
- Commits `[Phase 3] …` atomiques ; budget tick ≤ 3 ms (engagement §11).
- Ordre FSM figé : `soif critique > faim critique > fins d'action > soif > faim
  > reproduction > errance`. `decide()` reste pure, ne retourne jamais
  Drink/Eat, et ne propose SeekMate que depuis Wander.
- Déterminisme : même graine → même run. Ordre des tirages rng dans
  `createHerbivore` : wanderAngle PUIS maxAge (ne pas inverser).

## Écarts assumés vs spec (documentés ici)

1. Champ agent `nextMateAgeSeconds` (au lieu de `lastMateAgeSeconds`) : un seul
   champ porte cooldown de naissance ET délai de retry « aucun partenaire ».
2. En `SeekMate`, la séparation boids est coupée à < 4 m du partenaire — sinon
   elle empêche le contact de reproduction (< 2 m). Ailleurs : spec respecté.
3. Les 30 fondateurs spawnnent adultes, avec un `nextMateAgeSeconds` étalé
   aléatoirement (0..cooldown) pour éviter un baby-boom synchronisé au tick 1.

---

### Task 1 : Shared — paramètres espèce, `adult` dans le snapshot, config

**Files:**
- Modify: `packages/shared/src/species.ts`, `packages/shared/src/protocol.ts`,
  `packages/shared/src/config.ts`
- Modify: `packages/sim/src/world.ts` (makeSnapshot), `packages/sim/src/world.test.ts`

**Interfaces:**
- Produces (consommé par toutes les tâches suivantes) :
```ts
// species.ts — HerbivoreParams gagne :
boidsRadius: number; separationWeight: number; alignmentWeight: number;
cohesionWeight: number; adultAgeSeconds: number; mateEnergyMin: number;
mateHydrationMin: number; mateEnergyCost: number; mateCooldownSeconds: number;
mateRetrySeconds: number; maxAgeSeconds: number; maxAgeVarianceSeconds: number;
// protocol.ts — AgentSnapshot gagne : adult: boolean;
// config.ts — WorldConfig gagne : initialHerbivores: number; (défaut 30)
```

- [ ] **Step 1 : Test (rouge)**

Ajouter à `packages/sim/src/world.test.ts`, dans le describe existant :
```ts
  it("le snapshot expose adult selon l'âge", () => {
    const w = createWorld();
    const a = w.agents[0]!;
    a.ageSeconds = 0;
    expect(makeSnapshot(w, 0).agents[0]!.adult).toBe(false);
    a.ageSeconds = HERBIVORE.adultAgeSeconds;
    expect(makeSnapshot(w, 0).agents[0]!.adult).toBe(true);
  });
```
et l'import : `import { HERBIVORE } from "@eco/shared";`
Run : `pnpm --filter @eco/sim test` → FAIL (adult n'existe pas / HERBIVORE.adultAgeSeconds undefined).

- [ ] **Step 2 : Implémenter**

`packages/shared/src/species.ts` — ajouter à la fin de l'interface `HerbivoreParams` :
```ts
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
```
et aux valeurs de `HERBIVORE` :
```ts
  boidsRadius: 8, separationWeight: 1.2, alignmentWeight: 0.4, cohesionWeight: 0.35,
  adultAgeSeconds: 45, mateEnergyMin: 0.75, mateHydrationMin: 0.6,
  mateEnergyCost: 0.35, mateCooldownSeconds: 60, mateRetrySeconds: 10,
  maxAgeSeconds: 600, maxAgeVarianceSeconds: 120,
```

`packages/shared/src/protocol.ts` — dans `AgentSnapshot`, après `hydration` :
```ts
  /** true si ageSeconds ≥ adultAgeSeconds — calculé côté sim. */
  adult: boolean;
```

`packages/shared/src/config.ts` — dans `WorldConfig` :
```ts
  /** Nombre d'herbivores au démarrage du monde. */
  initialHerbivores: number;
```
et dans `DEFAULT_WORLD_CONFIG` : `initialHerbivores: 30,`

`packages/sim/src/world.ts` — dans `makeSnapshot`, le map agents devient :
```ts
    agents: world.agents.map((a) => ({
      id: a.id, x: a.x, z: a.z, heading: a.heading,
      state: a.state, energy: a.energy, hydration: a.hydration,
      adult: a.ageSeconds >= HERBIVORE.adultAgeSeconds,
    })),
```
(`HERBIVORE` est déjà importé dans world.ts depuis la Phase 2.)

- [ ] **Step 3 : Vert + typecheck + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck
git add packages/shared/src packages/sim/src
git commit -m "[Phase 3] Paramètres espèce P3, adult dans le snapshot, initialHerbivores"
```

---

### Task 2 : Agent — vieillesse, cooldown de reproduction, spawn de N fondateurs

**Files:**
- Modify: `packages/sim/src/agent.ts` (champs + `findSpawnCells`),
  `packages/sim/src/agentTick.ts` (mort de vieillesse),
  `packages/sim/src/world.ts` (spawn N adultes étalés)
- Test: `packages/sim/src/agent.test.ts`, `packages/sim/src/agentTick.test.ts`
  (adaptation des tests Phase 2 qui supposaient 1 agent)

**Interfaces:**
- Produces :
```ts
// agent.ts — Agent gagne :
maxAgeSeconds: number;      // espérance de vie individuelle (tirée au spawn)
nextMateAgeSeconds: number; // âge avant lequel pas de reproduction (cooldown/retry)
// agent.ts :
export function findSpawnCells(terrain: TerrainData, config: WorldConfig, n: number):
  { x: number; z: number }[];
// world.ts : createWorld spawne config.initialHerbivores adultes.
```

- [ ] **Step 1 : Tests (rouge)**

Ajouter à `packages/sim/src/agent.test.ts` :
```ts
describe("findSpawnCells", () => {
  it("retourne n cellules d'herbe distinctes proches du centre", () => {
    const t = generateTerrain(cfg);
    const cells = findSpawnCells(t, cfg, 30);
    expect(cells.length).toBe(30);
    const seen = new Set<number>();
    for (const s of cells) {
      const i = cellIndexAt(cfg, s.x, s.z);
      expect(t.zones[i]).toBe(ZONE_GRASS);
      expect(seen.has(i)).toBe(false);
      seen.add(i);
    }
  });
});

describe("vieillesse", () => {
  it("maxAgeSeconds est individuel et déterministe", () => {
    const a = createHerbivore(1, 0, 0, createRng("v"));
    const b = createHerbivore(1, 0, 0, createRng("v"));
    expect(a.maxAgeSeconds).toBe(b.maxAgeSeconds);
    expect(a.maxAgeSeconds).toBeGreaterThan(0);
  });
});
```
(importer `findSpawnCells` depuis `./agent`.)

Ajouter à `packages/sim/src/agentTick.test.ts` :
```ts
  it("meurt de vieillesse à son âge max", () => {
    const w = createWorld({ initialHerbivores: 1 });
    const a = w.agents[0]!;
    a.maxAgeSeconds = a.ageSeconds + 1; // meurt dans 1 s de sim
    for (let t = 0; t < 30 && a.state !== "Dead"; t++) tickWorld(w);
    expect(a.state).toBe("Dead");
    expect(a.transitions.at(-1)!.cause).toBe("vieillesse");
  });
```
Et ADAPTER les tests Phase 2 de `agentTick.test.ts` (le défaut passe à 30 agents) :
- `"le monde spawne 1 herbivore sur l'herbe"` devient :
```ts
  it("le monde spawne initialHerbivores adultes sur l'herbe", () => {
    const w = createWorld();
    expect(w.agents.length).toBe(w.config.initialHerbivores);
    expect(w.agents[0]!.state).toBe("Wander");
    expect(w.agents[0]!.ageSeconds).toBeGreaterThanOrEqual(HERBIVORE.adultAgeSeconds);
  });
```
  (importer `HERBIVORE` depuis `@eco/shared`.)
- Dans les 5 autres tests Phase 2 du fichier, remplacer chaque `createWorld()` /
  `createWorld({ waterLevel: -5 })` par `createWorld({ initialHerbivores: 1 })` /
  `createWorld({ waterLevel: -5, initialHerbivores: 1 })` (comportements
  individuels : ils restent mono-agent).

Dans `packages/sim/src/world.test.ts`, le test `"le snapshot contient les agents"` :
remplacer `expect(s.agents.length).toBe(1)` par
`expect(s.agents.length).toBe(w.config.initialHerbivores)` et
`expect(s.agents[0]).toMatchObject({ id: 1, state: expect.any(String) })` reste.

Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter**

`packages/sim/src/agent.ts` :
- Dans l'interface `Agent`, après `deadForSeconds` :
```ts
  /** Espérance de vie individuelle (moyenne ± variance, tirée au spawn). */
  maxAgeSeconds: number;
  /** Âge avant lequel pas de reproduction (cooldown après naissance, retry sinon). */
  nextMateAgeSeconds: number;
```
- Dans `createHerbivore`, importer `HERBIVORE` depuis `@eco/shared` et, après
  `wanderAngle` (ORDRE DES TIRAGES FIGÉ — déterminisme) :
```ts
    wanderAngle: rng() * Math.PI * 2,
    maxAgeSeconds: HERBIVORE.maxAgeSeconds + (rng() * 2 - 1) * HERBIVORE.maxAgeVarianceSeconds,
    nextMateAgeSeconds: 0,
```
- Ajouter après `findSpawnCell` :
```ts
/**
 * n cellules d'herbe proches du centre, espacées d'au moins une cellule
 * (greedy sur tri par distance) ; complète sans contrainte d'espacement si
 * l'île est trop petite pour n cellules espacées.
 */
export function findSpawnCells(
  terrain: TerrainData, config: WorldConfig, n: number,
): { x: number; z: number }[] {
  const b = config.biomassResolution;
  const grass: number[] = [];
  for (let i = 0; i < terrain.zones.length; i++) {
    if (terrain.zones[i] === ZONE_GRASS) grass.push(i);
  }
  grass.sort((i, j) => {
    const di = cellCenterX(config, i) ** 2 + cellCenterZ(config, i) ** 2;
    const dj = cellCenterX(config, j) ** 2 + cellCenterZ(config, j) ** 2;
    return di - dj;
  });
  const picked: number[] = [];
  const taken = new Set<number>();
  for (const i of grass) {
    if (picked.length >= n) break;
    const ix = i % b, iz = Math.floor(i / b);
    let spaced = true;
    for (const p of picked) {
      if (Math.abs((p % b) - ix) < 2 && Math.abs(Math.floor(p / b) - iz) < 2) {
        spaced = false;
        break;
      }
    }
    if (spaced) { picked.push(i); taken.add(i); }
  }
  for (const i of grass) { // complément si pas assez de cellules espacées
    if (picked.length >= n) break;
    if (!taken.has(i)) { picked.push(i); taken.add(i); }
  }
  return picked.map((i) => ({ x: cellCenterX(config, i), z: cellCenterZ(config, i) }));
}
```

`packages/sim/src/agentTick.ts` — dans `tickAgent`, juste après `a.ageSeconds += dt;` :
```ts
  if (a.ageSeconds >= a.maxAgeSeconds) {
    a.vx = a.vz = 0;
    applyTransition(a, "Dead", "vieillesse", world.tickCount);
    return;
  }
```

`packages/sim/src/world.ts` — dans `createWorld`, remplacer le spawn unique :
```ts
  const rng = createRng(config.seed + ":world");
  const spawns = findSpawnCells(terrain, config, config.initialHerbivores);
  const agents = spawns.map((s, k) => {
    const a = createHerbivore(k + 1, s.x, s.z, rng);
    // Les fondateurs sont adultes, avec un premier essai de reproduction étalé
    // dans le temps (évite un baby-boom synchronisé au tick 1).
    a.ageSeconds = HERBIVORE.adultAgeSeconds;
    a.nextMateAgeSeconds = a.ageSeconds + rng() * HERBIVORE.mateCooldownSeconds;
    return a;
  });
```
et dans l'objet retourné : `agents,` et
`nextAgentId: config.initialHerbivores + 1,`
(remplacer l'import `findSpawnCell` par `findSpawnCells`).

- [ ] **Step 3 : Vert + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck
git add packages/sim/src
git commit -m "[Phase 3] Vieillesse, cooldown reproduction, spawn de N fondateurs"
```

---

### Task 3 : Grille spatiale (tri de comptage, zéro alloc)

**Files:**
- Create: `packages/sim/src/spatialGrid.ts`
- Modify: `packages/sim/src/index.ts`
- Test: `packages/sim/src/spatialGrid.test.ts`

**Interfaces:**
- Produces :
```ts
export interface SpatialGrid { /* voir code */ }
export function createSpatialGrid(config: WorldConfig, cellSize?: number): SpatialGrid;
export function rebuildGrid(grid: SpatialGrid, agents: Agent[]): void;
export function forEachNeighbor(grid: SpatialGrid, x: number, z: number, r: number,
  fn: (a: Agent) => void): void;
```

- [ ] **Step 1 : Tests (rouge)**

`packages/sim/src/spatialGrid.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_CONFIG, createRng } from "@eco/shared";
import { createHerbivore, type Agent } from "./agent";
import { createSpatialGrid, forEachNeighbor, rebuildGrid } from "./spatialGrid";

const cfg = DEFAULT_WORLD_CONFIG;

function randomAgents(n: number, seed: string): Agent[] {
  const rng = createRng(seed);
  const list: Agent[] = [];
  for (let i = 0; i < n; i++) {
    list.push(createHerbivore(
      i + 1, (rng() - 0.5) * cfg.sizeMeters, (rng() - 0.5) * cfg.sizeMeters, rng,
    ));
  }
  return list;
}

describe("spatialGrid", () => {
  it("équivalente à la recherche force brute", () => {
    const agents = randomAgents(300, "grid");
    const grid = createSpatialGrid(cfg);
    rebuildGrid(grid, agents);
    for (const r of [5, 12, 40]) {
      for (const q of [{ x: 0, z: 0 }, { x: 100, z: -80 }, { x: -250, z: 250 }]) {
        const found: number[] = [];
        forEachNeighbor(grid, q.x, q.z, r, (a) => found.push(a.id));
        const brute = agents
          .filter((a) => (a.x - q.x) ** 2 + (a.z - q.z) ** 2 <= r * r)
          .map((a) => a.id);
        expect(found.sort((x, y) => x - y)).toEqual(brute.sort((x, y) => x - y));
      }
    }
  });

  it("ordre d'itération stable entre deux reconstructions (déterminisme)", () => {
    const agents = randomAgents(100, "stable");
    const grid = createSpatialGrid(cfg);
    rebuildGrid(grid, agents);
    const first: number[] = [];
    forEachNeighbor(grid, 0, 0, 100, (a) => first.push(a.id));
    rebuildGrid(grid, agents);
    const second: number[] = [];
    forEachNeighbor(grid, 0, 0, 100, (a) => second.push(a.id));
    expect(second).toEqual(first);
  });

  it("exclut les agents morts", () => {
    const agents = randomAgents(10, "dead");
    agents[3]!.state = "Dead";
    agents[3]!.x = 0; agents[3]!.z = 0;
    const grid = createSpatialGrid(cfg);
    rebuildGrid(grid, agents);
    const found: number[] = [];
    forEachNeighbor(grid, 0, 0, 1000, (a) => found.push(a.id));
    expect(found).not.toContain(4);
    expect(found.length).toBe(9);
  });
});
```
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter**

`packages/sim/src/spatialGrid.ts` :
```ts
import type { WorldConfig } from "@eco/shared";
import type { Agent } from "./agent";

/**
 * Grille uniforme 2D sur XZ (architecture §6), reconstruite à chaque tick par
 * tri de comptage : stable (ordre du tableau agents conservé dans chaque
 * cellule → déterminisme), zéro allocation en régime permanent (buffers
 * réutilisés ; `entries` croît de façon amortie avec la population).
 */
export interface SpatialGrid {
  cellSize: number;
  cols: number;         // grille cols × cols
  halfWorld: number;
  /** Curseurs d'écriture pendant rebuild (préfixe consommé). */
  counts: Uint32Array;  // cols² + 1
  /** starts[c]..starts[c+1] = plage de la cellule c dans entries. */
  starts: Uint32Array;  // cols² + 1
  entries: Uint32Array; // indices dans agents, groupés par cellule
  agents: Agent[];      // référence au tableau indexé par entries
}

export function createSpatialGrid(config: WorldConfig, cellSize = 10): SpatialGrid {
  const cols = Math.ceil(config.sizeMeters / cellSize);
  return {
    cellSize, cols, halfWorld: config.sizeMeters / 2,
    counts: new Uint32Array(cols * cols + 1),
    starts: new Uint32Array(cols * cols + 1),
    entries: new Uint32Array(64),
    agents: [],
  };
}

function cellOf(grid: SpatialGrid, x: number, z: number): number {
  const cx = Math.min(grid.cols - 1, Math.max(0, Math.floor((x + grid.halfWorld) / grid.cellSize)));
  const cz = Math.min(grid.cols - 1, Math.max(0, Math.floor((z + grid.halfWorld) / grid.cellSize)));
  return cz * grid.cols + cx;
}

/** Reconstruit la grille — les morts sont exclus. Deux passes : comptage, placement. */
export function rebuildGrid(grid: SpatialGrid, agents: Agent[]): void {
  grid.agents = agents;
  if (agents.length > grid.entries.length) {
    grid.entries = new Uint32Array(Math.max(agents.length, grid.entries.length * 2));
  }
  grid.counts.fill(0);
  for (const a of agents) {
    if (a.state !== "Dead") grid.counts[cellOf(grid, a.x, a.z) + 1]!++;
  }
  for (let c = 1; c < grid.counts.length; c++) grid.counts[c]! += grid.counts[c - 1]!;
  grid.starts.set(grid.counts);
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i]!;
    if (a.state === "Dead") continue;
    const c = cellOf(grid, a.x, a.z);
    grid.entries[grid.counts[c]!] = i; // counts sert de curseur d'écriture
    grid.counts[c]!++;
  }
}

/** Applique fn à chaque agent vivant à distance ≤ r de (x, z). Ordre stable. */
export function forEachNeighbor(
  grid: SpatialGrid, x: number, z: number, r: number, fn: (a: Agent) => void,
): void {
  const { cols, cellSize, halfWorld } = grid;
  const cx0 = Math.min(cols - 1, Math.max(0, Math.floor((x - r + halfWorld) / cellSize)));
  const cx1 = Math.min(cols - 1, Math.max(0, Math.floor((x + r + halfWorld) / cellSize)));
  const cz0 = Math.min(cols - 1, Math.max(0, Math.floor((z - r + halfWorld) / cellSize)));
  const cz1 = Math.min(cols - 1, Math.max(0, Math.floor((z + r + halfWorld) / cellSize)));
  const r2 = r * r;
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const c = cz * cols + cx;
      const end = grid.starts[c + 1]!;
      for (let e = grid.starts[c]!; e < end; e++) {
        const a = grid.agents[grid.entries[e]!]!;
        const dx = a.x - x, dz = a.z - z;
        if (dx * dx + dz * dz <= r2) fn(a);
      }
    }
  }
}
```
`packages/sim/src/index.ts` : ajouter `export * from "./spatialGrid";`

- [ ] **Step 3 : Vert + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck
git add packages/sim/src
git commit -m "[Phase 3] Grille spatiale uniforme : tri de comptage, requête par rayon"
```

---

### Task 4 : Boids — séparation, alignement, cohésion

**Files:**
- Create: `packages/sim/src/boids.ts`
- Modify: `packages/sim/src/index.ts`
- Test: `packages/sim/src/boids.test.ts`

**Interfaces:**
- Consumes : `forEachNeighbor` (Task 3), `SteerOut` (Phase 2).
- Produces :
```ts
export function accumulateBoids(a: Agent, grid: SpatialGrid, p: HerbivoreParams,
  fullFlock: boolean, out: SteerOut): void;
// AJOUTE les forces boids à out (déjà rempli par le comportement), puis borne
// le total par maxForce. fullFlock=false → séparation seule.
```

- [ ] **Step 1 : Tests (rouge)**

`packages/sim/src/boids.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_CONFIG, HERBIVORE, createRng } from "@eco/shared";
import { createHerbivore, type Agent } from "./agent";
import { accumulateBoids } from "./boids";
import { createSpatialGrid, rebuildGrid } from "./spatialGrid";
import type { SteerOut } from "./steering";

const cfg = DEFAULT_WORLD_CONFIG;
const out: SteerOut = { ax: 0, az: 0 };

function gridOf(agents: Agent[]) {
  const g = createSpatialGrid(cfg);
  rebuildGrid(g, agents);
  return g;
}

describe("boids", () => {
  it("la séparation écarte deux agents très proches", () => {
    const agents = [
      createHerbivore(1, 0, 0, createRng("b1")),
      createHerbivore(2, 1, 0, createRng("b2")), // voisin en +X
    ];
    out.ax = 0; out.az = 0;
    accumulateBoids(agents[0]!, gridOf(agents), HERBIVORE, false, out);
    expect(out.ax).toBeLessThan(0); // poussé vers −X
  });

  it("la cohésion tire un isolé vers le groupe (fullFlock)", () => {
    const agents = [
      createHerbivore(1, 0, 0, createRng("c1")),
      createHerbivore(2, 6, 0, createRng("c2")),
      createHerbivore(3, 7, 1, createRng("c3")),
      createHerbivore(4, 7, -1, createRng("c4")),
    ];
    out.ax = 0; out.az = 0;
    accumulateBoids(agents[0]!, gridOf(agents), HERBIVORE, true, out);
    expect(out.ax).toBeGreaterThan(0); // attiré vers +X malgré la séparation
  });

  it("sans voisin dans le rayon, out est inchangé", () => {
    const agents = [
      createHerbivore(1, 0, 0, createRng("s1")),
      createHerbivore(2, 100, 0, createRng("s2")), // hors boidsRadius
    ];
    out.ax = 1.5; out.az = -0.5;
    accumulateBoids(agents[0]!, gridOf(agents), HERBIVORE, true, out);
    expect(out.ax).toBe(1.5);
    expect(out.az).toBe(-0.5);
  });

  it("le total est borné par maxForce", () => {
    const agents = [
      createHerbivore(1, 0, 0, createRng("m1")),
      createHerbivore(2, 0.1, 0, createRng("m2")), // quasi collé : séparation énorme
    ];
    out.ax = 0; out.az = 0;
    accumulateBoids(agents[0]!, gridOf(agents), HERBIVORE, false, out);
    expect(Math.hypot(out.ax, out.az)).toBeLessThanOrEqual(HERBIVORE.maxForce + 1e-9);
  });
});
```
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter**

`packages/sim/src/boids.ts` :
```ts
import type { HerbivoreParams } from "@eco/shared";
import type { Agent } from "./agent";
import { forEachNeighbor, type SpatialGrid } from "./spatialGrid";
import type { SteerOut } from "./steering";

// État module partagé par le callback de voisinage — zéro allocation par appel.
let self: Agent;
let sepX = 0, sepZ = 0, velX = 0, velZ = 0, posX = 0, posZ = 0, count = 0;

function gather(n: Agent): void {
  if (n.id === self.id) return;
  count++;
  const dx = self.x - n.x, dz = self.z - n.z;
  const d2 = dx * dx + dz * dz;
  // Séparation pondérée par 1/d² : les très proches dominent largement.
  if (d2 > 1e-9) { sepX += dx / d2; sepZ += dz / d2; }
  velX += n.vx; velZ += n.vz;
  posX += n.x; posZ += n.z;
}

/**
 * Ajoute à out les forces de troupeau (Reynolds) calculées sur les voisins
 * dans boidsRadius, puis borne le TOTAL (comportement + boids) par maxForce.
 * fullFlock=false : séparation seule (anti-empilement hors errance).
 */
export function accumulateBoids(
  a: Agent, grid: SpatialGrid, p: HerbivoreParams, fullFlock: boolean, out: SteerOut,
): void {
  self = a;
  sepX = sepZ = velX = velZ = posX = posZ = 0;
  count = 0;
  forEachNeighbor(grid, a.x, a.z, p.boidsRadius, gather);
  if (count === 0) return;
  out.ax += sepX * p.separationWeight * p.maxSpeed;
  out.az += sepZ * p.separationWeight * p.maxSpeed;
  if (fullFlock) {
    // Alignement : rejoindre la vitesse moyenne ; cohésion : le centre de masse.
    out.ax += (velX / count - a.vx) * p.alignmentWeight;
    out.az += (velZ / count - a.vz) * p.alignmentWeight;
    out.ax += (posX / count - a.x) * p.cohesionWeight;
    out.az += (posZ / count - a.z) * p.cohesionWeight;
  }
  const m = Math.hypot(out.ax, out.az);
  if (m > p.maxForce) { out.ax = (out.ax / m) * p.maxForce; out.az = (out.az / m) * p.maxForce; }
}
```
`packages/sim/src/index.ts` : ajouter `export * from "./boids";`

- [ ] **Step 3 : Vert + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck
git add packages/sim/src
git commit -m "[Phase 3] Boids : séparation, alignement, cohésion (zéro alloc)"
```

---

### Task 5 : `decide()` — état SeekMate

**Files:**
- Modify: `packages/sim/src/decide.ts`
- Test: `packages/sim/src/decide.test.ts` (ajouts)

**Interfaces:**
- Produces :
```ts
export function isMateEligible(a: Agent, p: HerbivoreParams): boolean;
// decide() : depuis Wander uniquement, propose SeekMate si isMateEligible ;
// SeekMate est interrompu par soif/faim ORDINAIRES (retour SeekWater/SeekFood).
```

- [ ] **Step 1 : Tests (rouge)**

Ajouter à `packages/sim/src/decide.test.ts` :
```ts
describe("decide — reproduction", () => {
  const adult = () => {
    const a = mk();
    a.ageSeconds = HERBIVORE.adultAgeSeconds;
    a.nextMateAgeSeconds = 0;
    a.energy = 0.9; a.hydration = 0.9;
    return a;
  };

  it("adulte repu depuis Wander → SeekMate", () => {
    const a = adult();
    a.state = "Wander";
    expect(decide(a, HERBIVORE)).toEqual({ state: "SeekMate", cause: "prêt à se reproduire" });
  });
  it("juvénile : jamais SeekMate", () => {
    const a = adult();
    a.ageSeconds = HERBIVORE.adultAgeSeconds - 1;
    a.state = "Wander";
    expect(decide(a, HERBIVORE)).toBeNull();
  });
  it("cooldown : pas de SeekMate avant nextMateAgeSeconds", () => {
    const a = adult();
    a.nextMateAgeSeconds = a.ageSeconds + 10;
    a.state = "Wander";
    expect(decide(a, HERBIVORE)).toBeNull();
  });
  it("la soif ordinaire interrompt SeekMate", () => {
    const a = adult();
    a.state = "SeekMate"; a.hydration = 0.45;
    expect(decide(a, HERBIVORE)?.state).toBe("SeekWater");
  });
  it("la faim ordinaire interrompt SeekMate", () => {
    const a = adult();
    a.state = "SeekMate"; a.energy = 0.55;
    expect(decide(a, HERBIVORE)?.state).toBe("SeekFood");
  });
});
```
Run : `pnpm --filter @eco/sim test` → FAIL (`SeekMate` inconnu de decide,
`isMateEligible` n'existe pas — NOTE : le type `AgentState` de la Phase 2 ne
contient pas encore `"SeekMate"`, l'ajouter est la 1re étape du Step 2).

- [ ] **Step 2 : Implémenter**

`packages/shared/src/protocol.ts` — étendre le type :
```ts
export type AgentState =
  "Wander" | "SeekWater" | "Drink" | "SeekFood" | "Eat" | "SeekMate" | "Dead";
```

`packages/sim/src/decide.ts` — ajouter :
```ts
/** Éligible à la reproduction : adulte, repu, désaltéré, cooldown écoulé. */
export function isMateEligible(a: Agent, p: HerbivoreParams): boolean {
  return a.ageSeconds >= p.adultAgeSeconds
    && a.ageSeconds >= a.nextMateAgeSeconds
    && a.energy >= p.mateEnergyMin
    && a.hydration >= p.mateHydrationMin;
}
```
et dans `decide()`, AVANT le bloc `if (a.state === "Wander")` :
```ts
  if (a.state === "SeekMate") {
    if (a.hydration < p.seekWaterBelow) return { state: "SeekWater", cause: "soif" };
    if (a.energy < p.seekFoodBelow) return { state: "SeekFood", cause: "faim" };
  }
```
puis dans le bloc `Wander`, après les deux besoins ordinaires :
```ts
    if (isMateEligible(a, p)) return { state: "SeekMate", cause: "prêt à se reproduire" };
```

- [ ] **Step 3 : Vert + commit**

```bash
pnpm --filter @eco/sim test && pnpm typecheck
git add packages/shared/src packages/sim/src
git commit -m "[Phase 3] decide() : état SeekMate, éligibilité et interruptions"
```

---

### Task 6 : Monde vivant — grille par tick, boids intégrés, naissances

**Files:**
- Modify: `packages/sim/src/world.ts` (grid), `packages/sim/src/agentTick.ts`
  (boids + SeekMate + naissance)
- Test: `packages/sim/src/agentTick.test.ts` (ajouts)

**Interfaces:**
- Consumes : Tasks 1-5 (`accumulateBoids`, `isMateEligible`, `rebuildGrid`,
  `forEachNeighbor`, champs agent).
- Produces :
```ts
// world.ts : World gagne grid: SpatialGrid ; tickWorld reconstruit la grille
// avant de faire vivre les agents ; boucle agents par index figé (les
// nouveau-nés du tick ne sont pas tickés ce tick).
```

- [ ] **Step 1 : Tests (rouge)**

Ajouter à `packages/sim/src/agentTick.test.ts` :
```ts
describe("reproduction", () => {
  it("deux adultes repus proches → naissance, coût payé, cooldown", () => {
    const w = createWorld({ initialHerbivores: 2 });
    const a = w.agents[0]!, b = w.agents[1]!;
    b.x = a.x + 1; b.z = a.z;
    for (const ag of [a, b]) {
      ag.energy = 0.9; ag.hydration = 0.9; ag.nextMateAgeSeconds = 0;
    }
    for (let t = 0; t < 100 && w.agents.length === 2; t++) tickWorld(w);
    expect(w.agents.length).toBe(3);
    expect(w.agents[2]!.ageSeconds).toBeLessThan(HERBIVORE.adultAgeSeconds); // juvénile
    expect(a.energy).toBeLessThanOrEqual(0.9 - HERBIVORE.mateEnergyCost);
    expect(b.energy).toBeLessThanOrEqual(0.9 - HERBIVORE.mateEnergyCost);
    expect(a.nextMateAgeSeconds).toBeGreaterThan(a.ageSeconds);
    expect(a.transitions.some((tr) => tr.cause === "naissance")).toBe(true);
    // cooldown : pas de 2e naissance dans la foulée
    for (let t = 0; t < 200; t++) tickWorld(w);
    expect(w.agents.length).toBe(3);
  });

  it("sans partenaire à portée : retour Wander avec retry", () => {
    const w = createWorld({ initialHerbivores: 1 });
    const a = w.agents[0]!;
    a.energy = 0.9; a.hydration = 0.9; a.nextMateAgeSeconds = 0;
    tickWorld(w); // decide → SeekMate, comportement → échec → Wander
    expect(a.state).toBe("Wander");
    expect(a.transitions.some((tr) => tr.cause === "aucun partenaire")).toBe(true);
    expect(a.nextMateAgeSeconds).toBeGreaterThan(a.ageSeconds);
  });

  it("la population croît depuis les fondateurs dans un monde riche", () => {
    const w = createWorld();
    let maxPop = w.agents.length;
    for (let t = 0; t < 4000; t++) {
      tickWorld(w);
      maxPop = Math.max(maxPop, w.agents.length);
    }
    expect(maxPop).toBeGreaterThan(w.config.initialHerbivores);
  });

  it("déterminisme complet : même graine → mêmes agents après 1500 ticks", () => {
    const w1 = createWorld(), w2 = createWorld();
    for (let t = 0; t < 1500; t++) { tickWorld(w1); tickWorld(w2); }
    expect(w1.agents.map((a) => [a.id, a.x, a.z, a.state]))
      .toEqual(w2.agents.map((a) => [a.id, a.x, a.z, a.state]));
  });
});
```
Run : `pnpm --filter @eco/sim test` → FAIL.

- [ ] **Step 2 : Implémenter `agentTick.ts`**

Imports à ajouter :
```ts
import { isMateEligible } from "./decide";
import { accumulateBoids } from "./boids";
import { forEachNeighbor } from "./spatialGrid";
import { createHerbivore } from "./agent";
```

Recherche de partenaire (état module, même motif que le scratch de steering) :
```ts
// Recherche du partenaire éligible le plus proche — état module, zéro alloc.
let mateSeeker: Agent;
let mateBest: Agent | null = null;
let mateBestD2 = 0;
function considerMate(n: Agent): void {
  if (n.id === mateSeeker.id || !isMateEligible(n, HERBIVORE)) return;
  const dx = n.x - mateSeeker.x, dz = n.z - mateSeeker.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < mateBestD2) { mateBestD2 = d2; mateBest = n; }
}
function findNearestMate(world: World, a: Agent): Agent | null {
  mateSeeker = a;
  mateBest = null;
  mateBestD2 = HERBIVORE.perceptionRadius ** 2;
  forEachNeighbor(world.grid, a.x, a.z, HERBIVORE.perceptionRadius, considerMate);
  return mateBest;
}

/** Naissance : le parent au plus petit id l'exécute — jamais deux fois. */
function birth(world: World, a: Agent, mate: Agent): void {
  const p = HERBIVORE;
  const child = createHerbivore(
    world.nextAgentId++,
    (a.x + mate.x) / 2 + (world.rng() - 0.5) * 2,
    (a.z + mate.z) / 2 + (world.rng() - 0.5) * 2,
    world.rng,
  );
  world.agents.push(child);
  a.energy = Math.max(0.05, a.energy - p.mateEnergyCost);
  mate.energy = Math.max(0.05, mate.energy - p.mateEnergyCost);
  a.nextMateAgeSeconds = a.ageSeconds + p.mateCooldownSeconds;
  mate.nextMateAgeSeconds = mate.ageSeconds + p.mateCooldownSeconds;
  applyTransition(a, "Wander", "naissance", world.tickCount);
  if (mate.state === "SeekMate") applyTransition(mate, "Wander", "naissance", world.tickCount);
}
```

Dans `tickAgent`, déclarer un mode boids et l'alimenter dans le switch :
```ts
  steer.ax = 0; steer.az = 0;
  let moving = true;
  let boidsMode: 0 | 1 | 2 = 0; // 0 aucun, 1 séparation seule, 2 troupeau complet
```
- case `"Wander"` : après `wander(...)`, ajouter `boidsMode = 2;`
- cases `"SeekWater"` et `"SeekFood"` : ajouter `boidsMode = 1;` en tête de case.
- Nouveau case, après `"SeekFood"` :
```ts
    case "SeekMate": {
      const mate = findNearestMate(world, a);
      if (!mate) {
        a.nextMateAgeSeconds = a.ageSeconds + p.mateRetrySeconds;
        applyTransition(a, "Wander", "aucun partenaire", world.tickCount);
        wander(a, rng, p.maxSpeed, p.maxForce, steer);
        boidsMode = 2;
        break;
      }
      arrive(a, mate.x, mate.z, 4, p.maxSpeed, p.maxForce, steer);
      const dx = mate.x - a.x, dz = mate.z - a.z;
      const d2 = dx * dx + dz * dz;
      // À < 4 m du partenaire, la cour prime sur la séparation (écart spec
      // assumé : sinon la séparation interdit le contact à < 2 m).
      boidsMode = d2 > 16 ? 1 : 0;
      if (d2 < 4 && a.id < mate.id) birth(world, a, mate);
      break;
    }
```
- Après le switch, avant `if (moving)` :
```ts
  if (moving && boidsMode > 0) {
    accumulateBoids(a, world.grid, p, boidsMode === 2, steer);
  }
```

- [ ] **Step 3 : Intégrer dans `world.ts`**

```ts
// import :
import { createSpatialGrid, rebuildGrid, type SpatialGrid } from "./spatialGrid";

// World gagne :
//   grid: SpatialGrid;
// createWorld — dans l'objet retourné :
//   grid: createSpatialGrid(config),

// tickWorld — remplacer la boucle agents par :
  rebuildGrid(world.grid, world.agents);
  const aliveCount = world.agents.length; // les nouveau-nés du tick attendront
  for (let i = 0; i < aliveCount; i++) {
    tickAgent(world.agents[i]!, world, dt, world.rng);
  }
```
(le despawn des cadavres en boucle inverse reste inchangé, après cette boucle.)

- [ ] **Step 4 : Vert + commit**

Run : `pnpm --filter @eco/sim test && pnpm typecheck` — le test de croissance
(4000 ticks × ~30-60 agents) est le plus long, doit rester < 5 s.
```bash
git add packages/sim/src
git commit -m "[Phase 3] Monde vivant : grille par tick, boids intégrés, naissances"
```

---

### Task 7 : Client — troupeau à l'écran, graphe de population, ?pop=

**Files:**
- Create: `packages/client/src/ui/populationGraph.ts`
- Modify: `packages/client/src/render/agentsMesh.ts`,
  `packages/client/src/main.ts`, `packages/client/index.html`

**Interfaces:**
- Consumes : `AgentSnapshot.adult` (Task 1), `snapshot.agents` dynamique.
- Produces :
```ts
// populationGraph.ts
export function createPopulationGraph(canvas: HTMLCanvasElement):
  { update(simTimeSeconds: number, population: number): void };
```

- [ ] **Step 1 : agentsMesh — capacité, échelle juvénile, couleur SeekMate**

Dans `packages/client/src/render/agentsMesh.ts` :
- `const CAPACITY = 1024; // dimensionné pour le test de charge (?pop=600)`
- Ajouter à `STATE_COLORS` : `SeekMate: 0xf06292,` (rose)
- Remplacer `const one = new THREE.Vector3(1, 1, 1);` par
  `const scale = new THREE.Vector3(1, 1, 1);`
- Dans la boucle `update`, remplacer `m.compose(pos, quat, one);` par :
```ts
        const s = a.adult ? 1 : 0.6; // les juvéniles sont visiblement petits
        scale.set(s, s, s);
        m.compose(pos, quat, scale);
```

- [ ] **Step 2 : Graphe de population**

`packages/client/src/ui/populationGraph.ts` :
```ts
/**
 * Graphe de population temps réel : canvas vanilla (pas de lib — CLAUDE.md),
 * un échantillon par seconde de temps SIM, fenêtre glissante en ring buffer.
 */
export function createPopulationGraph(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const WINDOW = 600; // 600 échantillons à 1/s ≈ 10 min de sim
  const samples = new Float32Array(WINDOW);
  let count = 0;
  let head = 0;
  let lastSampledSecond = -1;

  return {
    update(simTimeSeconds: number, population: number): void {
      const s = Math.floor(simTimeSeconds);
      if (s === lastSampledSecond) return; // redessine à 1 Hz seulement
      lastSampledSecond = s;
      samples[head] = population;
      head = (head + 1) % WINDOW;
      if (count < WINDOW) count++;

      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      let max = 1;
      for (let i = 0; i < count; i++) max = Math.max(max, samples[i]!);
      ctx.strokeStyle = "#aed581";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const idx = (head - count + i + WINDOW) % WINDOW;
        const x = (i / (WINDOW - 1)) * w;
        const y = h - 4 - (samples[idx]! / max) * (h - 18);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = "#e8f5e9";
      ctx.font = "11px monospace";
      ctx.fillText(`population ${population}`, 6, 12);
    },
  };
}
```

`packages/client/index.html` — dans le `<style>` :
```css
      #popgraph {
        position: fixed; bottom: 8px; right: 8px;
        background: rgba(10, 25, 20, 0.65); border-radius: 6px;
        pointer-events: none;
      }
```
et après `<div id="inspector"></div>` :
```html
    <canvas id="popgraph" width="260" height="84"></canvas>
```

- [ ] **Step 3 : Câbler `main.ts`**

Imports :
```ts
import { createPopulationGraph } from "./ui/populationGraph";
```
Remplacer `const host = createMainThreadHost();` par :
```ts
// ?pop=600 : test de charge (critère Phase 3 : 500+ agents à 60 FPS).
const urlParams = new URLSearchParams(location.search);
const popOverride = Number(urlParams.get("pop") ?? "");
const host = createMainThreadHost(
  Number.isFinite(popOverride) && popOverride > 0
    ? { initialHerbivores: Math.floor(popOverride) }
    : {},
);
```
Après la création de l'inspecteur :
```ts
const popGraph = createPopulationGraph(document.querySelector<HTMLCanvasElement>("#popgraph")!);
```
Dans la boucle, après `agentsMesh.update(...)` :
```ts
  if (snapshot) popGraph.update(snapshot.simTimeSeconds, snapshot.agents.length);
```
Dans le bloc overlay lent (500 ms), après la ligne `veg` :
```ts
      overlay.setLine("agents", `agents ${snapshot.agents.length}`);
```
(L'inspecteur suit déjà `snapshot.agents[0]` = le plus vieux vivant : l'ordre
du tableau agents est stable — les naissances s'ajoutent en fin, le despawn
préserve l'ordre relatif. Rien à changer.)

- [ ] **Step 4 : Vérifier**

Run : `pnpm test && pnpm typecheck` → tout PASS.
Puis (UN SEUL serveur dev — tuer les instances existantes d'abord,
cf. mémoire projet) : capture navigateur — attendu : ~30 créatures en petits
troupeaux qui dérivent ensemble, des roses qui se courent après, des naissances
(petits agents à 60 % de taille), le graphe de population en bas à droite qui
monte, l'overlay qui affiche `agents N`.

- [ ] **Step 5 : Commit**

```bash
git add packages/client
git commit -m "[Phase 3] Client : troupeau, échelle juvénile, graphe de population, ?pop="
```

---

### Task 8 : Test de charge headless (engagement perf)

**Files:**
- Create: `packages/sim/src/perf.test.ts`

**Interfaces:**
- Consumes : `createWorld({ initialHerbivores: 600 })`, `tickWorld`.

- [ ] **Step 1 : Écrire le test**

`packages/sim/src/perf.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { createWorld, tickWorld } from "./world";

describe("charge — engagement architecture §11", () => {
  it("600 agents : tick moyen < 3 ms", () => {
    const w = createWorld({ initialHerbivores: 600 });
    expect(w.agents.length).toBe(600);
    for (let t = 0; t < 50; t++) tickWorld(w); // échauffement JIT
    const t0 = performance.now();
    for (let t = 0; t < 200; t++) tickWorld(w);
    const avgMs = (performance.now() - t0) / 200;
    // eslint-disable-next-line no-console
    console.log(`tick moyen à 600 agents : ${avgMs.toFixed(3)} ms`);
    expect(avgMs).toBeLessThan(3);
  });
});
```

- [ ] **Step 2 : Exécuter et JUGER**

Run : `pnpm --filter @eco/sim test -- perf` → noter la valeur loggée.
- Si PASS avec marge (< 1,5 ms) : parfait, commit.
- Si PASS juste ou FAIL : appliquer la règle CLAUDE.md n°5 — le DIRE dans le
  message de commit et PROGRESS.md, identifier le poste dominant (boids ?
  SeekMate scan ? rives ?) et arbitrer AVEC Shin avant d'optimiser à l'aveugle.

- [ ] **Step 3 : Commit**

```bash
git add packages/sim/src/perf.test.ts
git commit -m "[Phase 3] Test de charge : 600 agents, tick moyen mesuré"
```

---

### Task 9 : Clôture de la Phase 3

**Files:**
- Modify: `PROGRESS.md`, `README.md` (ligne d'état)

- [ ] **Step 1 : Vérification finale**

```bash
pnpm test && pnpm typecheck
```
Attendu : ~65+ tests PASS, 0 erreur. Observation navigateur ≥ 3 min :
troupeaux, naissances, morts de vieillesse, graphe qui oscille vers la
capacité de l'île. Test de charge `?pop=600` : FPS et tick relevés dans
l'overlay (attestation pour Shin).

- [ ] **Step 2 : PROGRESS.md**

- État actuel → Phase 3 terminée (validation Shin en attente).
- Paramètres à tuner : compléter l'entrée `HERBIVORE` (boids, seuils de
  reproduction, âge max) — noter que l'équilibre population/biomasse N'EST PAS
  encore tuné finement (c'est le travail de la Phase 4).
- Points fragiles : (1) scan SeekMate = requête grille r=60 m par tick et par
  prétendant — OK aujourd'hui, à borner si les prétendants se comptent par
  centaines ; (2) séparation coupée à < 4 m du partenaire (écart spec assumé) ;
  (3) makeSnapshot alloue N objets par tick — toléré (frontière), à passer en
  ArrayBuffer réutilisé en Phase 6 si besoin ; (4) reporter la valeur mesurée
  du tick à 600 agents.

- [ ] **Step 3 : Commit de clôture**

```bash
git add PROGRESS.md README.md
git commit -m "[Phase 3] Clôture : population vivante, troupeaux, naissances, graphe"
```

---

## Self-review (faite à la rédaction)

- **Couverture spec** : grille §1 ✓ (T3), boids §2 ✓ (T4 + intégration T6),
  reproduction §3 ✓ (T5 decide + T6 naissance), vieillesse §4 ✓ (T2), monde &
  config §5 ✓ (T1, T2, ?pop= T7), client §6 ✓ (T7), protocole §7 ✓ (T1, T5),
  perf ✓ (T8), tests 1-6 du spec ✓ (T3, T4, T6, T2, T6, T8).
- **Types inter-tâches** : `accumulateBoids(a, grid, p, fullFlock, out)`
  identique T4/T6 ; `forEachNeighbor(grid, x, z, r, fn)` identique T3/T4/T6 ;
  `isMateEligible(a, p)` T5/T6 ; `adult` T1/T7 ; `initialHerbivores` T1/T2/T7/T8.
- **Écarts spec** : listés en tête de plan (nextMateAgeSeconds, séparation
  coupée à < 4 m en cour, fondateurs adultes étalés) — à reporter dans
  PROGRESS.md à la clôture.
- **Pièges signalés** : ordre des tirages rng dans createHerbivore ; boucle
  agents par index figé (nouveau-nés non tickés le tick de leur naissance) ;
  tests Phase 2 mono-agent à basculer sur `initialHerbivores: 1`.
