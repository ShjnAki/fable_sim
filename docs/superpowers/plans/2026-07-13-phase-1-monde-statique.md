# Phase 1 — Monde statique : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un monde 3D observable — île procédurale cel-shadée, eau, végétation qui repousse, cycle jour/nuit, caméra libre, overlay FPS — sans aucun agent, à 60 FPS.

**Architecture:** Monorepo pnpm `shared`/`sim`/`client` (cf. `docs/architecture.md`, validé). La sim (`@eco/sim`) est du TS pur sans dépendance DOM/Three ; le client Three.js la consomme via un `SimHost` main-thread et des snapshots à tick fixe 20 Hz. Le terrain est une heightmap simplex avec falloff insulaire ; la végétation est un champ de biomasse à repousse logistique, rendu en instances.

**Tech Stack:** TypeScript strict, pnpm workspaces, Vite, Vitest, Three.js (WebGL2, `MeshToonMaterial`), `simplex-noise`.

## Global Constraints

- TypeScript **strict** partout ; `@eco/sim` et `@eco/shared` n'importent JAMAIS `three` ni d'API DOM.
- Pas d'ECS externe, pas de framework CSS/JS pour l'overlay (vanilla), cf. CLAUDE.md.
- Conventions : 1 unité = 1 mètre ; plan de sol XZ, Y vers le haut ; monde de 512 m de côté **centré sur l'origine** (x, z ∈ [-256, +256]).
- Déterminisme : toute source d'aléa passe par `createRng(seed)` de `@eco/shared` — jamais `Math.random()`.
- Zéro allocation dans les boucles chaudes (tick, boucle de rendu) hors initialisation.
- Commits au format CLAUDE.md : `[Phase 1] description courte`, atomiques.
- Budget perf (architecture §11) : frame GPU ≤ 10 ms, tick sim ≤ 3 ms (trivial en Phase 1, mais l'overlay les affiche déjà).
- Node ≥ 20, pnpm ≥ 9. Versions épinglées par le lockfile.
- Dev sous WSL2 : le serveur Vite écoute sur `--host` (navigateur côté Windows).

---

### Task 1 : Scaffold du monorepo + PRNG seedé dans `shared`

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/rng.ts`, `packages/shared/src/config.ts`
- Create: `packages/sim/package.json`, `packages/sim/tsconfig.json`, `packages/sim/src/index.ts`
- Create: `packages/client/package.json`, `packages/client/tsconfig.json`, `packages/client/src/main.ts` (stub)
- Test: `packages/shared/src/rng.test.ts`

**Interfaces:**
- Produces: `createRng(seed: string | number): Rng` avec `type Rng = () => number` (uniforme [0,1)) ; `WorldConfig` et `DEFAULT_WORLD_CONFIG` (voir code) — consommés par TOUTES les tâches suivantes.

- [ ] **Step 1 : Vérifier l'outillage**

Run : `node --version && (pnpm --version || corepack enable && pnpm --version)`
Attendu : Node ≥ 20, pnpm ≥ 9.

- [ ] **Step 2 : Écrire les fichiers racine**

`pnpm-workspace.yaml` :
```yaml
packages:
  - "packages/*"
```

`package.json` (racine) :
```json
{
  "name": "eco",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "pnpm --filter @eco/client dev",
    "test": "pnpm -r --if-present test",
    "typecheck": "pnpm -r --if-present typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.base.json` :
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

- [ ] **Step 3 : Écrire les trois packages (stubs + shared complet)**

`packages/shared/package.json` :
```json
{
  "name": "@eco/shared",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" }
}
```
> Note : `main` pointe sur la **source TS** — Vite et Vitest la compilent à la volée,
> pas de pipeline de build inter-packages. Choix assumé (monorepo-lite).

`packages/shared/tsconfig.json` :
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/sim/package.json` :
```json
{
  "name": "@eco/sim",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "@eco/shared": "workspace:*" }
}
```

`packages/sim/tsconfig.json` : identique à celui de shared.
`packages/sim/src/index.ts` : `export {};` (rempli en Task 2).

`packages/client/package.json` :
```json
{
  "name": "@eco/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@eco/shared": "workspace:*",
    "@eco/sim": "workspace:*"
  }
}
```
(`three` et Vite arrivent en Task 5.)

`packages/client/tsconfig.json` :
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```
`packages/client/src/main.ts` : `export {};` (rempli en Task 5).

`packages/shared/src/config.ts` :
```ts
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
  /** Pente (dy par mètre horizontal) au-delà de laquelle c'est de la roche. */
  rockSlope: number;
  /** Résolution de la grille de biomasse/zones (cellules par côté). */
  biomassResolution: number;
  /** Taux de repousse logistique par seconde. */
  biomassRegrowthRate: number;
  /** Durée d'un jour complet en secondes de sim. */
  dayLengthSeconds: number;
  /** Fréquence de tick de la sim (Hz). */
  tickRateHz: number;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  seed: "fable-1",
  sizeMeters: 512,
  terrainResolution: 256,
  noiseWavelength: 180,
  maxHeight: 36,
  waterLevel: 5,
  rockSlope: 0.7,
  biomassResolution: 128,
  biomassRegrowthRate: 0.08,
  dayLengthSeconds: 600,
  tickRateHz: 20,
};
```

`packages/shared/src/index.ts` :
```ts
export * from "./rng";
export * from "./config";
```

- [ ] **Step 4 : Écrire le test du PRNG (rouge)**

`packages/shared/src/rng.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

describe("createRng", () => {
  it("est déterministe : même graine → même séquence", () => {
    const a = createRng("hello");
    const b = createRng("hello");
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("des graines différentes divergent", () => {
    const a = createRng("hello");
    const b = createRng("world");
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("produit des valeurs dans [0, 1) raisonnablement réparties", () => {
    const rng = createRng(42);
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10_000).toBeGreaterThan(0.45);
    expect(sum / 10_000).toBeLessThan(0.55);
  });
});
```

- [ ] **Step 5 : Installer et vérifier l'échec**

Run : `pnpm install && pnpm --filter @eco/shared test`
Attendu : FAIL — `Cannot find module './rng'` (ou équivalent).

- [ ] **Step 6 : Implémenter le PRNG**

`packages/shared/src/rng.ts` :
```ts
/** Générateur pseudo-aléatoire : () => nombre uniforme dans [0, 1). */
export type Rng = () => number;

// xmur3 : hache une chaîne vers des entiers 32 bits (dérivation de graine).
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/**
 * mulberry32 : PRNG 32 bits rapide, largement suffisant pour une sim
 * (aucun usage cryptographique). Déterministe sur une même machine.
 */
export function createRng(seed: string | number): Rng {
  let a = typeof seed === "number" ? seed >>> 0 : xmur3(seed)();
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 7 : Vérifier le vert + typecheck**

Run : `pnpm --filter @eco/shared test && pnpm typecheck`
Attendu : 3 tests PASS ; typecheck sans erreur sur les 3 packages.

- [ ] **Step 8 : Commit**

```bash
git add -A
git commit -m "[Phase 1] Scaffold monorepo pnpm + PRNG seedé (shared)"
```

---

### Task 2 : Terrain procédural dans `sim`

**Files:**
- Create: `packages/sim/src/terrain.ts`
- Modify: `packages/sim/src/index.ts`, `packages/sim/package.json` (dépendance `simplex-noise`)
- Test: `packages/sim/src/terrain.test.ts`

**Interfaces:**
- Consumes: `createRng`, `WorldConfig`, `DEFAULT_WORLD_CONFIG` (Task 1).
- Produces (consommé par Tasks 3, 4, 6, 9) :
```ts
export const ZONE_WATER = 0; export const ZONE_GRASS = 1; export const ZONE_ROCK = 2;
export type Zone = 0 | 1 | 2;
export interface TerrainData {
  heights: Float32Array;   // (terrainResolution+1)² hauteurs, row-major (iz * (n+1) + ix)
  zones: Uint8Array;       // biomassResolution² zones aux centres de cellules
}
export function generateTerrain(config: WorldConfig): TerrainData;
export function sampleHeight(t: TerrainData, config: WorldConfig, x: number, z: number): number; // bilinéaire, coords monde
export function slopeAt(t: TerrainData, config: WorldConfig, x: number, z: number): number;      // dy par mètre horizontal
export function classifyZone(height: number, slope: number, config: WorldConfig): Zone;
```

- [ ] **Step 1 : Ajouter la dépendance bruit**

Run : `pnpm --filter @eco/sim add simplex-noise`
(`simplex-noise` v4 : zéro dépendance, accepte notre `Rng` comme source — déterminisme préservé.)

- [ ] **Step 2 : Écrire les tests (rouge)**

`packages/sim/src/terrain.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_CONFIG } from "@eco/shared";
import {
  ZONE_GRASS, ZONE_ROCK, ZONE_WATER,
  classifyZone, generateTerrain, sampleHeight, slopeAt,
} from "./terrain";

