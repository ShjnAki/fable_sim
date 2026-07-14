/**
 * Diagnostic : l'île est-elle d'un seul tenant pour un agent qui marche ?
 *
 * Utilise EXACTEMENT le prédicat de `tickAgent` (`sampleHeight >= waterLevel - 0.2`)
 * et calcule les composantes connexes de la terre praticable. Si l'île est coupée
 * en morceaux par les rivières, chaque morceau porte une sous-population isolée,
 * qui peut s'éteindre sans espoir de recolonisation.
 *
 * Usage : pnpm --filter @eco/sim exec vite-node scripts/connectivity.ts
 */
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from "@eco/shared";
import { createWorld } from "../src/world";
import { generateTerrain, sampleHeight } from "../src/terrain";

const config: WorldConfig = { ...DEFAULT_WORLD_CONFIG };
const terrain = generateTerrain(config);

// Échantillonnage au mètre : plus fin que la grille de biomasse (4 m), donc il
// détecte les gués étroits qu'une grille grossière raterait.
const STEP = 1;
const n = Math.floor(config.sizeMeters / STEP);
const half = config.sizeMeters / 2;
const at = (ix: number, iz: number): [number, number] =>
  [-half + (ix + 0.5) * STEP, -half + (iz + 0.5) * STEP];

const walk = new Uint8Array(n * n);
for (let iz = 0; iz < n; iz++) {
  for (let ix = 0; ix < n; ix++) {
    const [x, z] = at(ix, iz);
    walk[iz * n + ix] =
      sampleHeight(terrain, config, x, z) >= config.waterLevel - config.swimMaxDepth ? 1 : 0;
  }
}

// Composantes connexes (4-voisinage), file d'attente itérative.
const comp = new Int32Array(n * n).fill(-1);
const sizes: number[] = [];
const queue = new Int32Array(n * n);
for (let s = 0; s < n * n; s++) {
  if (walk[s] === 0 || comp[s] !== -1) continue;
  const id = sizes.length;
  let head = 0, tail = 0;
  queue[tail++] = s;
  comp[s] = id;
  let size = 0;
  while (head < tail) {
    const c = queue[head++]!;
    size++;
    const cx = c % n, cz = Math.floor(c / n);
    const push = (nx: number, nz: number): void => {
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) return;
      const k = nz * n + nx;
      if (walk[k] === 1 && comp[k] === -1) { comp[k] = id; queue[tail++] = k; }
    };
    push(cx - 1, cz); push(cx + 1, cz); push(cx, cz - 1); push(cx, cz + 1);
  }
  sizes.push(size);
}

const total = sizes.reduce((a, b) => a + b, 0);
const order = sizes.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s);

console.log(`Terre praticable : ${total} m² sur ${n * n} échantillonnés`);
console.log(`Composantes connexes : ${sizes.length}`);
console.log("\nLes 8 plus grandes (part de la terre praticable) :");
for (const { i, s } of order.slice(0, 8)) {
  console.log(`  #${i} : ${s} m²  (${((s / total) * 100).toFixed(1)} %)`);
}

// Où tombent les agents au démarrage ? Une population enfermée dans un îlot ne
// peut ni fuir, ni recoloniser.
const world = createWorld({});
const perComp = new Map<number, { herb: number; carn: number }>();
for (const a of world.agents) {
  const ix = Math.min(n - 1, Math.max(0, Math.floor((a.x + half) / STEP)));
  const iz = Math.min(n - 1, Math.max(0, Math.floor((a.z + half) / STEP)));
  const id = comp[iz * n + ix]!;
  const e = perComp.get(id) ?? { herb: 0, carn: 0 };
  if (a.species === "herbivore") e.herb++; else e.carn++;
  perComp.set(id, e);
}
console.log("\nPopulation initiale par composante (-1 = hors terre praticable) :");
for (const [id, e] of [...perComp.entries()].sort((a, b) => b[1].herb - a[1].herb)) {
  const s = id >= 0 ? sizes[id]! : 0;
  const part = id >= 0 ? `${((s / total) * 100).toFixed(1)} % de l'île` : "—";
  console.log(`  composante #${id} (${part}) : ${e.herb} herbivores, ${e.carn} carnivores`);
}
