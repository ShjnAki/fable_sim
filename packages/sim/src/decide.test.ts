import { describe, expect, it } from "vitest";
import { HERBIVORE, createRng } from "@eco/shared";
import { createHerbivore } from "./agent";
import { decide } from "./decide";

const mk = () => createHerbivore(1, 0, 0, createRng("d"));

describe("decide — priorités strictes", () => {
  it("soif critique interrompt tout (même manger)", () => {
    const a = mk();
    a.state = "Eat"; a.hydration = 0.2; a.energy = 0.3;
    expect(decide(a, HERBIVORE)).toEqual({ state: "SeekWater", cause: "soif critique" });
  });
  it("faim critique passe devant la soif ordinaire", () => {
    const a = mk();
    a.state = "Wander"; a.energy = 0.2; a.hydration = 0.45; // soif non critique
    expect(decide(a, HERBIVORE)).toEqual({ state: "SeekFood", cause: "faim critique" });
  });
  it("hystérésis : on boit jusqu'à stopDrinkAt", () => {
    const a = mk();
    a.state = "Drink"; a.hydration = 0.8; a.energy = 0.9;
    expect(decide(a, HERBIVORE)).toBeNull(); // continue de boire
    a.hydration = 0.96;
    expect(decide(a, HERBIVORE)?.state).toBe("Wander");
  });
  it("après avoir mangé à satiété, va boire si soif", () => {
    const a = mk();
    a.state = "Eat"; a.energy = 0.92; a.hydration = 0.4;
    expect(decide(a, HERBIVORE)).toEqual({ state: "SeekWater", cause: "repu, soif" });
  });
  it("depuis Wander : soif ordinaire avant faim ordinaire", () => {
    const a = mk();
    a.state = "Wander"; a.hydration = 0.45; a.energy = 0.55;
    expect(decide(a, HERBIVORE)?.state).toBe("SeekWater");
  });
  it("repu et désaltéré : aucun changement", () => {
    const a = mk();
    a.state = "Wander"; a.hydration = 0.9; a.energy = 0.9;
    expect(decide(a, HERBIVORE)).toBeNull();
  });
});

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
