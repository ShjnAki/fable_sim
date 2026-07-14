import { describe, expect, it } from "vitest";
import { runHeadless } from "./headless";

describe("runHeadless", () => {
  it("simule, échantillonne et rend un verdict", () => {
    const r = runHeadless({ hours: 2 / 60, sampleSeconds: 30 }); // 2 min de sim
    expect(r.samples.length).toBeGreaterThanOrEqual(4);
    expect(r.samples[0]).toMatchObject({
      t: expect.any(Number), herbivores: expect.any(Number),
      carnivores: expect.any(Number), biomass: expect.any(Number),
    });
    expect(["stable", "extinction", "explosion"]).toContain(r.verdict);
  });
  it("détecte l'extinction et s'arrête tôt", () => {
    // Sans eau, tout meurt en < 2 min de sim.
    const r = runHeadless({ hours: 1, sampleSeconds: 10, overrides: { waterLevel: -5, riverWidth: 0 } });
    expect(r.verdict).toBe("extinction");
    expect(r.samples.at(-1)!.t).toBeLessThan(600); // arrêt tôt, pas 3600 s
  });
});
