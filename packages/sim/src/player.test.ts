import { describe, expect, it } from "vitest";
import { setPlayerControl, spawnPlayer } from "./player";
import { createWorld, makeSnapshot, spawnAgentAt, tickWorld } from "./world";

const EMPTY = { initialHerbivores: 0, initialCarnivores: 0, initialHumans: 0 };

describe("Phase 6 — le joueur", () => {
  it("spawnPlayer crée un humain adulte contrôlé et l'expose dans le snapshot", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    expect(p.species).toBe("human");
    expect(p.controlled).toBe(true);
    expect(w.playerId).toBe(p.id);
    tickWorld(w);
    const snap = makeSnapshot(w, 0);
    expect(snap.player?.id).toBe(p.id);
    expect(snap.player?.alive).toBe(true);
  });

  it("l'intention le déplace ; la FSM ne décide PAS pour lui", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    const x0 = p.x;
    p.energy = 0.5; // affamé : un humain IA partirait chasser. Pas le joueur.
    w.playerIntent.moveX = 1;
    w.playerIntent.moveZ = 0;
    for (let i = 0; i < 20; i++) tickWorld(w);
    expect(p.x).toBeGreaterThan(x0);
    expect(p.transitions.some((t) => t.to === "Hunt")).toBe(false);
  });

  it("le sprint vide l'endurance, le repos la recharge", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    w.playerIntent.moveX = 1;
    w.playerIntent.sprint = true;
    for (let i = 0; i < 100; i++) tickWorld(w);
    expect(p.stamina).toBeLessThan(1);
    const drained = p.stamina;
    w.playerIntent.sprint = false;
    w.playerIntent.moveX = 0;
    for (let i = 0; i < 40; i++) tickWorld(w);
    expect(p.stamina).toBeGreaterThan(drained);
  });

  it("frapper tue un herbivore et ne donne AUCUNE énergie : il faut dévorer", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    const deer = spawnAgentAt(w, "herbivore", p.x + 1, p.z);
    const e0 = p.energy;
    w.playerIntent.strike = true;
    tickWorld(w);
    expect(deer.state).toBe("Dead");
    expect(p.energy).toBeLessThanOrEqual(e0); // rien gagné (la faim a même baissé)
    expect(w.playerStats.preyKilled).toBe(1);
    expect(w.playerIntent.strike).toBe(false); // impulsion consommée par la sim
  });

  it("dévorer une carcasse remonte l'énergie et épuise le repas", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    p.energy = 0.3;
    const deer = spawnAgentAt(w, "herbivore", p.x + 1, p.z);
    w.playerIntent.strike = true;
    tickWorld(w);
    w.playerIntent.interact = true;
    for (let i = 0; i < 60; i++) tickWorld(w);
    expect(p.energy).toBeGreaterThan(0.3);
    expect(deer.mealLeft).toBeLessThan(1);
  });

  it("quatre coups abattent un loup", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    const wolf = spawnAgentAt(w, "carnivore", p.x + 1, p.z);
    for (let i = 0; i < 4; i++) {
      w.playerIntent.strike = true;
      tickWorld(w);
      p.nextStrikeAgeSeconds = 0; // on force le cooldown : le test vise les dégâts
    }
    expect(wolf.state).toBe("Dead");
    expect(w.playerStats.wolvesKilled).toBe(1);
  });

  it("setPlayerControl(false) rend la main à la FSM", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    setPlayerControl(w, false);
    expect(p.controlled).toBe(false);
    p.energy = 0.5; // affamé : la FSM doit l'envoyer chasser
    spawnAgentAt(w, "herbivore", p.x + 20, p.z);
    for (let i = 0; i < 30; i++) tickWorld(w);
    expect(p.transitions.some((t) => t.to === "Hunt")).toBe(true);
  });

  it("le joueur meurt de soif comme n'importe quel agent", () => {
    const w = createWorld(EMPTY);
    const p = spawnPlayer(w);
    p.hydration = 0.001;
    for (let i = 0; i < 40 && p.state !== "Dead"; i++) tickWorld(w);
    expect(p.state).toBe("Dead");
    expect(makeSnapshot(w, 0).player?.alive).toBe(false);
  });
});
