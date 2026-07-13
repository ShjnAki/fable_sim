import type { WorldConfig } from "@eco/shared";
import type { Agent } from "./agent";

/**
 * Grille uniforme 2D sur XZ (architecture §6), reconstruite à chaque tick par
 * tri de comptage : stable (ordre du tableau agents conservé dans chaque
 * cellule → déterminisme), zéro allocation en régime permanent (buffers
 * réutilisés ; `entries` croît de façon amortie avec la population).
 */
export interface SpatialGrid {
  cellSize: number;
  cols: number;         // grille cols × cols
  halfWorld: number;
  /** Curseurs d'écriture pendant rebuild (préfixe consommé). */
  counts: Uint32Array;  // cols² + 1
  /** starts[c]..starts[c+1] = plage de la cellule c dans entries. */
  starts: Uint32Array;  // cols² + 1
  entries: Uint32Array; // indices dans agents, groupés par cellule
  agents: Agent[];      // référence au tableau indexé par entries
}

export function createSpatialGrid(config: WorldConfig, cellSize = 10): SpatialGrid {
  const cols = Math.ceil(config.sizeMeters / cellSize);
  return {
    cellSize, cols, halfWorld: config.sizeMeters / 2,
    counts: new Uint32Array(cols * cols + 1),
    starts: new Uint32Array(cols * cols + 1),
    entries: new Uint32Array(64),
    agents: [],
  };
}

function cellOf(grid: SpatialGrid, x: number, z: number): number {
  const cx = Math.min(grid.cols - 1, Math.max(0, Math.floor((x + grid.halfWorld) / grid.cellSize)));
  const cz = Math.min(grid.cols - 1, Math.max(0, Math.floor((z + grid.halfWorld) / grid.cellSize)));
  return cz * grid.cols + cx;
}

/** Reconstruit la grille — les morts sont exclus. Deux passes : comptage, placement. */
export function rebuildGrid(grid: SpatialGrid, agents: Agent[]): void {
  grid.agents = agents;
  if (agents.length > grid.entries.length) {
    grid.entries = new Uint32Array(Math.max(agents.length, grid.entries.length * 2));
  }
  grid.counts.fill(0);
  for (const a of agents) {
    if (a.state !== "Dead") grid.counts[cellOf(grid, a.x, a.z) + 1]!++;
  }
  for (let c = 1; c < grid.counts.length; c++) grid.counts[c]! += grid.counts[c - 1]!;
  grid.starts.set(grid.counts);
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i]!;
    if (a.state === "Dead") continue;
    const c = cellOf(grid, a.x, a.z);
    grid.entries[grid.counts[c]!] = i; // counts sert de curseur d'écriture
    grid.counts[c]!++;
  }
}

/** Applique fn à chaque agent vivant à distance ≤ r de (x, z). Ordre stable. */
export function forEachNeighbor(
  grid: SpatialGrid, x: number, z: number, r: number, fn: (a: Agent) => void,
): void {
  const { cols, cellSize, halfWorld } = grid;
  const cx0 = Math.min(cols - 1, Math.max(0, Math.floor((x - r + halfWorld) / cellSize)));
  const cx1 = Math.min(cols - 1, Math.max(0, Math.floor((x + r + halfWorld) / cellSize)));
  const cz0 = Math.min(cols - 1, Math.max(0, Math.floor((z - r + halfWorld) / cellSize)));
  const cz1 = Math.min(cols - 1, Math.max(0, Math.floor((z + r + halfWorld) / cellSize)));
  const r2 = r * r;
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const c = cz * cols + cx;
      const end = grid.starts[c + 1]!;
      for (let e = grid.starts[c]!; e < end; e++) {
        const a = grid.agents[grid.entries[e]!]!;
        const dx = a.x - x, dz = a.z - z;
        if (dx * dx + dz * dz <= r2) fn(a);
      }
    }
  }
}
