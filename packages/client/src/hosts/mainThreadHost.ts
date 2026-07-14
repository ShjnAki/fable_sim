import {
  HERBIVORE,
  type PlayerIntent, type SimHost, type TickSnapshot, type WorldConfig,
} from "@eco/shared";
import {
  createWorld, makeSnapshot, setPlayerControl, spawnAgentAt, spawnPlayer, tickWorld,
} from "@eco/sim";
import { advanceAccumulator } from "../loop/accumulator";

/** Sim dans le thread principal — le rendu reste spectateur (architecture §2). */
export function createMainThreadHost(overrides: Partial<WorldConfig> = {}): SimHost {
  const world = createWorld(overrides);
  const tickIntervalMs = 1000 / world.config.tickRateHz;
  let accumulatorMs = 0;
  let lastNowMs: number | null = null;
  let speed = 1;
  let prev: TickSnapshot | null = null;
  let latest: TickSnapshot | null = null;

  return {
    update(nowMs: number): void {
      const frameDelta = lastNowMs === null ? 0 : (nowMs - lastNowMs) * speed;
      lastNowMs = nowMs;
      const step = advanceAccumulator(accumulatorMs, frameDelta, tickIntervalMs, 8);
      accumulatorMs = step.accumulatorMs;
      for (let i = 0; i < step.ticksToRun; i++) {
        const t0 = performance.now();
        tickWorld(world);
        prev = latest;
        latest = makeSnapshot(world, performance.now() - t0);
      }
    },
    getConfig: () => world.config,
    getTerrainHeights: () => world.terrain.heights,
    getTerrainZones: () => world.terrain.zones,
    getBiomass: () => world.biomass.values,
    latestSnapshots: () => [prev, latest] as const,
    interpolationAlpha: () => accumulatorMs / tickIntervalMs,
    getAgentDetail(id: number) {
      // Copie légère à la demande (~2 Hz) : l'Agent vivant n'a pas le champ
      // dérivé `adult`, on complète ici.
      const a = world.agents.find((x) => x.id === id);
      if (!a) return null;
      return { ...a, adult: a.ageSeconds >= HERBIVORE.adultAgeSeconds };
    },
    setSpeed(multiplier: number): void {
      speed = multiplier;
    },
    getSpeed: () => speed,
    spawnAgent(species, x, z): void {
      spawnAgentAt(world, species, x, z);
    },
    applyEnvironment(kind): void {
      const v = world.biomass.values;
      for (let i = 0; i < v.length; i++) {
        v[i] = kind === "drought" ? v[i]! * 0.25 : Math.min(1, v[i]! * 2 + 0.3);
      }
    },
    setPlayerIntent(intent: PlayerIntent): void {
      // On RECOPIE dans l'objet du monde (jamais de remplacement de référence) :
      // la sim consomme les impulsions sur place, et le zéro-alloc est préservé.
      const t = world.playerIntent;
      t.moveX = intent.moveX;
      t.moveZ = intent.moveZ;
      t.sprint = intent.sprint;
      // Impulsions COLLANTES : on ne les efface jamais ici, seule la sim les
      // consomme. Sinon un clic tombé entre deux ticks serait perdu.
      if (intent.strike) t.strike = true;
      if (intent.interact) t.interact = true;
    },
    spawnPlayer(): void {
      spawnPlayer(world);
    },
    setPlayerControl(controlled: boolean): void {
      setPlayerControl(world, controlled);
    },
  };
}
