export interface StepResult {
  ticksToRun: number;
  accumulatorMs: number;
}

/**
 * Pas fixe classique : le temps réel s'accumule, on exécute autant de ticks
 * entiers que possible. Le plafond évite la « spirale de la mort » (une frame
 * lente qui déclenche N ticks qui ralentissent la frame suivante…) : au-delà,
 * on JETTE le temps en trop — la sim ralentit, elle n'explose pas.
 */
export function advanceAccumulator(
  accumulatorMs: number, frameDeltaMs: number, tickIntervalMs: number, maxTicksPerFrame: number,
): StepResult {
  const acc = accumulatorMs + frameDeltaMs;
  const ticks = Math.floor(acc / tickIntervalMs);
  if (ticks > maxTicksPerFrame) {
    return { ticksToRun: maxTicksPerFrame, accumulatorMs: 0 };
  }
  return { ticksToRun: ticks, accumulatorMs: acc - ticks * tickIntervalMs };
}
