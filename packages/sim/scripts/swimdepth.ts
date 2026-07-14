/**
 * Diagnostic : à quelle profondeur de gué l'île se reconnecte-t-elle, et à partir
 * de quand ouvre-t-on l'océan (au risque de voir les agents partir à la mer) ?
 *
 * Usage : pnpm --filter @eco/sim exec vite-node scripts/swimdepth.ts
 */
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from "@eco/shared";
import { generateTerrain, sampleHeight } from "../src/terrain";

const config: WorldConfig = { ...DEFAULT_WORLD_CONFIG };
const terrain = generateTerrain(config);

const STEP = 1;
const n = Math.floor(config.sizeMeters / STEP);
const half = config.sizeMeters / 2;
const h = new Float32Array(n * n);
for (let iz = 0; iz < n; iz++) {
  for (let ix = 0; ix < n; ix++) {
    h[iz * n + ix] = sampleHeight(
      terrain, config, -half + (ix + 0.5) * STEP, -half + (iz + 0.5) * STEP,
    );
  }
}

/** Composantes connexes des cellules franchissables à une profondeur donnée. */
function analyse(maxDepth: number): { comps: number; biggest: number; area: number } {
  const floor = config.waterLevel - maxDepth;
  const comp = new Int32Array(n * n).fill(-1);
  const queue = new Int32Array(n * n);
  const sizes: number[] = [];
  let area = 0;
  for (let s = 0; s < n * n; s++) if (h[s]! >= floor) area++;
  for (let s = 0; s < n * n; s++) {
    if (h[s]! < floor || comp[s] !== -1) continue;
    const id = sizes.length;
    let head = 0, tail = 0;
    queue[tail++] = s; comp[s] = id;
    let size = 0;
    while (head < tail) {
      const c = queue[head++]!;
      size++;
      const cx = c % n, cz = Math.floor(c / n);
      const push = (nx: number, nz: number): void => {
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) return;
        const k = nz * n + nx;
        if (h[k]! >= floor && comp[k] === -1) { comp[k] = id; queue[tail++] = k; }
      };
      push(cx - 1, cz); push(cx + 1, cz); push(cx, cz - 1); push(cx, cz + 1);
    }
    sizes.push(size);
  }
  const big = sizes.length ? Math.max(...sizes) : 0;
  return { comps: sizes.filter((s) => s > 50).length, biggest: big, area };
}

const land = analyse(0.2); // le prédicat actuel des agents
console.log("profondeur | composantes >50 m² | plus grande | part de la +grande | surface");
console.log(`  ACTUEL   |         ${String(land.comps).padStart(2)}         | ${String(land.biggest).padStart(6)} m² |       —        | ${land.area} m²`);
for (const d of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 8]) {
  const r = analyse(d);
  const partOfLand = ((r.biggest / land.area) * 100).toFixed(0);
  console.log(
    `  ${String(d).padStart(4)} m  |         ${String(r.comps).padStart(2)}         | `
    + `${String(r.biggest).padStart(6)} m² |  ${partOfLand.padStart(4)} % de la terre | ${r.area} m²`,
  );
}
console.log(`\n(terre praticable actuelle = ${land.area} m² ; le monde fait ${n * n} m²)`);
console.log("On cherche : composantes = 1, sans que la surface explose (= océan ouvert).");
