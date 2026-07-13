import { describe, expect, it } from "vitest";
import { HERBIVORE } from "@eco/shared";
import { cellCenterX, cellCenterZ, cellIndexAt } from "./biomass";
import { createWorld, tickWorld } from "./world";

describe("un agent qui vit", () => {
  it("le monde spawne initialHerbivores adultes sur l'herbe", () => {
    const w = createWorld();
    expect(w.agents.length).toBe(w.config.initialHerbivores);
    expect(w.agents[0]!.state).toBe("Wander");
    expect(w.agents[0]!.ageSeconds).toBeGreaterThanOrEqual(HERBIVORE.adultAgeSeconds);
  });

  it("meurt de vieillesse à son âge max", () => {
    const w = createWorld({ initialHerbivores: 1 });
    const a = w.agents[0]!;
    a.maxAgeSeconds = a.ageSeconds + 1; // meurt dans 1 s de sim
    for (let t = 0; t < 30 && a.state !== "Dead"; t++) tickWorld(w);
    expect(a.state).toBe("Dead");
    expect(a.transitions.at(-1)!.cause).toBe("vieillesse");
  });

  it("meurt de soif dans un monde sans eau", () => {
    const w = createWorld({ waterLevel: -5, initialHerbivores: 1 }); // plus aucune cellule d'eau
    for (let t = 0; t < 3000 && w.agents.length > 0 && w.agents[0]!.state !== "Dead"; t++) {
      tickWorld(w);
    }
    const a = w.agents[0];
    expect(a).toBeDefined();
    expect(a!.state).toBe("Dead");
    expect(a!.transitions.at(-1)!.cause).toBe("mort de soif");
  });

  it("boit quand il a soif près d'une rive", () => {
    const w = createWorld({ initialHerbivores: 1 });
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
    const w = createWorld({ initialHerbivores: 1 });
    const a = w.agents[0]!;
    a.energy = 0.3; a.hydration = 1.0;
    const i = cellIndexAt(w.config, a.x, a.z);
    w.biomass.values[i] = 1.0;
    for (let t = 0; t < 300; t++) tickWorld(w);
    expect(a.energy).toBeGreaterThan(0.4);
    expect(a.transitions.some((tr) => tr.to === "Eat")).toBe(true);
  });

  it("est déterministe : même graine → même trajectoire", () => {
    const w1 = createWorld({ initialHerbivores: 1 });
    const w2 = createWorld({ initialHerbivores: 1 });
    for (let t = 0; t < 500; t++) { tickWorld(w1); tickWorld(w2); }
    expect(w1.agents[0]!.x).toBe(w2.agents[0]!.x);
    expect(w1.agents[0]!.z).toBe(w2.agents[0]!.z);
    expect(w1.agents[0]!.state).toBe(w2.agents[0]!.state);
  });

  it("le cadavre disparaît après corpseDespawnSeconds", () => {
    const w = createWorld({ waterLevel: -5, initialHerbivores: 1 });
    for (let t = 0; t < 4000 && w.agents.length > 0; t++) tickWorld(w);
    expect(w.agents.length).toBe(0);
  });
});
