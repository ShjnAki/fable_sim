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
