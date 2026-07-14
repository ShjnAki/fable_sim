import type { WorldConfig } from "@eco/shared";
import { ZONE_GRASS } from "./terrain";
import { createWorld, tickWorld } from "./world";

export interface HeadlessSample {
  t: number;
  herbivores: number;
  carnivores: number;
  biomass: number;
}

export interface HeadlessResult {
  samples: HeadlessSample[];
  verdict: "stable" | "extinction" | "explosion";
  detail: string;
}

const POP_CEILING = 2000; // au-delà : explosion déclarée, run arrêté

/**
 * Fait tourner la sim headless en accéléré (aucune limite de temps réel) et
 * surveille les populations. C'est l'outil de tuning de la Phase 4
 * (architecture §2 : « l'avantage caché le plus précieux »).
 */
export function runHeadless(opts: {
  hours?: number;
  sampleSeconds?: number;
  overrides?: Partial<WorldConfig>;
  onSample?: (s: HeadlessSample) => void;
} = {}): HeadlessResult {
  const hours = opts.hours ?? 2;
  const sampleSeconds = opts.sampleSeconds ?? 30;
  const world = createWorld(opts.overrides ?? {});
  const totalTicks = Math.round(hours * 3600 * world.config.tickRateHz);
  const ticksPerSample = Math.max(1, Math.round(sampleSeconds * world.config.tickRateHz));

  const grassCells: number[] = [];
  for (let i = 0; i < world.terrain.zones.length; i++) {
    if (world.terrain.zones[i] === ZONE_GRASS) grassCells.push(i);
  }

  const samples: HeadlessSample[] = [];
  const sample = (): HeadlessSample => {
    let herbivores = 0, carnivores = 0;
    for (const a of world.agents) {
      if (a.state === "Dead") continue;
      if (a.species === "herbivore") herbivores++;
      else carnivores++;
    }
    let biomass = 0;
    for (const i of grassCells) biomass += world.biomass.values[i]!;
    const s = {
      t: Math.round(world.simTimeSeconds),
      herbivores, carnivores,
      biomass: biomass / grassCells.length,
    };
    samples.push(s);
    opts.onSample?.(s);
    return s;
  };

  const deathReport = (): string =>
    Object.entries(world.deaths)
      .sort(([, a], [, b]) => b - a)
      .map(([k, n]) => `${k}=${n}`)
      .join(" ") || "aucune mort";

  sample();
  for (let t = 0; t < totalTicks; t++) {
    tickWorld(world);
    if ((t + 1) % ticksPerSample === 0) {
      const s = sample();
      if (s.herbivores === 0 || s.carnivores === 0) {
        const espece = s.herbivores === 0 ? "herbivore" : "carnivore";
        return {
          samples, verdict: "extinction",
          detail: `extinction ${espece} à t=${s.t}s — morts : ${deathReport()}`,
        };
      }
      if (s.herbivores + s.carnivores > POP_CEILING) {
        return {
          samples, verdict: "explosion",
          detail: `population ${s.herbivores + s.carnivores} > ${POP_CEILING} à t=${s.t}s`,
        };
      }
    }
  }
  let minH = Infinity, maxH = 0, minC = Infinity, maxC = 0;
  for (const s of samples) {
    minH = Math.min(minH, s.herbivores); maxH = Math.max(maxH, s.herbivores);
    minC = Math.min(minC, s.carnivores); maxC = Math.max(maxC, s.carnivores);
  }
  return {
    samples, verdict: "stable",
    detail: `herbivores [${minH}..${maxH}], carnivores [${minC}..${maxC}] sur ${hours} h`
      + ` — morts : ${deathReport()}`,
  };
}
