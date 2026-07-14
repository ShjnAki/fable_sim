import { describe, expect, it } from "vitest";
import { CARNIVORE, HERBIVORE } from "./species";

describe("cohérence des paramètres d'espèces", () => {
  it("le sprint du carnivore dépasse la fuite à pleine énergie", () => {
    expect(CARNIVORE.sprintSpeed).toBeGreaterThan(HERBIVORE.maxSpeed * HERBIVORE.fleeBoost);
  });
  it("la fuite d'un affamé est plus lente que le sprint", () => {
    expect(HERBIVORE.maxSpeed * HERBIVORE.fleeBoost * 0.7).toBeLessThan(CARNIVORE.sprintSpeed);
  });
  it("l'hystérésis de fuite est cohérente", () => {
    expect(HERBIVORE.fleeSafeRadius).toBeGreaterThan(HERBIVORE.fleeTriggerRadius);
  });
});