const cfg = DEFAULT_WORLD_CONFIG;

describe("generateTerrain", () => {
  it("est déterministe pour une même graine", () => {
    const a = generateTerrain(cfg);
    const b = generateTerrain(cfg);
    expect(a.heights).toEqual(b.heights);
    expect(a.zones).toEqual(b.zones);
  });

  it("a les bonnes dimensions et des hauteurs bornées", () => {
    const t = generateTerrain(cfg);
    const n = cfg.terrainResolution;
    expect(t.heights.length).toBe((n + 1) * (n + 1));
    expect(t.zones.length).toBe(cfg.biomassResolution * cfg.biomassResolution);
    for (const h of t.heights) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(cfg.maxHeight);
    }
  });

  it("le falloff insulaire garantit de l'eau au bord du monde", () => {
    const t = generateTerrain(cfg);
    const b = cfg.biomassResolution;
    // toute la première rangée de cellules (bord -Z) doit être de l'eau
    for (let ix = 0; ix < b; ix++) expect(t.zones[ix]).toBe(ZONE_WATER);
  });

  it("contient les trois zones (monde non trivial)", () => {
    const t = generateTerrain(cfg);
    const counts = [0, 0, 0];
    for (const z of t.zones) counts[z]++;
    expect(counts[ZONE_WATER]).toBeGreaterThan(0);
    expect(counts[ZONE_GRASS]).toBeGreaterThan(0);
    expect(counts[ZONE_ROCK]).toBeGreaterThan(0);
  });
});

describe("sampleHeight", () => {
  it("retombe sur la valeur de grille aux sommets exacts", () => {
    const t = generateTerrain(cfg);
    const n = cfg.terrainResolution;
    const step = cfg.sizeMeters / n;
    const half = cfg.sizeMeters / 2;
    // sommet (ix=10, iz=7)
    const x = 10 * step - half;
    const z = 7 * step - half;
    expect(sampleHeight(t, cfg, x, z)).toBeCloseTo(t.heights[7 * (n + 1) + 10]!, 5);
  });

  it("interpole entre les sommets (valeur entre min et max des 4 voisins)", () => {
    const t = generateTerrain(cfg);
    const n = cfg.terrainResolution;
    const step = cfg.sizeMeters / n;
    const half = cfg.sizeMeters / 2;
    const x = 10.5 * step - half;
    const z = 7.5 * step - half;
    const corners = [
      t.heights[7 * (n + 1) + 10]!, t.heights[7 * (n + 1) + 11]!,
      t.heights[8 * (n + 1) + 10]!, t.heights[8 * (n + 1) + 11]!,
    ];
    const v = sampleHeight(t, cfg, x, z);
    expect(v).toBeGreaterThanOrEqual(Math.min(...corners) - 1e-6);
    expect(v).toBeLessThanOrEqual(Math.max(...corners) + 1e-6);
  });

  it("clampe hors du monde au lieu de lancer", () => {
    const t = generateTerrain(cfg);
    expect(() => sampleHeight(t, cfg, 10_000, -10_000)).not.toThrow();
  });
});

describe("classifyZone", () => {
  it("eau sous le niveau d'eau", () => {
    expect(classifyZone(cfg.waterLevel - 0.1, 0, cfg)).toBe(ZONE_WATER);
  });
  it("roche au-delà de la pente seuil", () => {
    expect(classifyZone(cfg.waterLevel + 5, cfg.rockSlope + 0.1, cfg)).toBe(ZONE_ROCK);
  });
  it("herbe sinon", () => {
    expect(classifyZone(cfg.waterLevel + 5, 0.2, cfg)).toBe(ZONE_GRASS);
  });
});

describe("slopeAt", () => {
  it("est ~0 sur l'eau du bord (terrain plat à 0)", () => {
    const t = generateTerrain(cfg);
    const edge = cfg.sizeMeters / 2 - 2;
    expect(slopeAt(t, cfg, edge, edge)).toBeLessThan(0.05);
  });
});
```

- [ ] **Step 3 : Vérifier l'échec**

Run : `pnpm --filter @eco/sim test`
Attendu : FAIL — module `./terrain` introuvable.

- [ ] **Step 4 : Implémenter le terrain**

`packages/sim/src/terrain.ts` :
```ts
import { createNoise2D } from "simplex-noise";
import { createRng, type WorldConfig } from "@eco/shared";

export const ZONE_WATER = 0;
export const ZONE_GRASS = 1;
export const ZONE_ROCK = 2;
export type Zone = 0 | 1 | 2;

export interface TerrainData {
  /** (terrainResolution+1)² hauteurs en mètres, row-major : index = iz * (n+1) + ix. */
  heights: Float32Array;
  /** biomassResolution² zones, évaluées au centre de chaque cellule. */
  zones: Uint8Array;
}

/** smoothstep décroissant : 1 quand d <= inner, 0 quand d >= outer. */
function falloff(d: number, inner: number, outer: number): number {
  const t = Math.min(1, Math.max(0, (d - inner) / (outer - inner)));
  return 1 - t * t * (3 - 2 * t);
}

export function classifyZone(height: number, slope: number, config: WorldConfig): Zone {
  if (height < config.waterLevel) return ZONE_WATER;
  if (slope > config.rockSlope) return ZONE_ROCK;
  return ZONE_GRASS;
}

export function generateTerrain(config: WorldConfig): TerrainData {
  const rng = createRng(config.seed + ":terrain");
  const noise2D = createNoise2D(rng);
  const n = config.terrainResolution;
  const size = config.sizeMeters;
  const half = size / 2;

  // fBm : 4 octaves de simplex, amplitude /2 et fréquence ×2 à chaque octave.
  const heightAt = (x: number, z: number): number => {
    let amp = 1, freq = 1 / config.noiseWavelength, sum = 0, norm = 0;
    for (let o = 0; o < 4; o++) {
      sum += amp * noise2D(x * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    let h = (sum / norm + 1) / 2;      // → [0, 1]
    h = Math.pow(h, 1.4);               // aplatit les vallées, garde des sommets
    // Falloff insulaire : le relief s'éteint vers le bord → océan garanti.
    const d = Math.hypot(x, z) / half;
    return h * config.maxHeight * falloff(d, 0.55, 1.0);
  };

  const heights = new Float32Array((n + 1) * (n + 1));
  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) {
      heights[iz * (n + 1) + ix] = heightAt((ix / n) * size - half, (iz / n) * size - half);
    }
  }

  const terrain: TerrainData = { heights, zones: new Uint8Array(0) };

  // Zones aux centres des cellules de la grille biomasse.
  const b = config.biomassResolution;
  const zones = new Uint8Array(b * b);
  for (let iz = 0; iz < b; iz++) {
    for (let ix = 0; ix < b; ix++) {
      const x = ((ix + 0.5) / b) * size - half;
      const z = ((iz + 0.5) / b) * size - half;
      const h = sampleHeight(terrain, config, x, z);
      zones[iz * b + ix] = classifyZone(h, slopeAt(terrain, config, x, z), config);
    }
  }
  terrain.zones = zones;
  return terrain;
}

