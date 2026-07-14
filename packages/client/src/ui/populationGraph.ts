/**
 * Graphe de population temps réel : canvas vanilla (pas de lib — CLAUDE.md),
 * un échantillon par seconde de temps SIM, fenêtre glissante en ring buffer.
 * Deux courbes depuis la Phase 4 : herbivores (vert) et carnivores (rouge).
 */
export function createPopulationGraph(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const WINDOW = 600; // 600 échantillons à 1/s ≈ 10 min de sim
  const herbSamples = new Float32Array(WINDOW);
  const carnSamples = new Float32Array(WINDOW);
  let count = 0;
  let head = 0;
  let lastSampledSecond = -1;

  function drawSeries(samples: Float32Array, max: number, cssColor: string): void {
    const w = canvas.width, h = canvas.height;
    ctx.strokeStyle = cssColor;
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
  }

  return {
    update(simTimeSeconds: number, herbivores: number, carnivores: number): void {
      const s = Math.floor(simTimeSeconds);
      if (s === lastSampledSecond) return; // redessine à 1 Hz seulement
      lastSampledSecond = s;
      herbSamples[head] = herbivores;
      carnSamples[head] = carnivores;
      head = (head + 1) % WINDOW;
      if (count < WINDOW) count++;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let max = 1;
      for (let i = 0; i < count; i++) {
        max = Math.max(max, herbSamples[i]!, carnSamples[i]!);
      }
      drawSeries(herbSamples, max, "#aed581");
      drawSeries(carnSamples, max, "#ef9a9a");
      ctx.fillStyle = "#e8f5e9";
      ctx.font = "11px monospace";
      ctx.fillText(`H ${herbivores} · C ${carnivores}`, 6, 12);
    },
  };
}
