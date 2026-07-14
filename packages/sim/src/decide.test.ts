import { describe, expect, it } from "vitest";
import { CARNIVORE, HERBIVORE, createRng } from "@eco/shared";
import { createCarnivore, createHerbivore } from "./agent";
import { decideCarnivore, decideHerbivore } from "./decide";

const mk = () => createHerbivore(1, 0, 0, createRng("d"));

describe("decide — priorités strictes", () => {
  it("soif critique interrompt tout (même manger)", () => {
    const a = mk();
    a.state = "Eat"; a.hydration = 0.2; a.energy = 0.3;
    expect(decideHerbivore(a, HERBIVORE)).toEqual({ state: "SeekWater", cause: "soif critique" });
  });
  it("faim critique passe devant la soif ordinaire", () => {
    const a = mk();
    a.state = "Wander"; a.energy = 0.2; a.hydration = 0.45; // soif non critique
    expect(decideHerbivore(a, HERBIVORE)).toEqual({ state: "SeekFood", cause: "faim critique" });
  });
  it("hystérésis : on boit jusqu'à stopDrinkAt", () => {
    const a = mk();
    a.state = "Drink"; a.hydration = 0.8; a.energy = 0.9;
    expect(decideHerbivore(a, HERBIVORE)).toBeNull(); // continue de boire
    a.hydration = 0.96;
    expect(decideHerbivore(a, HERBIVORE)?.state).toBe("Wander");
  });
  it("après avoir mangé à satiété, va boire si soif", () => {
    const a = mk();
    a.state = "Eat"; a.energy = 0.92; a.hydration = 0.4;
    expect(decideHerbivore(a, HERBIVORE)).toEqual({ state: "SeekWater", cause: "repu, soif" });
  });
  it("depuis Wander : soif ordinaire avant faim ordinaire", () => {
    const a = mk();
    a.state = "Wander"; a.hydration = 0.45; a.energy = 0.55;
    expect(decideHerbivore(a, HERBIVORE)?.state).toBe("SeekWater");
  });
  it("repu et désaltéré : aucun changement", () => {
    const a = mk();
    a.state = "Wander"; a.hydration = 0.9; a.energy = 0.9;
    expect(decideHerbivore(a, HERBIVORE)).toBeNull();
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
    expect(decideHerbivore(a, HERBIVORE)).toEqual({ state: "SeekMate", cause: "prêt à se reproduire" });
  });
  it("juvénile : jamais SeekMate", () => {
    const a = adult();
    a.ageSeconds = HERBIVORE.adultAgeSeconds - 1;
    a.state = "Wander";
    expect(decideHerbivore(a, HERBIVORE)).toBeNull();
  });
  it("cooldown : pas de SeekMate avant nextMateAgeSeconds", () => {
    const a = adult();
    a.nextMateAgeSeconds = a.ageSeconds + 10;
    a.state = "Wander";
    expect(decideHerbivore(a, HERBIVORE)).toBeNull();
  });
  it("la soif ordinaire interrompt SeekMate", () => {
    const a = adult();
    a.state = "SeekMate"; a.hydration = 0.45;
    expect(decideHerbivore(a, HERBIVORE)?.state).toBe("SeekWater");
  });
  it("la faim ordinaire interrompt SeekMate", () => {
    const a = adult();
    a.state = "SeekMate"; a.energy = 0.55;
    expect(decideHerbivore(a, HERBIVORE)?.state).toBe("SeekFood");
  });
});

describe("decideHerbivore — fuite", () => {
  it("une menace interrompt tout, même la soif critique", () => {
    const a = mk();
    a.state = "SeekWater"; a.hydration = 0.1;
    a.hasThreat = true;
    expect(decideHerbivore(a, HERBIVORE)).toEqual({ state: "Flee", cause: "prédateur !" });
  });
  it("en fuite avec menace : on ne pense à rien d'autre", () => {
    const a = mk();
    a.state = "Flee"; a.hasThreat = true; a.hydration = 0.1; a.energy = 0.1;
    expect(decideHerbivore(a, HERBIVORE)).toBeNull();
  });
  it("menace écartée : retour à l'errance", () => {
    const a = mk();
    a.state = "Flee"; a.hasThreat = false;
    expect(decideHerbivore(a, HERBIVORE)?.cause).toBe("danger écarté");
  });
});

describe("decideCarnivore", () => {
  const mkc = () => createCarnivore(1, 0, 0, createRng("dc"));

  it("la soif critique interrompt la chasse", () => {
    const a = mkc();
    a.state = "Hunt"; a.hydration = 0.2;
    expect(decideCarnivore(a, CARNIVORE)?.state).toBe("SeekWater");
  });
  it("faim sous huntBelow depuis Wander → Hunt", () => {
    const a = mkc();
    a.state = "Wander"; a.energy = 0.5; a.hydration = 0.9;
    expect(decideCarnivore(a, CARNIVORE)).toEqual({ state: "Hunt", cause: "faim" });
  });
  it("faim critique interrompt SeekWater ordinaire", () => {
    const a = mkc();
    a.state = "SeekWater"; a.energy = 0.2; a.hydration = 0.4; // soif NON critique
    expect(decideCarnivore(a, CARNIVORE)).toEqual({ state: "Hunt", cause: "faim critique" });
  });
  it("le cooldown de chasse bloque Hunt", () => {
    const a = mkc();
    a.state = "Wander"; a.energy = 0.5; a.hydration = 0.9;
    a.nextHuntAgeSeconds = a.ageSeconds + 10;
    expect(decideCarnivore(a, CARNIVORE)).toBeNull();
  });
  it("repu et désaltéré, adulte : SeekMate", () => {
    const a = mkc();
    a.state = "Wander"; a.energy = 0.9; a.hydration = 0.9;
    a.ageSeconds = CARNIVORE.adultAgeSeconds; a.nextMateAgeSeconds = 0;
    expect(decideCarnivore(a, CARNIVORE)?.state).toBe("SeekMate");
  });
  it("territoire saturé : pas de SeekMate (densité-dépendance)", () => {
    const a = mkc();
    a.state = "Wander"; a.energy = 0.9; a.hydration = 0.9;
    a.ageSeconds = CARNIVORE.adultAgeSeconds; a.nextMateAgeSeconds = 0;
    a.crowded = true;
    expect(decideCarnivore(a, CARNIVORE)).toBeNull();
  });
  it("Drink n'est pas interrompu par la faim ordinaire", () => {
    const a = mkc();
    a.state = "Drink"; a.energy = 0.5; a.hydration = 0.7;
    expect(decideCarnivore(a, CARNIVORE)).toBeNull();
  });
});
