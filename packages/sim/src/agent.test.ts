import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_CONFIG, createRng } from "@eco/shared";
import { createHerbivore, findSpawnCell, findSpawnCells } from "./agent";
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
