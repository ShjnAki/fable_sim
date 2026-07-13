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
