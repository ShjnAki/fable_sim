import { describe, expect, it } from "vitest";
import { CARNIVORE, HERBIVORE } from "@eco/shared";
import { createCarnivore, createHerbivore } from "./agent";
import { cellCenterX, cellCenterZ, cellIndexAt } from "./biomass";
import { createWorld, tickWorld } from "./world";

describe("un agent qui vit", () => {
  it("le monde spawne initialHerbivores adultes sur l'herbe", () => {
    const w = createWorld();
    const herbs = w.agents.filter((a) => a.species === "herbivore");
    expect(herbs.length).toBe(w.config.initialHerbivores);
    expect(herbs[0]!.state).toBe("Wander");
    expect(herbs[0]!.ageSeconds).toBeGreaterThanOrEqual(HERBIVORE.adultAgeSeconds);
  });

  it("meurt de vieillesse à son âge max", () => {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
    const a = w.agents[0]!;
    a.maxAgeSeconds = a.ageSeconds + 1; // meurt dans 1 s de sim
    for (let t = 0; t < 30 && a.state !== "Dead"; t++) tickWorld(w);
    expect(a.state).toBe("Dead");
    expect(a.transitions.at(-1)!.cause).toBe("vieillesse");
  });

  it("meurt de soif dans un monde sans eau", () => {
    const w = createWorld({ waterLevel: -5, initialHerbivores: 1, initialCarnivores: 0 }); // plus aucune cellule d'eau
    for (let t = 0; t < 3000 && w.agents.length > 0 && w.agents[0]!.state !== "Dead"; t++) {
      tickWorld(w);
    }
    const a = w.agents[0];
    expect(a).toBeDefined();
    expect(a!.state).toBe("Dead");
    expect(a!.transitions.at(-1)!.cause).toBe("mort de soif");
  });

  it("boit quand il a soif près d'une rive", () => {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
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
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
    const a = w.agents[0]!;
    a.energy = 0.3; a.hydration = 1.0;
    const i = cellIndexAt(w.config, a.x, a.z);
    w.biomass.values[i] = 1.0;
    for (let t = 0; t < 300; t++) tickWorld(w);
    expect(a.energy).toBeGreaterThan(0.4);
    expect(a.transitions.some((tr) => tr.to === "Eat")).toBe(true);
  });

  it("est déterministe : même graine → même trajectoire", () => {
    const w1 = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
    const w2 = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
    for (let t = 0; t < 500; t++) { tickWorld(w1); tickWorld(w2); }
    expect(w1.agents[0]!.x).toBe(w2.agents[0]!.x);
    expect(w1.agents[0]!.z).toBe(w2.agents[0]!.z);
    expect(w1.agents[0]!.state).toBe(w2.agents[0]!.state);
  });

  it("le cadavre disparaît après corpseDespawnSeconds", () => {
    const w = createWorld({ waterLevel: -5, initialHerbivores: 1, initialCarnivores: 0 });
    for (let t = 0; t < 4000 && w.agents.length > 0; t++) tickWorld(w);
    expect(w.agents.length).toBe(0);
  });
});

