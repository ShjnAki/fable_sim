import { describe, expect, it } from "vitest";
import { CARNIVORE, HERBIVORE } from "@eco/shared";
import { createCarnivore, createHerbivore } from "./agent";
import { preyEnergyValue } from "./agentTick";
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
    const w = createWorld({ waterLevel: -5, initialHerbivores: 1, initialCarnivores: 0, riverWidth: 0 }); // plus aucune cellule d'eau
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
    const w = createWorld({ waterLevel: -5, initialHerbivores: 1, initialCarnivores: 0, riverWidth: 0 });
    for (let t = 0; t < 4000 && w.agents.length > 0; t++) tickWorld(w);
    expect(w.agents.length).toBe(0);
  });
});

describe("chasse", () => {
  /** Monde 1 proie + 1 chasseur affamé, positions et états contrôlés. */
  function huntWorld(preyEnergy: number, gap: number) {
    // Terrain neutre (pas de rivières, pas d'eau) : on teste la mécanique de
    // chasse, pas la navigation autour de l'eau.
    const w = createWorld({
      initialHerbivores: 1, initialCarnivores: 1, carnivoreClans: 1,
      riverWidth: 0, waterLevel: -100,
    });
    const prey = w.agents.find((a) => a.species === "herbivore")!;
    const wolf = w.agents.find((a) => a.species === "carnivore")!;
    prey.x = 0; prey.z = 0;
    prey.energy = preyEnergy; prey.hydration = 1;
    wolf.x = -gap; wolf.z = 0;
    wolf.denX = -gap; wolf.denZ = 0; // tanière sur place : pas de rappel parasite
    wolf.energy = 0.5; wolf.hydration = 1; wolf.stamina = 1;
    wolf.nextHuntAgeSeconds = 0; wolf.nextMateAgeSeconds = 1e9;
    return { w, prey, wolf };
  }

  it("attrape une proie affamée (lente) : kill, gain, digestion", () => {
    const { w, prey, wolf } = huntWorld(0.15, 8);
    const px = prey.x, pz = prey.z;
    for (let t = 0; t < 300 && prey.state !== "Dead"; t++) {
      // Proie affamée maintenue sur place : on teste la chasse, pas sa fuite
      // vers l'herbe (elle est lente car affamée — c'est ça qu'on vérifie).
      prey.x = px; prey.z = pz; prey.energy = 0.15;
      tickWorld(w);
    }
    expect(prey.state).toBe("Dead");
    expect(prey.transitions.at(-1)!.cause).toBe("prédation");
    expect(wolf.energy).toBeGreaterThan(0.7); // 0.5 + 0.55 borné, moins la décroissance
    expect(wolf.nextHuntAgeSeconds).toBeGreaterThan(wolf.ageSeconds);
    expect(wolf.transitions.some((tr) => tr.cause === "proie tuée")).toBe(true);
  });

  it("le sprint consomme la stamina, l'approche au trot ne la consomme pas", () => {
    // Approche lointaine (hors sprintRange) : le loup trotte, souffle intact.
    const far = huntWorld(1.0, CARNIVORE.huntCommitRadius - 5);
    for (let t = 0; t < 40; t++) {
      far.prey.x = far.wolf.x + CARNIVORE.huntCommitRadius - 5; // reste loin devant
      far.wolf.energy = 0.5; far.wolf.nextHuntAgeSeconds = 0;
      tickWorld(far.w);
    }
    expect(far.wolf.stamina).toBeGreaterThan(0.95); // trot : pas d'essoufflement

    // Poursuite rapprochée (dans sprintRange) : le loup sprinte et s'essouffle.
    const near = huntWorld(1.0, CARNIVORE.sprintRange - 4);
    for (let t = 0; t < 40; t++) {
      near.prey.x = near.wolf.x + CARNIVORE.sprintRange - 4; // toujours à portée de sprint
      near.wolf.energy = 0.5; near.wolf.nextHuntAgeSeconds = 0;
      tickWorld(near.w);
    }
    expect(near.wolf.stamina).toBeLessThan(far.wolf.stamina);
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
    const herd = [seed];
    for (let k = 0; k < 30; k++) { // troupeau très dense → refuge au plafond
      const ang = (k / 30) * Math.PI * 2;
      const r = 2 + (k % 3);
      const buddy = createHerbivore(
        200 + k, seed.x + Math.cos(ang) * r, seed.z + Math.sin(ang) * r, w.rng,
      );
      w.agents.push(buddy);
      herd.push(buddy);
    }
    const home = herd.map((h) => ({ x: h.x, z: h.z }));
    wolf.x = seed.x; wolf.z = seed.z;
    wolf.hydration = 1;
    wolf.nextMateAgeSeconds = 1e9;
    let sawEscape = false;
    for (let t = 0; t < 1500 && !sawEscape; t++) {
      // Troupeau maintenu serré et repu (sinon il se disperse pour brouter :
      // on teste la confusion du prédateur, pas l'alimentation des proies).
      for (let i = 0; i < herd.length; i++) {
        const h = herd[i]!;
        if (h.state === "Dead") continue;
        h.x = home[i]!.x; h.z = home[i]!.z;
        h.energy = 0.9; h.hydration = 0.9;
      }
      // Loup maintenu affamé et prêt à chasser : il enchaîne les attaques.
      wolf.energy = 0.4;
      wolf.nextHuntAgeSeconds = 0;
      wolf.stamina = 1;
      tickWorld(w);
      if (wolf.transitions.some((tr) => tr.cause === "proie échappée")) sawEscape = true;
    }
    expect(sawEscape).toBe(true); // au moins une morsure ratée grâce au troupeau
  });

  it("charogne : un carnivore affamé sans proie mange un cadavre proche", () => {
    const w = createWorld({
      initialHerbivores: 1, initialCarnivores: 1, carnivoreClans: 1,
      riverWidth: 0, waterLevel: -100,
    });
    const prey = w.agents.find((a) => a.species === "herbivore")!;
    const wolf = w.agents.find((a) => a.species === "carnivore")!;
    // Le loup au centre, sa proie hors de vue, un cadavre tout près.
    wolf.x = 0; wolf.z = 0;
    wolf.denX = 0; wolf.denZ = 0; // tanière ici → pas de rappel parasite
    prey.x = 240; prey.z = 0;     // hors perception (170 m)
    wolf.energy = 0.4; wolf.hydration = 1; wolf.nextHuntAgeSeconds = 0;
    wolf.nextMateAgeSeconds = 1e9;
    // Un cadavre à 10 m du loup.
    const corpse = createCarnivore(77, 10, 0, w.rng);
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

  it("les carnivores fondateurs sont répartis en clans avec tanière", () => {
    const w = createWorld({ initialHerbivores: 10, initialCarnivores: 6, carnivoreClans: 3 });
    const carn = w.agents.filter((a) => a.species === "carnivore");
    const clans = new Set(carn.map((a) => a.clanId));
    expect(clans.size).toBe(3); // les 3 clans sont peuplés
    for (const c of carn) {
      expect(c.denX !== 0 || c.denZ !== 0).toBe(true); // tanière assignée
    }
  });

  it("un carnivore repu loin de sa tanière rentre vers elle", () => {
    // waterLevel très bas : aucun obstacle d'eau, on teste le rappel seul.
    const w = createWorld({
      initialHerbivores: 0, initialCarnivores: 1, carnivoreClans: 1,
      riverWidth: 0, waterLevel: -100,
    });
    const wolf = w.agents[0]!;
    wolf.x = 0; wolf.z = 0;
    // Tanière nettement au-delà du territoire → il doit rentrer.
    wolf.denX = CARNIVORE.homeRange + 60; wolf.denZ = 0;
    wolf.nextMateAgeSeconds = 1e9; // pas de repro → reste en Wander
    wolf.state = "Wander";
    const d0 = Math.hypot(wolf.denX - wolf.x, wolf.denZ - wolf.z);
    for (let t = 0; t < 700; t++) {
      wolf.energy = 0.95; wolf.hydration = 0.95; // le maintenir repu → Wander
      tickWorld(w);
    }
    const d1 = Math.hypot(wolf.denX - wolf.x, wolf.denZ - wolf.z);
    expect(d1).toBeLessThan(d0); // il s'est rapproché…
    // …et il regagne son territoire (il n'a pas besoin de rentrer au terrier même).
    expect(d1).toBeLessThanOrEqual(CARNIVORE.homeRange + 5);
  });

  it("le petit d'un carnivore hérite du clan et de la tanière", () => {
    const w = createWorld({ initialHerbivores: 0, initialCarnivores: 2, carnivoreClans: 1 });
    const a = w.agents[0]!, b = w.agents[1]!;
    b.x = a.x + 1; b.z = a.z;
    for (const ag of [a, b]) {
      ag.energy = 0.95; ag.hydration = 0.95; ag.nextMateAgeSeconds = 0;
      ag.nextHuntAgeSeconds = 1e9;
    }
    a.clanId = 0; a.denX = a.x; a.denZ = a.z;
    for (let t = 0; t < 120 && w.agents.length === 2; t++) tickWorld(w);
    expect(w.agents.length).toBe(3);
    const child = w.agents[2]!;
    expect(child.clanId).toBe(a.clanId);
    expect(child.denX).toBe(a.denX);
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
    // Terrain sans eau : on teste la vitesse de fuite, pas la navigation
    // (une proie acculée contre une berge fuit forcément moins vite).
    const w = createWorld({
      initialHerbivores: 1, initialCarnivores: 0, riverWidth: 0, waterLevel: -100,
    });
    const prey = w.agents[0]!;
    prey.x = 0; prey.z = 0;
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
    // Même clan : deux carnivores de clans différents rentrent chacun à leur
    // tanière et ne s'apparient pas (comportement voulu).
    const w = createWorld({
      initialHerbivores: 0, initialCarnivores: 2, carnivoreClans: 1,
      riverWidth: 0, waterLevel: -100,
    });
    const a = w.agents[0]!, b = w.agents[1]!;
    a.x = 0; a.z = 0;
    b.x = 1; b.z = 0;
    a.denX = 0; a.denZ = 0; b.denX = 0; b.denZ = 0;
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
  }, 30000); // population de départ élevée : dépasse le timeout Vitest par défaut

  it("déterminisme complet : même graine → mêmes agents après 1500 ticks", () => {
    const w1 = createWorld(), w2 = createWorld();
    for (let t = 0; t < 1500; t++) { tickWorld(w1); tickWorld(w2); }
    expect(w1.agents.map((a) => [a.id, a.x, a.z, a.state]))
      .toEqual(w2.agents.map((a) => [a.id, a.x, a.z, a.state]));
  });
});

describe("sommeil nocturne", () => {
  it("des herbivores entourés la nuit finissent par dormir", () => {
    const w = createWorld({ initialHerbivores: 10, initialCarnivores: 0 });
    // regrouper le troupeau serré et le placer en pleine nuit
    for (const h of w.agents) { h.x = (h.id % 3) * 3; h.z = ((h.id / 3) | 0) * 3; }
    w.simTimeSeconds = 0.9 * w.config.dayLengthSeconds;
    for (let t = 0; t < 80; t++) tickWorld(w);
    expect(w.agents.some((a) => a.state === "Sleep")).toBe(true);
  });

  it("une proie adulte nourrit plus qu'un juvénile", () => {
    const rng = () => 0.5;
    const adult = createHerbivore(1, 0, 0, rng);
    adult.ageSeconds = HERBIVORE.adultAgeSeconds * 2;
    const juv = createHerbivore(2, 0, 0, rng);
    juv.ageSeconds = 1;
    expect(preyEnergyValue(adult)).toBeGreaterThan(preyEnergyValue(juv));
  });
});
