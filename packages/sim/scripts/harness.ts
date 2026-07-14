/**
 * Harness de tuning Phase 4 : pnpm harness [hours=2] [sample=30] [seed=...]
 * [initialHerbivores=30] [initialCarnivores=4] ...
 * CSV sur stdout, verdict sur stderr. Code sortie 0 = stable.
 */
import type { WorldConfig } from "@eco/shared";
import { runHeadless } from "../src/headless";

const overrides: Record<string, string | number> = {};
let hours = 2;
let sampleSeconds = 30;
for (const arg of process.argv.slice(2)) {
  const [key, raw] = arg.split("=");
  if (!key || raw === undefined) continue;
  const num = Number(raw);
  const value = Number.isFinite(num) ? num : raw;
  if (key === "hours") hours = num;
  else if (key === "sample") sampleSeconds = num;
  else overrides[key] = value;
}

console.log("t,herbivores,carnivores,biomasse");
const result = runHeadless({
  hours, sampleSeconds,
  overrides: overrides as Partial<WorldConfig>,
  onSample: (s) =>
    console.log(`${s.t},${s.herbivores},${s.carnivores},${s.biomass.toFixed(3)}`),
});
console.error(`\nverdict : ${result.verdict.toUpperCase()} — ${result.detail}`);
process.exit(result.verdict === "stable" ? 0 : 1);