/** Hauteur du terrain en coordonnées monde (interpolation bilinéaire, clamp aux bords). */
export function sampleHeight(t: TerrainData, config: WorldConfig, x: number, z: number): number {
  const n = config.terrainResolution;
  const half = config.sizeMeters / 2;
  // coordonnées de grille flottantes, clampées dans [0, n]
  const gx = Math.min(n, Math.max(0, ((x + half) / config.sizeMeters) * n));
  const gz = Math.min(n, Math.max(0, ((z + half) / config.sizeMeters) * n));
  const ix = Math.min(n - 1, Math.floor(gx));
  const iz = Math.min(n - 1, Math.floor(gz));
  const fx = gx - ix, fz = gz - iz;
  const w = n + 1;
  const h00 = t.heights[iz * w + ix]!, h10 = t.heights[iz * w + ix + 1]!;
  const h01 = t.heights[(iz + 1) * w + ix]!, h11 = t.heights[(iz + 1) * w + ix + 1]!;
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

/** Pente locale (dy par mètre horizontal) par différences centrées à ±1 m. */
export function slopeAt(t: TerrainData, config: WorldConfig, x: number, z: number): number {
  const e = 1;
  const dx = (sampleHeight(t, config, x + e, z) - sampleHeight(t, config, x - e, z)) / (2 * e);
  const dz = (sampleHeight(t, config, x, z + e) - sampleHeight(t, config, x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}
```

`packages/sim/src/index.ts` :
```ts
export * from "./terrain";
```

- [ ] **Step 5 : Vérifier le vert**

Run : `pnpm --filter @eco/sim test && pnpm typecheck`
Attendu : tous les tests PASS. Si « contient les trois zones » échoue (graine
malchanceuse : pas de roche), augmenter `maxHeight` ou baisser `rockSlope` dans
`DEFAULT_WORLD_CONFIG` — ce sont des paramètres à tuner, le noter dans PROGRESS.md.

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "[Phase 1] Terrain procédural : heightmap fBm, falloff insulaire, zones"
```

---

### Task 3 : Champ de biomasse à repousse logistique

**Files:**
- Create: `packages/sim/src/biomass.ts`
- Modify: `packages/sim/src/index.ts`
- Test: `packages/sim/src/biomass.test.ts`

**Interfaces:**
- Consumes: `TerrainData`, zones (Task 2) ; `Rng` (Task 1).
- Produces (consommé par Tasks 4, 9) :
```ts
export interface BiomassField { values: Float32Array; } // biomassResolution², 0..1
export function createBiomass(terrain: TerrainData, config: WorldConfig, rng: Rng): BiomassField;
export function regrowBiomass(field: BiomassField, terrain: TerrainData, config: WorldConfig, dtSeconds: number): void;
```

- [ ] **Step 1 : Écrire les tests (rouge)**

`packages/sim/src/biomass.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_CONFIG, createRng } from "@eco/shared";
import { createBiomass, regrowBiomass } from "./biomass";
import { ZONE_GRASS, generateTerrain } from "./terrain";

const cfg = DEFAULT_WORLD_CONFIG;

describe("biomass", () => {
  it("initialise l'herbe entre 0.15 et 0.5, le reste à 0", () => {
    const t = generateTerrain(cfg);
    const f = createBiomass(t, cfg, createRng("b"));
    for (let i = 0; i < f.values.length; i++) {
      if (t.zones[i] === ZONE_GRASS) {
        expect(f.values[i]).toBeGreaterThanOrEqual(0.15);
        expect(f.values[i]).toBeLessThanOrEqual(0.5);
      } else {
        expect(f.values[i]).toBe(0);
      }
    }
  });

  it("repousse de façon monotone et sature à 1", () => {
    const t = generateTerrain(cfg);
    const f = createBiomass(t, cfg, createRng("b"));
    const i = t.zones.indexOf(ZONE_GRASS);
    const before = f.values[i]!;
    regrowBiomass(f, t, cfg, 1);
    expect(f.values[i]!).toBeGreaterThan(before);
    // 1h de sim : tout doit avoir saturé (r=0.08/s)
    for (let s = 0; s < 3600; s++) regrowBiomass(f, t, cfg, 1);
    expect(f.values[i]!).toBeGreaterThan(0.99);
    expect(f.values[i]!).toBeLessThanOrEqual(1);
  });

  it("l'eau et la roche restent à 0 après repousse", () => {
    const t = generateTerrain(cfg);
    const f = createBiomass(t, cfg, createRng("b"));
    for (let s = 0; s < 100; s++) regrowBiomass(f, t, cfg, 1);
    for (let i = 0; i < f.values.length; i++) {
      if (t.zones[i] !== ZONE_GRASS) expect(f.values[i]).toBe(0);
    }
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `pnpm --filter @eco/sim test`
Attendu : FAIL — module `./biomass` introuvable.

- [ ] **Step 3 : Implémenter**

`packages/sim/src/biomass.ts` :
```ts
import type { Rng, WorldConfig } from "@eco/shared";
import { ZONE_GRASS, type TerrainData } from "./terrain";

/** Végétation = champ scalaire 0..1 par cellule, pas des entités (architecture §8). */
export interface BiomassField {
  values: Float32Array;
}

export function createBiomass(terrain: TerrainData, config: WorldConfig, rng: Rng): BiomassField {
  const values = new Float32Array(config.biomassResolution ** 2);
  for (let i = 0; i < values.length; i++) {
    // Départ volontairement bas : la repousse doit être VISIBLE en Phase 1.
    if (terrain.zones[i] === ZONE_GRASS) values[i] = 0.15 + 0.35 * rng();
  }
  return { values };
}

/**
 * Repousse logistique : db/dt = r·b·(1−b). C'est l'« amortisseur » clé de
 * l'équilibre futur (Phase 4) : repousse rapide à mi-charge, lente près de 0 et 1.
 * L'init à ≥ 0.15 garantit b>0 (la logistique ne redémarre pas de zéro).
 */
export function regrowBiomass(
  field: BiomassField, terrain: TerrainData, config: WorldConfig, dtSeconds: number,
): void {
  const r = config.biomassRegrowthRate;
  const v = field.values;
  for (let i = 0; i < v.length; i++) {
    if (terrain.zones[i] !== ZONE_GRASS) continue;
    const b = v[i]!;
    v[i] = Math.min(1, b + r * b * (1 - b) * dtSeconds);
  }
}
```

`packages/sim/src/index.ts` : ajouter `export * from "./biomass";`

- [ ] **Step 4 : Vérifier le vert + commit**

Run : `pnpm --filter @eco/sim test && pnpm typecheck`
Attendu : PASS.

```bash
git add -A
git commit -m "[Phase 1] Champ de biomasse à repousse logistique"
```

---

### Task 4 : `World`, horloge, tick, snapshot, interface `SimHost`

**Files:**
- Create: `packages/sim/src/world.ts`, `packages/shared/src/protocol.ts`
- Modify: `packages/sim/src/index.ts`, `packages/shared/src/index.ts`
- Test: `packages/sim/src/world.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces (consommé par Tasks 8, 9 ; le protocole est LE point de couplage sim↔client, architecture §2) :
```ts
// @eco/shared (protocol.ts)
export interface TickSnapshot {
  tickCount: number;
  simTimeSeconds: number;
  timeOfDay: number;            // 0..1 — 0 = minuit, 0.5 = midi
  lastTickDurationMs: number;   // mesure perf, affichée par l'overlay
}
export interface SimHost {
  update(nowMs: number): void;                    // à appeler chaque frame
  getConfig(): WorldConfig;
  getTerrainHeights(): Float32Array;              // statique, lu une fois
  getTerrainZones(): Uint8Array;                  // statique, lu une fois
  getBiomass(): Float32Array;                     // vue lecture seule, cadence libre
  latestSnapshots(): readonly [TickSnapshot | null, TickSnapshot | null]; // [avant-dernier, dernier]
  setSpeed(multiplier: number): void;
}
// @eco/sim (world.ts)
export interface World { config; terrain; biomass; simTimeSeconds; tickCount; }
export function createWorld(overrides?: Partial<WorldConfig>): World;
export function tickWorld(world: World): void;    // avance d'exactement 1/tickRateHz
export function timeOfDay(world: World): number;
export function makeSnapshot(world: World, lastTickDurationMs: number): TickSnapshot;
```
> NOTE assumée (architecture §13) : les getters statiques sont synchrones —
> le passage au Worker (Phase 3) les rendra asynchrones. Décision documentée, pas un oubli.

- [ ] **Step 1 : Écrire les tests (rouge)**

`packages/sim/src/world.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { createWorld, makeSnapshot, tickWorld, timeOfDay } from "./world";
import { ZONE_GRASS } from "./terrain";

describe("world", () => {
  it("createWorld est déterministe (même graine → mêmes hauteurs et biomasse)", () => {
    const a = createWorld();
    const b = createWorld();
    expect(a.terrain.heights).toEqual(b.terrain.heights);
    expect(a.biomass.values).toEqual(b.biomass.values);
  });

  it("tickWorld avance le temps d'exactement 1/tickRateHz", () => {
    const w = createWorld();
    const t0 = w.simTimeSeconds;
    tickWorld(w);
    expect(w.simTimeSeconds).toBeCloseTo(t0 + 1 / w.config.tickRateHz, 9);
    expect(w.tickCount).toBe(1);
  });

  it("timeOfDay est dans [0,1) et boucle après un jour complet", () => {
    const w = createWorld({ dayLengthSeconds: 10 });
    const start = timeOfDay(w);
    const ticksPerDay = 10 * w.config.tickRateHz;
    for (let i = 0; i < ticksPerDay; i++) tickWorld(w);
    expect(timeOfDay(w)).toBeCloseTo(start, 5);
  });

  it("la biomasse pousse au fil des ticks", () => {
    const w = createWorld();
    const i = w.terrain.zones.indexOf(ZONE_GRASS);
    const before = w.biomass.values[i]!;
    for (let t = 0; t < 200; t++) tickWorld(w);
    expect(w.biomass.values[i]!).toBeGreaterThan(before);
  });

  it("makeSnapshot expose les champs du protocole", () => {
    const w = createWorld();
    tickWorld(w);
    const s = makeSnapshot(w, 1.5);
    expect(s.tickCount).toBe(1);
    expect(s.simTimeSeconds).toBe(w.simTimeSeconds);
    expect(s.timeOfDay).toBeGreaterThanOrEqual(0);
    expect(s.timeOfDay).toBeLessThan(1);
    expect(s.lastTickDurationMs).toBe(1.5);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `pnpm --filter @eco/sim test`
Attendu : FAIL — module `./world` introuvable.

- [ ] **Step 3 : Implémenter protocole + monde**

`packages/shared/src/protocol.ts` :
```ts
import type { WorldConfig } from "./config";

/** État émis par la sim à chaque tick. Seul canal sim → rendu (architecture §2). */
export interface TickSnapshot {
  tickCount: number;
  simTimeSeconds: number;
  /** 0..1 : 0 = minuit, 0.25 = aube, 0.5 = midi, 0.75 = crépuscule. */
  timeOfDay: number;
  lastTickDurationMs: number;
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
  setSpeed(multiplier: number): void;
}
```

`packages/shared/src/index.ts` : ajouter `export * from "./protocol";`

`packages/sim/src/world.ts` :
```ts
import {
  DEFAULT_WORLD_CONFIG, createRng, type TickSnapshot, type WorldConfig,
} from "@eco/shared";
import { createBiomass, regrowBiomass, type BiomassField } from "./biomass";
import { generateTerrain, type TerrainData } from "./terrain";

export interface World {
  config: WorldConfig;
  terrain: TerrainData;
  biomass: BiomassField;
  simTimeSeconds: number;
  tickCount: number;
}

export function createWorld(overrides: Partial<WorldConfig> = {}): World {
  const config: WorldConfig = { ...DEFAULT_WORLD_CONFIG, ...overrides };
  const terrain = generateTerrain(config);
  return {
    config,
    terrain,
    biomass: createBiomass(terrain, config, createRng(config.seed + ":biomass")),
    // On démarre en matinée (30 % du jour) pour que la première vue soit éclairée.
    simTimeSeconds: 0.3 * config.dayLengthSeconds,
    tickCount: 0,
  };
}

/** Avance la sim d'exactement un tick (pas fixe — architecture §4). */
export function tickWorld(world: World): void {
  const dt = 1 / world.config.tickRateHz;
  world.simTimeSeconds += dt;
  world.tickCount += 1;
  regrowBiomass(world.biomass, world.terrain, world.config, dt);
}

export function timeOfDay(world: World): number {
  const t = world.simTimeSeconds / world.config.dayLengthSeconds;
  return t - Math.floor(t);
}

export function makeSnapshot(world: World, lastTickDurationMs: number): TickSnapshot {
  return {
    tickCount: world.tickCount,
    simTimeSeconds: world.simTimeSeconds,
    timeOfDay: timeOfDay(world),
    lastTickDurationMs,
  };
}
```

`packages/sim/src/index.ts` : ajouter `export * from "./world";`

- [ ] **Step 4 : Vérifier le vert + commit**

Run : `pnpm --filter @eco/sim test && pnpm typecheck`
Attendu : PASS.

```bash
git add -A
git commit -m "[Phase 1] World + tick fixe + snapshot + interface SimHost"
```

---

### Task 5 : Bootstrap client — Vite, Three.js, overlay FPS

**Files:**
- Create: `packages/client/index.html`, `packages/client/vite.config.ts`
- Create: `packages/client/src/main.ts` (remplace le stub), `packages/client/src/render/scene.ts`, `packages/client/src/ui/overlay.ts`, `packages/client/src/ui/frameStats.ts`
- Modify: `packages/client/package.json` (deps three/vite), `packages/client/tsconfig.json`
- Test: `packages/client/src/ui/frameStats.test.ts`

**Interfaces:**
- Produces (consommé par Tasks 6-9) :
```ts
// scene.ts
export interface SceneCtx { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; }
export function createScene(canvas: HTMLCanvasElement): SceneCtx;
// frameStats.ts
export function createFrameStats(windowMs?: number): {
  addFrame(frameMs: number): void;
  fps(): number;        // moyenne glissante
  avgFrameMs(): number;
};
// overlay.ts
export function createOverlay(parent: HTMLElement): { setLine(key: string, text: string): void };
```

- [ ] **Step 1 : Dépendances**

Run : `pnpm --filter @eco/client add three && pnpm --filter @eco/client add -D vite @types/three`

- [ ] **Step 2 : Test des stats de frame (rouge)**

`packages/client/src/ui/frameStats.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { createFrameStats } from "./frameStats";

describe("frameStats", () => {
  it("calcule la moyenne sur la fenêtre", () => {
    const s = createFrameStats(1000);
    for (let i = 0; i < 60; i++) s.addFrame(16.67);
    expect(s.avgFrameMs()).toBeCloseTo(16.67, 1);
    expect(s.fps()).toBeCloseTo(60, 0);
  });

  it("oublie les frames hors fenêtre", () => {
    const s = createFrameStats(100); // fenêtre de 100 ms
    for (let i = 0; i < 20; i++) s.addFrame(33.3); // 666 ms → seules ~3 restent
    for (let i = 0; i < 10; i++) s.addFrame(10);
    expect(s.avgFrameMs()).toBeLessThan(15);
  });

  it("retourne 0 sans données", () => {
    const s = createFrameStats();
    expect(s.fps()).toBe(0);
    expect(s.avgFrameMs()).toBe(0);
  });
});
```

Run : `pnpm --filter @eco/client test` → Attendu : FAIL (module introuvable).

- [ ] **Step 3 : Implémenter frameStats**

`packages/client/src/ui/frameStats.ts` :
```ts
/** Moyenne glissante des durées de frame sur une fenêtre temporelle. */
export function createFrameStats(windowMs = 1000) {
  const frames: number[] = [];
  let total = 0;
  return {
    addFrame(frameMs: number): void {
      frames.push(frameMs);
      total += frameMs;
      while (total > windowMs && frames.length > 1) total -= frames.shift()!;
    },
    avgFrameMs(): number {
      return frames.length === 0 ? 0 : total / frames.length;
    },
    fps(): number {
      const avg = frames.length === 0 ? 0 : total / frames.length;
      return avg === 0 ? 0 : 1000 / avg;
    },
  };
}
```

Run : `pnpm --filter @eco/client test` → Attendu : PASS.

- [ ] **Step 4 : Fichiers d'app**

`packages/client/index.html` :
```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Écosystème</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; }
      #app { width: 100%; height: 100%; display: block; }
      #overlay {
        position: fixed; top: 8px; left: 8px; padding: 8px 10px;
        font: 12px/1.5 monospace; color: #e8f5e9;
        background: rgba(10, 25, 20, 0.65); border-radius: 6px;
        pointer-events: none; white-space: pre;
      }
    </style>
  </head>
  <body>
    <canvas id="app"></canvas>
    <div id="overlay"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`packages/client/vite.config.ts` :
```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: { host: true }, // WSL2 : accessible depuis le navigateur Windows
});
```

`packages/client/tsconfig.json` (remplacer) :
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["vite/client"], "lib": ["ES2022", "DOM"] },
  "include": ["src", "vite.config.ts"]
}
```

`packages/client/src/render/scene.ts` :
```ts
import * as THREE from "three";

