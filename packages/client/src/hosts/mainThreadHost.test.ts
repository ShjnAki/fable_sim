import { describe, expect, it } from "vitest";
import { createMainThreadHost } from "./mainThreadHost";

describe("mainThreadHost — commandes Phase 5", () => {
  it("spawnAgent ajoute un agent au monde", () => {
    const host = createMainThreadHost({ initialHerbivores: 5, initialCarnivores: 0 });
    host.update(0);
    host.update(100); // fait tourner quelques ticks
    const before = host.latestSnapshots()[1]!.agents.length;
    host.spawnAgent("human", 0, 0);
    host.update(200);
    const after = host.latestSnapshots()[1]!.agents.length;
    expect(after).toBe(before + 1);
    expect(host.latestSnapshots()[1]!.agents.some((a) => a.species === "human")).toBe(true);
  });

  it("applyEnvironment(drought) baisse la biomasse", () => {
    const host = createMainThreadHost({ initialHerbivores: 5, initialCarnivores: 0 });
    const v = host.getBiomass();
    const before = v.reduce((s, x) => s + x, 0);
    host.applyEnvironment("drought");
    const after = host.getBiomass().reduce((s, x) => s + x, 0);
    expect(after).toBeLessThan(before);
  });

  it("getSpeed reflète setSpeed", () => {
    const host = createMainThreadHost();
    host.setSpeed(4);
    expect(host.getSpeed()).toBe(4);
  });
});