describe("chasse", () => {
  /** Monde 1 proie + 1 chasseur affamé, positions et états contrôlés. */
  function huntWorld(preyEnergy: number, gap: number) {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 1 });
    const prey = w.agents.find((a) => a.species === "herbivore")!;
    const wolf = w.agents.find((a) => a.species === "carnivore")!;
    prey.energy = preyEnergy; prey.hydration = 1;
    wolf.x = prey.x - gap; wolf.z = prey.z;
    wolf.energy = 0.5; wolf.hydration = 1; wolf.stamina = 1;
    wolf.nextHuntAgeSeconds = 0; wolf.nextMateAgeSeconds = 1e9;
    return { w, prey, wolf };
  }

  it("attrape une proie affamée (lente) : kill, gain, digestion", () => {
    const { w, prey, wolf } = huntWorld(0.15, 8);
    for (let t = 0; t < 300 && prey.state !== "Dead"; t++) tickWorld(w);
    expect(prey.state).toBe("Dead");
    expect(prey.transitions.at(-1)!.cause).toBe("prédation");
    expect(wolf.energy).toBeGreaterThan(0.7); // 0.5 + 0.55 borné, moins la décroissance
    expect(wolf.nextHuntAgeSeconds).toBeGreaterThan(wolf.ageSeconds);
    expect(wolf.transitions.some((tr) => tr.cause === "proie tuée")).toBe(true);
  });

  it("abandonne épuisé si la proie reste hors d'atteinte", () => {
    const { w, prey, wolf } = huntWorld(1.0, 30);
    for (let t = 0; t < 400 && !wolf.transitions.some((tr) => tr.cause === "épuisé"); t++) {
      // La proie est maintenue juste dans le rayon d'engagement, jamais atteignable.
      prey.x = wolf.x + 30; prey.z = wolf.z; prey.energy = 1;
      tickWorld(w);
    }
    expect(wolf.transitions.some((tr) => tr.cause === "épuisé")).toBe(true);
    expect(prey.state).not.toBe("Dead");
  });

  it("le monde spawne les carnivores demandés", () => {
    const w = createWorld();
    const carn = w.agents.filter((a) => a.species === "carnivore");
    expect(carn.length).toBe(w.config.initialCarnivores);
    expect(carn[0]!.ageSeconds).toBeGreaterThanOrEqual(CARNIVORE.adultAgeSeconds);
  });

  it("refuge du troupeau : dans un troupeau dense, des morsures ratent", () => {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 1 });
    const wolf = w.agents.find((a) => a.species === "carnivore")!;
    const seed = w.agents.find((a) => a.species === "herbivore")!;
    // Un troupeau dense et lent ; le loup chasse au milieu. Sur de nombreuses
    // morsures, au moins un échappement (p≈0.6/morsure) est quasi certain.
    seed.energy = 0.15;
    for (let k = 0; k < 14; k++) {
      const ang = (k / 14) * Math.PI * 2;
      const buddy = createHerbivore(200 + k, seed.x + Math.cos(ang) * 3, seed.z + Math.sin(ang) * 3, w.rng);
      buddy.energy = 0.15;
      w.agents.push(buddy);
    }
    wolf.x = seed.x; wolf.z = seed.z;
    wolf.energy = 0.5; wolf.hydration = 1;
    wolf.nextHuntAgeSeconds = 0; wolf.nextMateAgeSeconds = 1e9;
    let sawEscape = false;
    for (let t = 0; t < 500 && !sawEscape; t++) {
      tickWorld(w);
      if (wolf.transitions.some((tr) => tr.cause === "proie échappée")) sawEscape = true;
    }
    expect(sawEscape).toBe(true); // au moins une morsure ratée grâce au troupeau
  });

  it("charogne : un carnivore affamé sans proie mange un cadavre proche", () => {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 1 });
    const prey = w.agents.find((a) => a.species === "herbivore")!;
    const wolf = w.agents.find((a) => a.species === "carnivore")!;
    // La proie vivante est loin (hors engagement) ; un cadavre est tout près.
    prey.x = wolf.x + 300; prey.z = wolf.z;
    prey.x = Math.max(-200, Math.min(200, prey.x));
    wolf.energy = 0.4; wolf.hydration = 1; wolf.nextHuntAgeSeconds = 0;
    wolf.nextMateAgeSeconds = 1e9;
    // Un cadavre à 10 m du loup.
    const corpse = createCarnivore(77, wolf.x + 10, wolf.z, w.rng);
    corpse.state = "Dead"; corpse.deadForSeconds = 1;
    w.agents.push(corpse);
    const e0 = wolf.energy;
    for (let t = 0; t < 200 && !wolf.transitions.some((tr) => tr.cause === "charogne mangée"); t++) {
      tickWorld(w);
    }
    expect(wolf.transitions.some((tr) => tr.to === "Scavenge")).toBe(true);
    expect(wolf.transitions.some((tr) => tr.cause === "charogne mangée")).toBe(true);
    expect(wolf.energy).toBeGreaterThan(e0);
  });

  it("déterminisme complet à deux espèces", () => {
    const w1 = createWorld(), w2 = createWorld();
    for (let t = 0; t < 1500; t++) { tickWorld(w1); tickWorld(w2); }
    expect(w1.agents.map((a) => [a.id, a.species, a.x, a.z, a.state]))
      .toEqual(w2.agents.map((a) => [a.id, a.species, a.x, a.z, a.state]));
  });
});

describe("fuite", () => {
  it("hystérésis : menace sous trigger, encore entre trigger et safe, éteinte au-delà", () => {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
    const prey = w.agents[0]!;
    const inside = HERBIVORE.fleeTriggerRadius - 2;
    const between = (HERBIVORE.fleeTriggerRadius + HERBIVORE.fleeSafeRadius) / 2;
    const beyond = HERBIVORE.fleeSafeRadius + 5;
    const wolf = createCarnivore(99, prey.x + inside, prey.z, w.rng);
    wolf.nextHuntAgeSeconds = 1e9; // il ne chasse pas : on teste la perception
    w.agents.push(wolf);
    tickWorld(w);
    expect(prey.hasThreat).toBe(true);
    expect(prey.state).toBe("Flee");
    wolf.x = prey.x + between;
    tickWorld(w);
    expect(prey.hasThreat).toBe(true);
    wolf.x = prey.x + beyond;
    tickWorld(w);
    expect(prey.hasThreat).toBe(false);
    expect(prey.state).toBe("Wander");
    expect(prey.transitions.at(-1)!.cause).toBe("danger écarté");
  });

  it("la fuite s'éloigne de la menace et dépasse maxSpeed", () => {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
    const prey = w.agents[0]!;
    prey.energy = 1;
    const wolf = createCarnivore(99, prey.x - 5, prey.z, w.rng);
    wolf.nextHuntAgeSeconds = 1e9;
    w.agents.push(wolf);
    const x0 = prey.x;
    for (let t = 0; t < 40; t++) { wolf.x = prey.x - 5; wolf.vx = 0; tickWorld(w); }
    expect(prey.x).toBeGreaterThan(x0 + 5); // il s'éloigne en +X
    expect(Math.hypot(prey.vx, prey.vz)).toBeGreaterThan(HERBIVORE.maxSpeed);
  });
});