export interface SceneCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function createScene(canvas: HTMLCanvasElement): SceneCtx {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ed4ff);

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.5, 2000,
  );
  camera.position.set(0, 120, 260);
  camera.lookAt(0, 0, 0);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
```

`packages/client/src/ui/overlay.ts` :
```ts
/** Overlay debug : lignes clé→texte, mises à jour à cadence lente (2 Hz). */
export function createOverlay(parent: HTMLElement) {
  const lines = new Map<string, string>();
  return {
    setLine(key: string, text: string): void {
      lines.set(key, text);
      parent.textContent = [...lines.values()].join("\n");
    },
  };
}
```

`packages/client/src/main.ts` :
```ts
import { createScene } from "./render/scene";
import { createFrameStats } from "./ui/frameStats";
import { createOverlay } from "./ui/overlay";

const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const { scene, camera, renderer } = createScene(canvas);
const overlay = createOverlay(document.querySelector<HTMLDivElement>("#overlay")!);
const stats = createFrameStats();

let last = performance.now();
let lastOverlayUpdate = 0;

renderer.setAnimationLoop((now) => {
  const frameMs = now - last;
  last = now;
  stats.addFrame(frameMs);

  if (now - lastOverlayUpdate > 500) {
    lastOverlayUpdate = now;
    overlay.setLine("fps", `FPS ${stats.fps().toFixed(0)}  (${stats.avgFrameMs().toFixed(1)} ms)`);
  }

  renderer.render(scene, camera);
});

