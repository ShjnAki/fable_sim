/**
 * Graphe de population temps réel : canvas vanilla (pas de lib — CLAUDE.md),
 * un échantillon par seconde de temps SIM, fenêtre glissante en ring buffer.
 */
export function createPopulationGraph(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const WINDOW = 600; // 600 échantillons à 1/s ≈ 10 min de sim
  const samples = new Float32Array(WINDOW);
  let count = 0;
  let head = 0;
  let lastSampledSecond = -1;

  return {
    update(simTimeSeconds: number, population: number): void {
      const s = Math.floor(simTimeSeconds);
      if (s === lastSampledSecond) return; // redessine à 1 Hz seulement
      lastSampledSecond = s;
      samples[head] = population;
      head = (head + 1) % WINDOW;
      if (count < WINDOW) count++;

      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      let max = 1;
      for (let i = 0; i < count; i++) max = Math.max(max, samples[i]!);
      ctx.strokeStyle = "#aed581";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const idx = (head - count + i + WINDOW) % WINDOW;
        const x = (i / (WINDOW - 1)) * w;
        const y = h - 4 - (samples[idx]! / max) * (h - 18);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = "#e8f5e9";
      ctx.font = "11px monospace";
      ctx.fillText(`population ${population}`, 6, 12);
    },
  };
}
