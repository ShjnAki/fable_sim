/**
 * Balayage de paramètres × graines. Un run isolé ne prouve RIEN sur un système
 * chaotique : on mesure un TAUX de survie sur plusieurs graines.
 *
 * Une variante par processus (le sim est mono-thread) :
 *   pnpm --filter @eco/sim exec vite-node scripts/sweep.ts -- variant=3 hours=2
 * Le script `sweep-all.sh` les lance en parallèle.
 *
 * `variant=list` affiche la liste des variantes.
 */
import { CARNIVORE, HERBIVORE } from "@eco/shared";
import { runHeadless } from "../src/headless";

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split("=")),
);
const HOURS = Number(args.hours ?? 2);
const SEEDS = ["fable-1", "graine-a", "graine-b", "graine-c", "graine-d", "graine-e"];

interface Variant { label: string; apply: () => void }

/**
 * Les chiffres disent où appuyer : sur la carte recollée, les loups culminent à
 * 34-37 pour ~150 proies et la prédation est la 1re cause de mort. Il y a donc
 * TROP DE PRÉDATEURS. On teste : brider leur densité, ralentir leur
 * reproduction, réduire leur portée de chasse — et, en contrepoint, rendre les
 * proies plus fécondes (limité : elles meurent déjà de faim).
 */
const variants: Variant[] = [
  { label: "référence (carte recollée)", apply: () => { /* rien */ } },
  { label: "territoryMax 1", apply: () => { CARNIVORE.territoryMax = 1; } },
  { label: "repro loup 240 s", apply: () => { CARNIVORE.mateCooldownSeconds = 240; } },
  { label: "repro loup 320 s", apply: () => { CARNIVORE.mateCooldownSeconds = 320; } },
  { label: "chasse myope (commit 35 m)", apply: () => { CARNIVORE.huntCommitRadius = 35; } },
  { label: "repro cerf 85 s", apply: () => { HERBIVORE.mateCooldownSeconds = 85; } },
  { label: "territoryMax 1 + cerf 90 s", apply: () => {
    CARNIVORE.territoryMax = 1; HERBIVORE.mateCooldownSeconds = 90;
  } },
  { label: "loup 240 s + cerf 90 s", apply: () => {
    CARNIVORE.mateCooldownSeconds = 240; HERBIVORE.mateCooldownSeconds = 90;
  } },
  { label: "loup 260 s + cerf 90 s + commit 45 m", apply: () => {
    CARNIVORE.mateCooldownSeconds = 260;
    HERBIVORE.mateCooldownSeconds = 90;
    CARNIVORE.huntCommitRadius = 45;
  } },
  { label: "loup 300 s + cerf 95 s + territoryMax 1", apply: () => {
    CARNIVORE.mateCooldownSeconds = 300;
    HERBIVORE.mateCooldownSeconds = 95;
    CARNIVORE.territoryMax = 1;
  } },
];

if (args.variant === "list") {
  variants.forEach((v, i) => console.log(`${i} ${v.label}`));
  process.exit(0);
}

const vi = Number(args.variant ?? 0);
const v = variants[vi];
if (!v) { console.error(`variante ${vi} inconnue`); process.exit(1); }
v.apply();

let stable = 0;
const hAll: number[] = [];
const cAll: number[] = [];
const fails: string[] = [];
for (const seed of SEEDS) {
  const r = runHeadless({ hours: HOURS, overrides: { seed } });
  if (r.verdict === "stable") {
    stable++;
    hAll.push(...r.samples.map((s) => s.herbivores));
    cAll.push(...r.samples.map((s) => s.carnivores));
  } else {
    fails.push(`${seed}=${r.verdict === "extinction" ? "éteint" : "explosé"}`);
  }
}
const h = hAll.length ? `H[${Math.min(...hAll)}..${Math.max(...hAll)}]` : "—";
const c = cAll.length ? `C[${Math.min(...cAll)}..${Math.max(...cAll)}]` : "—";
const mark = stable === SEEDS.length ? "OK " : stable >= SEEDS.length - 1 ? "~  " : "   ";
console.log(
  `${mark} ${stable}/${SEEDS.length}  ${h.padEnd(14)} ${c.padEnd(12)} `
  + `#${vi} ${v.label}${fails.length ? `   [${fails.join(" ")}]` : ""}`,
);