export {}; // module
```

- [ ] **Step 5 : Vérification visuelle**

Run : `pnpm dev` puis ouvrir l'URL affichée (réseau, WSL2) dans le navigateur.
Attendu : plein écran bleu ciel, overlay en haut à gauche affichant `FPS 60 (16.7 ms)` (ou la fréquence de l'écran). Console navigateur sans erreur.

- [ ] **Step 6 : Typecheck + commit**

Run : `pnpm typecheck` → sans erreur.
```bash
git add -A
git commit -m "[Phase 1] Client bootstrap : Vite + Three.js + overlay FPS"
```

---

### Task 6 : Maillage du terrain + eau, matériaux toon

**Files:**
- Create: `packages/client/src/render/materials.ts`, `packages/client/src/render/terrainMesh.ts`, `packages/client/src/render/waterMesh.ts`
- Modify: `packages/client/src/main.ts`

**Interfaces:**
- Consumes: `generateTerrain`, `sampleHeight`, `slopeAt`, `classifyZone`, zones (Task 2) ; `DEFAULT_WORLD_CONFIG` (Task 1) ; `SceneCtx` (Task 5).
- Produces:
```ts
// materials.ts
export function createToonGradient(steps?: number): THREE.Texture; // gradient 4 paliers partagé
// terrainMesh.ts
export function buildTerrainMesh(terrain: TerrainData, config: WorldConfig): THREE.Mesh;
// waterMesh.ts
export function buildWaterMesh(config: WorldConfig): THREE.Mesh;
```

- [ ] **Step 1 : Matériau toon partagé**

`packages/client/src/render/materials.ts` :
```ts
import * as THREE from "three";

/**
 * Gradient à paliers pour MeshToonMaterial : c'est LUI qui donne le rendu
 * cel-shading (bandes de lumière discrètes façon Wind Waker).
 */
export function createToonGradient(steps = 4): THREE.Texture {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    // paliers de 40% à 100% de luminosité — jamais noir total
    data[i] = Math.round(255 * (0.4 + (0.6 * i) / (steps - 1)));
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
```

- [ ] **Step 2 : Maillage du terrain avec couleurs par sommet**

`packages/client/src/render/terrainMesh.ts` :
```ts
import * as THREE from "three";
import type { WorldConfig } from "@eco/shared";
import {
  ZONE_ROCK, ZONE_WATER, classifyZone, sampleHeight, slopeAt, type TerrainData,
} from "@eco/sim";
import { createToonGradient } from "./materials";

// Palette Wind Waker : saturée, chaleureuse.
const GRASS_LOW = new THREE.Color(0x4caf50);
const GRASS_HIGH = new THREE.Color(0x8bc34a);
const ROCK = new THREE.Color(0x8d8d93);
const SAND = new THREE.Color(0xe8d59b);

export function buildTerrainMesh(terrain: TerrainData, config: WorldConfig): THREE.Mesh {
  const n = config.terrainResolution;
  const size = config.sizeMeters;
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2); // plan XZ, Y vers le haut

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = sampleHeight(terrain, config, x, z);
    pos.setY(i, h);

    // Couleur par sommet : mêmes règles de zone que la sim (classifyZone),
    // plus une bande de sable purement visuelle près de l'eau.
    const zone = classifyZone(h, slopeAt(terrain, config, x, z), config);
    if (zone === ZONE_ROCK) c.copy(ROCK);
    else if (zone === ZONE_WATER || h < config.waterLevel + 1.2) c.copy(SAND);
    else c.lerpColors(GRASS_LOW, GRASS_HIGH, Math.min(1, h / config.maxHeight));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  pos.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonGradient(),
  });
  return new THREE.Mesh(geo, mat);
}
```

- [ ] **Step 3 : Plan d'eau**

`packages/client/src/render/waterMesh.ts` :
```ts
import * as THREE from "three";
import type { WorldConfig } from "@eco/shared";
import { createToonGradient } from "./materials";

