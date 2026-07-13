import { describe, expect, it } from "vitest";
import { advanceAccumulator } from "./accumulator";

describe("advanceAccumulator", () => {
  it("accumule sans tick tant que l'intervalle n'est pas atteint", () => {
    const r = advanceAccumulator(0, 16.7, 50, 5);
    expect(r.ticksToRun).toBe(0);
    expect(r.accumulatorMs).toBeCloseTo(16.7);
  });

  it("émet un tick et conserve le reste", () => {
    const r = advanceAccumulator(48, 16.7, 50, 5);
    expect(r.ticksToRun).toBe(1);
    expect(r.accumulatorMs).toBeCloseTo(14.7);
  });

  it("émet plusieurs ticks après une longue frame", () => {
    const r = advanceAccumulator(0, 120, 50, 5);
    expect(r.ticksToRun).toBe(2);
    expect(r.accumulatorMs).toBeCloseTo(20);
  });

  it("plafonne les ticks et jette le surplus (anti spirale de la mort)", () => {
    const r = advanceAccumulator(0, 5000, 50, 5);
    expect(r.ticksToRun).toBe(5);
    expect(r.accumulatorMs).toBe(0);
  });
});
