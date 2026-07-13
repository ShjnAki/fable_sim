/** Moyenne glissante des durées de frame sur une fenêtre temporelle. */
export function createFrameStats(windowMs = 1000) {
  const frames: number[] = [];
  let total = 0;
  return {
    addFrame(frameMs: number): void {
      frames.push(frameMs);
      total += frameMs;
      while (total > windowMs && frames.length > 1) total -= frames.shift()!;
    },
    avgFrameMs(): number {
      return frames.length === 0 ? 0 : total / frames.length;
    },
    fps(): number {
      const avg = frames.length === 0 ? 0 : total / frames.length;
      return avg === 0 ? 0 : 1000 / avg;
    },
  };
}