export function buildWaterMesh(config: WorldConfig): THREE.Mesh {
  // Déborde du monde (×1.6) pour donner un horizon d'océan.
  const geo = new THREE.PlaneGeometry(config.sizeMeters * 1.6, config.sizeMeters * 1.6);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshToonMaterial({
    color: 0x2e9ad0,
    gradientMap: createToonGradient(),
    transparent: true,
    opacity: 0.88,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = config.waterLevel;
  return mesh;
}
```

- [ ] **Step 4 : Intégration dans `main.ts`**

Modifier `packages/client/src/main.ts` — après la création de la scène, ajouter
(terrain généré directement pour l'instant ; le `SimHost` prend le relais en Task 8) :
```ts
import * as THREE from "three";
import { DEFAULT_WORLD_CONFIG } from "@eco/shared";
import { generateTerrain } from "@eco/sim";
import { buildTerrainMesh } from "./render/terrainMesh";
import { buildWaterMesh } from "./render/waterMesh";

const config = DEFAULT_WORLD_CONFIG;
const terrain = generateTerrain(config);
scene.add(buildTerrainMesh(terrain, config));
scene.add(buildWaterMesh(config));

// Éclairage provisoire (remplacé par le cycle jour/nuit en Task 8)
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(200, 300, 100);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x6a8f5a, 0.5));
```

- [ ] **Step 5 : Vérification visuelle**

Run : `pnpm dev`
Attendu : une île en relief cel-shadée (bandes de lumière visibles sur les pentes),
herbe verte, roche grise sur les pentes fortes, sable au bord de l'eau, océan bleu
jusqu'à l'horizon. FPS toujours ~60. Ajuster `maxHeight`/`waterLevel` dans
`DEFAULT_WORLD_CONFIG` si l'île est trop plate ou trop noyée (noter dans PROGRESS.md).

- [ ] **Step 6 : Typecheck + commit**

```bash
pnpm typecheck
git add -A
git commit -m "[Phase 1] Terrain maillé + eau, rendu toon Wind Waker"
```

---

### Task 7 : Caméra libre (orbite + WASD)

**Files:**
- Create: `packages/client/src/render/cameraControls.ts`
- Modify: `packages/client/src/main.ts`

**Interfaces:**
- Consumes: `SceneCtx` (Task 5).
- Produces: `createCameraControls(camera, domElement, config): { update(deltaSeconds: number): void }` — à appeler chaque frame.

- [ ] **Step 1 : Implémenter**

`packages/client/src/render/cameraControls.ts` :
```ts
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { WorldConfig } from "@eco/shared";

/**
 * Souris = orbite/zoom (OrbitControls). ZQSD/WASD + flèches = translation de la
 * cible sur le plan du sol, relative au cap de la caméra.
 */
export function createCameraControls(
  camera: THREE.PerspectiveCamera, domElement: HTMLElement, config: WorldConfig,
) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // jamais sous l'horizon
  controls.minDistance = 10;
  controls.maxDistance = 600;
  controls.target.set(0, 10, 0);

  const pressed = new Set<string>();
  window.addEventListener("keydown", (e) => pressed.add(e.code));
  window.addEventListener("keyup", (e) => pressed.delete(e.code));

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const SPEED = 80; // m/s
  const limit = config.sizeMeters * 0.75;

  return {
    update(deltaSeconds: number): void {
      // Axes de déplacement projetés sur le plan du sol.
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, new THREE.Vector3(0, -1, 0)); // gauche caméra
      move.set(0, 0, 0);
      if (pressed.has("KeyW") || pressed.has("KeyZ") || pressed.has("ArrowUp")) move.add(forward);
      if (pressed.has("KeyS") || pressed.has("ArrowDown")) move.sub(forward);
      if (pressed.has("KeyA") || pressed.has("KeyQ") || pressed.has("ArrowLeft")) move.add(right);
      if (pressed.has("KeyD") || pressed.has("ArrowRight")) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(SPEED * deltaSeconds);
        controls.target.add(move);
        camera.position.add(move);
        // On reste au-dessus du monde (pas de vol au-delà de l'océan utile).
        controls.target.x = THREE.MathUtils.clamp(controls.target.x, -limit, limit);
        controls.target.z = THREE.MathUtils.clamp(controls.target.z, -limit, limit);
      }
      controls.update();
    },
  };
}
```

- [ ] **Step 2 : Intégrer dans `main.ts`**

```ts
import { createCameraControls } from "./render/cameraControls";
// ...
const cameraControls = createCameraControls(camera, renderer.domElement, config);
// dans la boucle d'animation, avant renderer.render :
cameraControls.update(frameMs / 1000);
```

- [ ] **Step 3 : Vérification visuelle**

Run : `pnpm dev`
Attendu : clic-glisser = orbite ; molette = zoom ; ZQSD/WASD/flèches = déplacement
fluide au-dessus de l'île ; impossible de passer sous l'horizon ; amortissement doux.

- [ ] **Step 4 : Typecheck + commit**

```bash
pnpm typecheck
git add -A
git commit -m "[Phase 1] Caméra libre : orbite + déplacement clavier"
```

---

### Task 8 : `MainThreadSimHost`, boucle à pas fixe, cycle jour/nuit

**Files:**
- Create: `packages/client/src/loop/accumulator.ts`, `packages/client/src/hosts/mainThreadHost.ts`, `packages/client/src/render/dayNight.ts`
- Modify: `packages/client/src/main.ts` (le terrain vient désormais du host)
- Test: `packages/client/src/loop/accumulator.test.ts`

**Interfaces:**
- Consumes: `SimHost`, `TickSnapshot` (Task 4) ; `createWorld`, `tickWorld`, `makeSnapshot` (Task 4).
- Produces:
```ts
// accumulator.ts
export interface StepResult { ticksToRun: number; accumulatorMs: number; }
export function advanceAccumulator(accumulatorMs: number, frameDeltaMs: number, tickIntervalMs: number, maxTicksPerFrame: number): StepResult;
// mainThreadHost.ts
export function createMainThreadHost(overrides?: Partial<WorldConfig>): SimHost;
// dayNight.ts
export function createDayNight(scene: THREE.Scene): { update(timeOfDay: number): void };
export function formatTimeOfDay(t: number): string; // "HH:MM" pour l'overlay
```

- [ ] **Step 1 : Test de l'accumulateur (rouge)**

`packages/client/src/loop/accumulator.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { advanceAccumulator } from "./accumulator";

describe("advanceAccumulator", () => {
  it("accumule sans tick tant que l'intervalle n'est pas atteint", () => {
    const r = advanceAccumulator(0, 16.7, 50, 5);
    expect(r.ticksToRun).toBe(0);
    expect(r.accumulatorMs).toBeCloseTo(16.7);
  });

  it("émet un tick et conserve le reste", () => {
    const r = advanceAccumulator(48, 16.7, 50, 5);
    expect(r.ticksToRun).toBe(1);
    expect(r.accumulatorMs).toBeCloseTo(14.7);
  });

  it("émet plusieurs ticks après une longue frame", () => {
    const r = advanceAccumulator(0, 120, 50, 5);
    expect(r.ticksToRun).toBe(2);
    expect(r.accumulatorMs).toBeCloseTo(20);
  });

  it("plafonne les ticks et jette le surplus (anti spirale de la mort)", () => {
    const r = advanceAccumulator(0, 5000, 50, 5);
    expect(r.ticksToRun).toBe(5);
    expect(r.accumulatorMs).toBe(0);
  });
});
```

Run : `pnpm --filter @eco/client test` → FAIL attendu.

- [ ] **Step 2 : Implémenter l'accumulateur**

`packages/client/src/loop/accumulator.ts` :
```ts
export interface StepResult {
  ticksToRun: number;
  accumulatorMs: number;
}

/**
 * Pas fixe classique : le temps réel s'accumule, on exécute autant de ticks
 * entiers que possible. Le plafond évite la « spirale de la mort » (une frame
 * lente qui déclenche N ticks qui ralentissent la frame suivante…) : au-delà,
 * on JETTE le temps en trop — la sim ralentit, elle n'explose pas.
 */
