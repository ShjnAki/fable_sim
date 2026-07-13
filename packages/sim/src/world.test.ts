import { describe, expect, it } from "vitest";
import { createWorld, makeSnapshot, tickWorld, timeOfDay } from "./world";
import { ZONE_GRASS } from "./terrain";

describe("world", () => {
  it("createWorld est déterministe (même graine → mêmes hauteurs et biomasse)", () => {
    const a = createWorld();
    const b = createWorld();
    expect(a.terrain.heights).toEqual(b.terrain.heights);
    expect(a.biomass.values).toEqual(b.biomass.values);
  });

  it("tickWorld avance le temps d'exactement 1/tickRateHz", () => {
    const w = createWorld();
    const t0 = w.simTimeSeconds;
    tickWorld(w);
    expect(w.simTimeSeconds).toBeCloseTo(t0 + 1 / w.config.tickRateHz, 9);
    expect(w.tickCount).toBe(1);
  });

  it("timeOfDay est dans [0,1) et boucle après un jour complet", () => {
    const w = createWorld({ dayLengthSeconds: 10 });
    const start = timeOfDay(w);
    const ticksPerDay = 10 * w.config.tickRateHz;
    for (let i = 0; i < ticksPerDay; i++) tickWorld(w);
    expect(timeOfDay(w)).toBeCloseTo(start, 5);
  });

  it("la biomasse pousse au fil des ticks", () => {
    const w = createWorld();
    const i = w.terrain.zones.indexOf(ZONE_GRASS);
    const before = w.biomass.values[i]!;
    for (let t = 0; t < 200; t++) tickWorld(w);
    expect(w.biomass.values[i]!).toBeGreaterThan(before);
  });

  it("le snapshot contient les agents", () => {
    const w = createWorld();
    tickWorld(w);
    const s = makeSnapshot(w, 0);
    expect(s.agents.length).toBe(1);
    expect(s.agents[0]).toMatchObject({ id: 1, state: expect.any(String) });
  });

  it("makeSnapshot expose les champs du protocole", () => {
    const w = createWorld();
    tickWorld(w);
    const s = makeSnapshot(w, 1.5);
    expect(s.tickCount).toBe(1);
    expect(s.simTimeSeconds).toBe(w.simTimeSeconds);
    expect(s.timeOfDay).toBeGreaterThanOrEqual(0);
    expect(s.timeOfDay).toBeLessThan(1);
    expect(s.lastTickDurationMs).toBe(1.5);
  });
});