describe("reproduction carnivore", () => {
  it("deux carnivores éligibles produisent un carnivore", () => {
    const w = createWorld({ initialHerbivores: 0, initialCarnivores: 2 });
    const a = w.agents[0]!, b = w.agents[1]!;
    b.x = a.x + 1; b.z = a.z;
    for (const ag of [a, b]) {
      ag.energy = 0.9; ag.hydration = 0.9; ag.nextMateAgeSeconds = 0;
      ag.nextHuntAgeSeconds = 1e9;
    }
    for (let t = 0; t < 100 && w.agents.length === 2; t++) tickWorld(w);
    expect(w.agents.length).toBe(3);
    expect(w.agents[2]!.species).toBe("carnivore");
    expect(a.energy).toBeLessThanOrEqual(0.9 - CARNIVORE.mateEnergyCost);
  });
});

describe("appariement inter-espèces", () => {
  it("un couple mixte ne produit rien", () => {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
    const h = w.agents[0]!;
    const c = createCarnivore(50, h.x + 1, h.z, w.rng);
    c.nextHuntAgeSeconds = 1e9;
    w.agents.push(c);
    for (const ag of [h, c]) {
      ag.energy = 0.9; ag.hydration = 0.9; ag.nextMateAgeSeconds = 0;
      ag.ageSeconds = 100;
    }
    for (let t = 0; t < 100; t++) tickWorld(w);
    expect(w.agents.length).toBe(2); // aucune naissance
  });
});

describe("reproduction", () => {
  it("deux adultes repus proches → naissance, coût payé, cooldown", () => {
    const w = createWorld({ initialHerbivores: 2, initialCarnivores: 0 });
    const a = w.agents[0]!, b = w.agents[1]!;
    b.x = a.x + 1; b.z = a.z;
    for (const ag of [a, b]) {
      ag.energy = 0.9; ag.hydration = 0.9; ag.nextMateAgeSeconds = 0;
    }
    for (let t = 0; t < 100 && w.agents.length === 2; t++) tickWorld(w);
    expect(w.agents.length).toBe(3);
    expect(w.agents[2]!.ageSeconds).toBeLessThan(HERBIVORE.adultAgeSeconds); // juvénile
    expect(a.energy).toBeLessThanOrEqual(0.9 - HERBIVORE.mateEnergyCost);
    expect(b.energy).toBeLessThanOrEqual(0.9 - HERBIVORE.mateEnergyCost);
    expect(a.nextMateAgeSeconds).toBeGreaterThan(a.ageSeconds);
    expect(a.transitions.some((tr) => tr.cause === "naissance")).toBe(true);
    // cooldown : pas de 2e naissance dans la foulée
    for (let t = 0; t < 200; t++) tickWorld(w);
    expect(w.agents.length).toBe(3);
  });

  it("sans partenaire à portée : retour Wander avec retry", () => {
    const w = createWorld({ initialHerbivores: 1, initialCarnivores: 0 });
    const a = w.agents[0]!;
    a.energy = 0.9; a.hydration = 0.9; a.nextMateAgeSeconds = 0;
    tickWorld(w); // decide → SeekMate, comportement → échec → Wander
    expect(a.state).toBe("Wander");
    expect(a.transitions.some((tr) => tr.cause === "aucun partenaire")).toBe(true);
    expect(a.nextMateAgeSeconds).toBeGreaterThan(a.ageSeconds);
  });

  it("la population croît depuis les fondateurs dans un monde riche", () => {
    const w = createWorld({ initialCarnivores: 0 }); // croissance pure, sans prédation
    let maxPop = w.agents.length;
    for (let t = 0; t < 4000; t++) {
      tickWorld(w);
      maxPop = Math.max(maxPop, w.agents.length);
    }
    expect(maxPop).toBeGreaterThan(w.config.initialHerbivores);
  });

  it("déterminisme complet : même graine → mêmes agents après 1500 ticks", () => {
    const w1 = createWorld(), w2 = createWorld();
    for (let t = 0; t < 1500; t++) { tickWorld(w1); tickWorld(w2); }
    expect(w1.agents.map((a) => [a.id, a.x, a.z, a.state]))
      .toEqual(w2.agents.map((a) => [a.id, a.x, a.z, a.state]));
  });
});
