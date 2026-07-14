/**
 * Balayage de paramètres × graines. Un run isolé ne prouve RIEN sur un système
 * chaotique : on mesure un TAUX de survie sur plusieurs graines.
 *
 * Usage : pnpm --filter @eco/sim exec vite-node scripts/sweep.ts -- [hours=2]
 */
import { CARNIVORE, HERBIVORE } from "@eco/shared";
import { runHeadless } from "../src/headless";

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split("=")),
);
const HOURS = Number(args.hours ?? 2);
const SEEDS = ["fable-1", "graine-a", "graine-b", "graine-c", "graine-d", "graine-e"];

/** Un jeu de valeurs à tester : on écrit dans les consts partagés, puis on court. */
interface Variant { label: string; apply: () => void }

// Sauvegarde des valeurs de référence, pour restaurer entre les variantes.
const base = {
  territoryMax: CARNIVORE.territoryMax,
  territoryRadius: CARNIVORE.territoryRadius,
  mateCooldownSeconds: CARNIVORE.mateCooldownSeconds,
  huntCommitRadius: CARNIVORE.huntCommitRadius,
  herbMateCooldown: HERBIVORE.mateCooldownSeconds,
  herbMateEnergyMin: HERBIVORE.mateEnergyMin,
};
function reset(): void {
  CARNIVORE.territoryMax = base.territoryMax;
  CARNIVORE.territoryRadius = base.territoryRadius;
  CARNIVORE.mateCooldownSeconds = base.mateCooldownSeconds;
  CARNIVORE.huntCommitRadius = base.huntCommitRadius;
  HERBIVORE.mateCooldownSeconds = base.herbMateCooldown;
  HERBIVORE.mateEnergyMin = base.herbMateEnergyMin;
}

const variants: Variant[] = [
  { label: "référence (carte recollée)", apply: () => { /* rien */ } },
  // Moins de loups : c'est le levier indiqué par les chiffres (ils culminent à
  // 37 pour ~150 proies, et la prédation est la 1re cause de mort).
  { label: "territoryMax 1 (densité de loups bridée)", apply: () => { CARNIVORE.territoryMax = 1; } },
  { label: "repro loup +50 % lente (240 s)", apply: () => { CARNIVORE.mateCooldownSeconds = 240; } },
  { label: "repro loup lente (320 s)", apply: () => { CARNIVORE.mateCooldownSeconds = 320; } },
  { label: "chasse myope (huntCommitRadius 35)", apply: () => { CARNIVORE.huntCommitRadius = 35; } },
  // Plus de proies : limité par la capacité de charge (elles meurent déjà de faim).
  { label: "repro cerf rapide (cooldown 80 s)", apply: () => { HERBIVORE.mateCooldownSeconds = 80; } },
  { label: "combo : territoryMax 1 + repro cerf 90 s", apply: () => {
    CARNIVORE.territoryMax = 1; HERBIVORE.mateCooldownSeconds = 90;
  } },
  { label: "combo : repro loup 240 s + repro cerf 90 s", apply: () => {
    CARNIVORE.mateCooldownSeconds = 240; HERBIVORE.mateCooldownSeconds = 90;
  } },
];

console.log(`Balayage : ${variants.length} variantes × ${SEEDS.length} graines × ${HOURS} h\n`);
for (const v of variants) {
  reset();
  v.apply();
  let stable = 0;
  const hRange: number[] = [];
  const cRange: number[] = [];
  const fails: string[] = [];
  for (const seed of SEEDS) {
    const r = runHeadless({ hours: HOURS, overrides: { seed } });
    if (r.verdict === "stable") {
      stable++;
      const hs = r.samples.map((s) => s.herbivores);
      const cs = r.samples.map((s) => s.carnivores);
      hRange.push(Math.min(...hs), Math.max(...hs));
      cRange.push(Math.min(...cs), Math.max(...cs));
    } else {
      fails.push(`${seed}:${r.verdict}`);
    }
  }
  const h = hRange.length ? `H[${Math.min(...hRange)}..${Math.max(...hRange)}]` : "—";
  const c = cRange.length ? `C[${Math.min(...cRange)}..${Math.max(...cRange)}]` : "—";
  const mark = stable === SEEDS.length ? "✅" : stable >= SEEDS.length - 1 ? "🟡" : "  ";
  console.log(
    `${mark} ${stable}/${SEEDS.length} stables  ${h.padEnd(14)} ${c.padEnd(12)} `
    + `${v.label}${fails.length ? `   (échecs : ${fails.join(", ")})` : ""}`,
  );
}
reset();
