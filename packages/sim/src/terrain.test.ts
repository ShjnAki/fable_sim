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
    for (const z of t.zones) counts[z]!++;
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

describe("rivières", () => {
  it("ajoutent des cellules de rive (points où boire) sur l'île", () => {
    const sansRivieres = generateTerrain({ ...cfg, riverWidth: 0 });
    const avecRivieres = generateTerrain(cfg); // défaut : rivières activées
    expect(avecRivieres.shoreCells.length).toBeGreaterThan(sansRivieres.shoreCells.length);
  });
  it("creusent de l'eau à l'intérieur de l'île (pas seulement au bord)", () => {
    const t = generateTerrain(cfg);
    const b = cfg.biomassResolution;
    // Une bande centrale (loin des bords) contient de l'eau grâce aux rivières.
    let interiorWater = 0;
    for (let iz = b / 3; iz < (2 * b) / 3; iz++) {
      for (let ix = b / 3; ix < (2 * b) / 3; ix++) {
        if (t.zones[iz * b + ix] === ZONE_WATER) interiorWater++;
      }
    }
    expect(interiorWater).toBeGreaterThan(0);
  });
});

describe("pont central", () => {
  it("offre une terre franchissable au-dessus de l'eau au centre", () => {
    const t = generateTerrain(cfg);
    expect(sampleHeight(t, cfg, 0, 0)).toBeGreaterThanOrEqual(cfg.waterLevel);
  });
});

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

describe("slopeAt", () => {
  it("est ~0 sur l'eau du bord (terrain plat à 0)", () => {
    const t = generateTerrain(cfg);
    const edge = cfg.sizeMeters / 2 - 2;
    expect(slopeAt(t, cfg, edge, edge)).toBeLessThan(0.05);
  });
});
