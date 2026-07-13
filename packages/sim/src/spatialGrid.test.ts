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
    agents[3]!.x = 0;
    agents[3]!.z = 0;
    const grid = createSpatialGrid(cfg);
    rebuildGrid(grid, agents);
    const found: number[] = [];
    forEachNeighbor(grid, 0, 0, 1000, (a) => found.push(a.id));
    expect(found).not.toContain(4);
    expect(found.length).toBe(9);
  });
});
