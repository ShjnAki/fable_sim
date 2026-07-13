import { describe, expect, it } from "vitest";
import { createFrameStats } from "./frameStats";

describe("frameStats", () => {
  it("calcule la moyenne sur la fenêtre", () => {
    const s = createFrameStats(1000);
    for (let i = 0; i < 60; i++) s.addFrame(16.67);
    expect(s.avgFrameMs()).toBeCloseTo(16.67, 1);
    expect(s.fps()).toBeCloseTo(60, 0);
  });

  it("oublie les frames hors fenêtre", () => {
    const s = createFrameStats(100); // fenêtre de 100 ms
    for (let i = 0; i < 20; i++) s.addFrame(33.3); // 666 ms → seules ~3 restent
    for (let i = 0; i < 10; i++) s.addFrame(10);
    expect(s.avgFrameMs()).toBeLessThan(15);
  });

  it("retourne 0 sans données", () => {
    const s = createFrameStats();
    expect(s.fps()).toBe(0);
    expect(s.avgFrameMs()).toBe(0);
  });
});
