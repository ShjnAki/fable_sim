import { describe, expect, it } from "vitest";
import { runHeadless } from "./headless";

describe("stabilité — garde-fou (le critère 2 h se vérifie au harness)", () => {
  it("10 min de sim : les deux espèces survivent, pas d'explosion", () => {
    const r = runHeadless({ hours: 10 / 60, sampleSeconds: 30 });
    expect(r.verdict).toBe("stable");
    const last = r.samples.at(-1)!;
    expect(last.herbivores).toBeGreaterThanOrEqual(5);
    expect(last.carnivores).toBeGreaterThanOrEqual(1);
  }, 30000); // 10 min de sim à ~300 agents dépasse le timeout Vitest par défaut
});
