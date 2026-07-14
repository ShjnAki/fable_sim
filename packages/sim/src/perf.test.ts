import { describe, expect, it } from "vitest";
import { createWorld, tickWorld } from "./world";

describe("charge — engagement architecture §11", () => {
  it("600 agents : tick moyen < 3 ms", () => {
    // Sans carnivores : mesure comparable à la Phase 3 (600 herbivores purs).
    const w = createWorld({ initialHerbivores: 600, initialCarnivores: 0 });
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