export function advanceAccumulator(
  accumulatorMs: number, frameDeltaMs: number, tickIntervalMs: number, maxTicksPerFrame: number,
): StepResult {
  let acc = accumulatorMs + frameDeltaMs;
  let ticks = Math.floor(acc / tickIntervalMs);
  if (ticks > maxTicksPerFrame) {
    return { ticksToRun: maxTicksPerFrame, accumulatorMs: 0 };
  }
  return { ticksToRun: ticks, accumulatorMs: acc - ticks * tickIntervalMs };
}
```

Run : `pnpm --filter @eco/client test` → PASS attendu.

- [ ] **Step 3 : Le host main-thread**

`packages/client/src/hosts/mainThreadHost.ts` :
```ts
import type { SimHost, TickSnapshot, WorldConfig } from "@eco/shared";
import { createWorld, makeSnapshot, tickWorld } from "@eco/sim";
import { advanceAccumulator } from "../loop/accumulator";

/** Sim dans le thread principal — le rendu reste spectateur (architecture §2). */
export function createMainThreadHost(overrides: Partial<WorldConfig> = {}): SimHost {
  const world = createWorld(overrides);
  const tickIntervalMs = 1000 / world.config.tickRateHz;
  let accumulatorMs = 0;
  let lastNowMs: number | null = null;
  let speed = 1;
  let prev: TickSnapshot | null = null;
  let latest: TickSnapshot | null = null;

  return {
    update(nowMs: number): void {
      const frameDelta = lastNowMs === null ? 0 : (nowMs - lastNowMs) * speed;
      lastNowMs = nowMs;
      const step = advanceAccumulator(accumulatorMs, frameDelta, tickIntervalMs, 8);
      accumulatorMs = step.accumulatorMs;
      for (let i = 0; i < step.ticksToRun; i++) {
        const t0 = performance.now();
        tickWorld(world);
        prev = latest;
        latest = makeSnapshot(world, performance.now() - t0);
      }
    },
    getConfig: () => world.config,
    getTerrainHeights: () => world.terrain.heights,
    getTerrainZones: () => world.terrain.zones,
    getBiomass: () => world.biomass.values,
    latestSnapshots: () => [prev, latest] as const,
    setSpeed(multiplier: number): void {
      speed = multiplier;
    },
  };
}
```

- [ ] **Step 4 : Cycle jour/nuit**

`packages/client/src/render/dayNight.ts` :
```ts
import * as THREE from "three";

/** Keyframes du cycle : minuit → aube → midi → crépuscule → minuit. */
interface Key {
  t: number;
  sky: number; sunColor: number; sunIntensity: number; hemiIntensity: number;
}
const KEYS: Key[] = [
  { t: 0.0, sky: 0x0d1b2e, sunColor: 0x8fb7ff, sunIntensity: 0.05, hemiIntensity: 0.12 },
  { t: 0.25, sky: 0xffc48a, sunColor: 0xffb36b, sunIntensity: 0.7, hemiIntensity: 0.35 },
  { t: 0.5, sky: 0x8ed4ff, sunColor: 0xffffff, sunIntensity: 1.2, hemiIntensity: 0.5 },
  { t: 0.75, sky: 0xff9e6b, sunColor: 0xff8c4d, sunIntensity: 0.7, hemiIntensity: 0.3 },
  { t: 1.0, sky: 0x0d1b2e, sunColor: 0x8fb7ff, sunIntensity: 0.05, hemiIntensity: 0.12 },
];

export function formatTimeOfDay(t: number): string {
  const minutes = Math.floor(t * 24 * 60);
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function createDayNight(scene: THREE.Scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x6a8f5a, 0.5);
  scene.add(sun, hemi);
  scene.fog = new THREE.Fog(0x8ed4ff, 400, 1400);
  const sky = new THREE.Color();
  const sunColor = new THREE.Color();
  const a = new THREE.Color(), b = new THREE.Color();

  return {
    update(timeOfDay: number): void {
      // interpolation entre les deux keyframes encadrantes
      let i = 0;
      while (KEYS[i + 1]!.t < timeOfDay) i++;
      const k0 = KEYS[i]!, k1 = KEYS[i + 1]!;
      const f = (timeOfDay - k0.t) / (k1.t - k0.t);

      sky.lerpColors(a.setHex(k0.sky), b.setHex(k1.sky), f);
      sunColor.lerpColors(a.setHex(k0.sunColor), b.setHex(k1.sunColor), f);
      (scene.background as THREE.Color).copy(sky);
      (scene.fog as THREE.Fog).color.copy(sky);
      sun.color.copy(sunColor);
      sun.intensity = THREE.MathUtils.lerp(k0.sunIntensity, k1.sunIntensity, f);
      hemi.intensity = THREE.MathUtils.lerp(k0.hemiIntensity, k1.hemiIntensity, f);

      // Course du soleil : lever à l'est (t=0.25), zénith à midi, sous l'horizon la nuit.
      const angle = timeOfDay * Math.PI * 2 - Math.PI / 2;
      sun.position.set(Math.cos(angle) * 400, Math.sin(angle) * 400, 120);
    },
  };
}
```

- [ ] **Step 5 : Réécrire `main.ts` autour du host**

`packages/client/src/main.ts` (version complète) :
```ts
import { createMainThreadHost } from "./hosts/mainThreadHost";
import { createCameraControls } from "./render/cameraControls";
import { createDayNight, formatTimeOfDay } from "./render/dayNight";
import { createScene } from "./render/scene";
import { buildTerrainMesh } from "./render/terrainMesh";
import { buildWaterMesh } from "./render/waterMesh";
import { createFrameStats } from "./ui/frameStats";
import { createOverlay } from "./ui/overlay";

const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const { scene, camera, renderer } = createScene(canvas);
const overlay = createOverlay(document.querySelector<HTMLDivElement>("#overlay")!);
const stats = createFrameStats();

// La sim tourne « ailleurs » (ici : main thread) ; le rendu n'est que spectateur.
const host = createMainThreadHost();
const config = host.getConfig();
const terrain = { heights: host.getTerrainHeights(), zones: host.getTerrainZones() };

scene.add(buildTerrainMesh(terrain, config));
scene.add(buildWaterMesh(config));
const dayNight = createDayNight(scene);
const cameraControls = createCameraControls(camera, renderer.domElement, config);

let last = performance.now();
let lastOverlayUpdate = 0;

renderer.setAnimationLoop((now) => {
  const frameMs = now - last;
  last = now;
  stats.addFrame(frameMs);

  host.update(now);
  const [, snapshot] = host.latestSnapshots();
  if (snapshot) dayNight.update(snapshot.timeOfDay);

  cameraControls.update(frameMs / 1000);

  if (now - lastOverlayUpdate > 500) {
    lastOverlayUpdate = now;
    overlay.setLine("fps", `FPS ${stats.fps().toFixed(0)}  (${stats.avgFrameMs().toFixed(1)} ms)`);
    if (snapshot) {
      overlay.setLine("tick", `tick ${snapshot.lastTickDurationMs.toFixed(2)} ms  (#${snapshot.tickCount})`);
      overlay.setLine("time", `heure ${formatTimeOfDay(snapshot.timeOfDay)}`);
    }
  }

  renderer.render(scene, camera);
});
```

- [ ] **Step 6 : Vérification visuelle du cycle complet**

Run : `pnpm dev`. Pour vérifier un cycle entier sans attendre 10 min, passer
temporairement `dayLengthSeconds: 60` dans `createMainThreadHost({ dayLengthSeconds: 60 })`.
Attendu : aube orangée → midi bleu clair → crépuscule → nuit sombre bleutée, le
soleil tourne, l'overlay affiche l'heure et la durée du tick (< 1 ms). **Remettre
la valeur par défaut avant commit.**

- [ ] **Step 7 : Tests + typecheck + commit**

```bash
pnpm test && pnpm typecheck
git add -A
git commit -m "[Phase 1] SimHost main-thread, pas fixe 20 Hz, cycle jour/nuit"
```

---

### Task 9 : Végétation instanciée nourrie par la biomasse

**Files:**
- Create: `packages/client/src/render/vegetation.ts`
- Modify: `packages/client/src/main.ts`

**Interfaces:**
- Consumes: `SimHost.getBiomass()`, zones, `sampleHeight` (Tasks 2, 4, 8) ; `createRng` (Task 1).
- Produces: `createVegetation(terrain, config, scene): { refresh(biomass: Float32Array): void; count: number }` — `refresh` appelée à cadence lente (~1 Hz), pas à chaque frame.

- [ ] **Step 1 : Implémenter**

`packages/client/src/render/vegetation.ts` :
```ts
import * as THREE from "three";
import { createRng, type WorldConfig } from "@eco/shared";
import { ZONE_GRASS, sampleHeight, type TerrainData } from "@eco/sim";
import { createToonGradient } from "./materials";

