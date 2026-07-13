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
