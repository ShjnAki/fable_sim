import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

describe("createRng", () => {
  it("est déterministe : même graine → même séquence", () => {
    const a = createRng("hello");
    const b = createRng("hello");
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("des graines différentes divergent", () => {
    const a = createRng("hello");
    const b = createRng("world");
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("produit des valeurs dans [0, 1) raisonnablement réparties", () => {
    const rng = createRng(42);
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10_000).toBeGreaterThan(0.45);
    expect(sum / 10_000).toBeLessThan(0.55);
  });
});