/**
 * Une touffe (cône low-poly) par cellule d'herbe, en InstancedMesh (1 draw call).
 * L'échelle verticale de chaque touffe suit la biomasse de sa cellule : le monde
 * « verdit » à l'œil nu quand la végétation repousse.
 */
export function createVegetation(
  terrain: TerrainData, config: WorldConfig, scene: THREE.Scene,
) {
  const rng = createRng(config.seed + ":veg");
  const b = config.biomassResolution;
  const cellSize = config.sizeMeters / b;
  const half = config.sizeMeters / 2;

  // Une instance par cellule d'herbe : position fixée à l'init, jitter déterministe.
  const cells: number[] = [];
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < terrain.zones.length; i++) {
    if (terrain.zones[i] !== ZONE_GRASS) continue;
    const ix = i % b, iz = Math.floor(i / b);
    const x = (ix + 0.2 + rng() * 0.6) * cellSize - half;
    const z = (iz + 0.2 + rng() * 0.6) * cellSize - half;
    cells.push(i);
    positions.push(new THREE.Vector3(x, sampleHeight(terrain, config, x, z), z));
  }

  const geo = new THREE.ConeGeometry(0.5, 1.4, 5);
  geo.translate(0, 0.7, 0); // pivot à la base : scale.y fait « pousser » la touffe
  const mat = new THREE.MeshToonMaterial({ gradientMap: createToonGradient() });
  const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Teinte verte légèrement variée par instance (cel-shading moins uniforme).
  const green = new THREE.Color();
  for (let k = 0; k < cells.length; k++) {
    green.setHSL(0.31 + rng() * 0.06, 0.55, 0.32 + rng() * 0.12);
    mesh.setColorAt(k, green);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();

  return {
    count: cells.length,
    /** À appeler à cadence lente (~1 Hz) — réécrit toutes les matrices (peu coûteux). */
    refresh(biomass: Float32Array): void {
      for (let k = 0; k < cells.length; k++) {
        const bio = biomass[cells[k]!]!;
        // sous 0.05 : invisible ; sinon la touffe grandit avec la biomasse
        const sy = bio < 0.05 ? 0.0001 : 0.25 + 0.75 * bio;
        s.set(0.6 + 0.4 * bio, sy, 0.6 + 0.4 * bio);
        m.compose(positions[k]!, q, s);
        mesh.setMatrixAt(k, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
```

- [ ] **Step 2 : Intégrer dans `main.ts`**

```ts
import { createVegetation } from "./render/vegetation";
// ... après le terrain :
const vegetation = createVegetation(terrain, config, scene);
vegetation.refresh(host.getBiomass());

// dans la boucle, à cadence lente (toutes les ~1.2 s de sim, pas chaque frame) :
let lastVegTick = 0;
// ... dans setAnimationLoop, après host.update :
if (snapshot && snapshot.tickCount - lastVegTick >= 25) {
  lastVegTick = snapshot.tickCount;
  vegetation.refresh(host.getBiomass());
}
// ... dans le bloc overlay :
overlay.setLine("veg", `végétation ${vegetation.count} touffes`);
```

- [ ] **Step 3 : Vérification visuelle + perf**

Run : `pnpm dev`
Attendu : touffes coniques vertes sur toute l'herbe (≈ 6 000-10 000 instances,
affiché dans l'overlay), absentes de la roche/eau/sable. En laissant tourner
2-3 minutes : les touffes grandissent visiblement (repousse logistique).
**FPS toujours ≥ 60, tick < 3 ms** — c'est le critère d'engagement de l'architecture.

- [ ] **Step 4 : Typecheck + commit**

```bash
pnpm typecheck
git add -A
git commit -m "[Phase 1] Végétation instanciée pilotée par la biomasse"
```

---

### Task 10 : Clôture de la Phase 1

**Files:**
- Create: `README.md`
- Modify: `PROGRESS.md`

- [ ] **Step 1 : Vérification finale complète**

```bash
pnpm test && pnpm typecheck
```
Attendu : tous les tests des 3 packages PASS, typecheck sans erreur.
Puis `pnpm dev` et dérouler la checklist de sortie de phase :
- [ ] balade caméra fluide sur toute l'île à ~60 FPS ;
- [ ] cycle jour/nuit complet observable (tester avec `dayLengthSeconds: 60`, puis remettre) ;
- [ ] végétation qui grandit sur 2-3 minutes ;
- [ ] overlay : FPS, frame ms, tick ms, heure, nb touffes ;
- [ ] console navigateur sans erreur ni warning Three.js.

- [ ] **Step 2 : README**

`README.md` :
```markdown
# Écosystème 3D — agents autonomes

Simulation d'écosystème 3D dans le navigateur (voir `docs/architecture.md`).

## Démarrer

​```bash
pnpm install
pnpm dev        # client Vite (— --host pour WSL2)
pnpm test       # tests des 3 packages
pnpm typecheck
​```

Contrôles : souris = orbite/zoom, ZQSD/WASD/flèches = déplacement.

## État

Phase 1 (monde statique) — voir `PROGRESS.md`.
```
(Retirer les zero-width chars des fences imbriquées lors de l'écriture réelle.)

- [ ] **Step 3 : Mettre à jour PROGRESS.md**

Section « État actuel » : Phase 1 terminée, Phase 2 à venir.
Section « Paramètres à tuner » — reporter les valeurs constatées :
`noiseWavelength`, `maxHeight`, `waterLevel`, `rockSlope` (forme de l'île),
`biomassRegrowthRate` (vitesse de verdissement), `dayLengthSeconds`.
Section « Points fragiles » :
- getters statiques de `SimHost` synchrones — deviendront async au passage Worker (Phase 3) ;
- `vegetation.refresh` réécrit toutes les matrices — optimiser (cellules sales) si ça pèse un jour ;
- pas d'ombres portées (choix perf assumé, architecture §9).
Historique : Phase 1 → terminée, avec la date.

- [ ] **Step 4 : Commit de clôture**

```bash
git add -A
git commit -m "[Phase 1] Clôture : monde statique complet, PROGRESS à jour"
```

---

## Self-review (faite à la rédaction)

- **Couverture spec Phase 1** : terrain ✓ (T2/T6), caméra libre ✓ (T7), cycle jour/nuit ✓ (T8), ressources qui repoussent ✓ (T3/T9), 60 FPS + overlay ✓ (T5/T9), monorepo ✓ (T1), sim découplée/snapshots ✓ (T4/T8).
- **Types inter-tâches vérifiés** : `TerrainData` sans `config` embarqué → toutes les signatures prennent `(terrain, config)` ; `buildTerrainMesh(terrain, config)` cohérent avec l'appel de T8 ; `latestSnapshots()` retourne `[prev, latest]` partout.
- **Écart assumé vs architecture** : pas d'interpolation entre snapshots en Phase 1 (rien ne bouge assez vite ; `timeOfDay` à 20 Hz est déjà lisse). L'interpolation arrive en Phase 2 avec le premier agent mobile.
