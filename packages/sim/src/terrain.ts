import { createNoise2D } from "simplex-noise";
import { createRng, type WorldConfig } from "@eco/shared";

export const ZONE_WATER = 0;
export const ZONE_GRASS = 1;
export const ZONE_ROCK = 2;
export type Zone = 0 | 1 | 2;

export interface TerrainData {
  /** (terrainResolution+1)² hauteurs en mètres, row-major : index = iz * (n+1) + ix. */
  heights: Float32Array;
  /** biomassResolution² zones, évaluées au centre de chaque cellule. */
  zones: Uint8Array;
  /** Indices des cellules d'herbe adjacentes à l'eau (points où boire). */
  shoreCells: Uint32Array;
}

/** smoothstep décroissant : 1 quand d <= inner, 0 quand d >= outer. */
function falloff(d: number, inner: number, outer: number): number {
  const t = Math.min(1, Math.max(0, (d - inner) / (outer - inner)));
  return 1 - t * t * (3 - 2 * t);
}

export function classifyZone(height: number, slope: number, config: WorldConfig): Zone {
  if (height < config.waterLevel) return ZONE_WATER;
  if (slope > config.rockSlope) return ZONE_ROCK;
  return ZONE_GRASS;
}

export function generateTerrain(config: WorldConfig): TerrainData {
  const rng = createRng(config.seed + ":terrain");
  const noise2D = createNoise2D(rng);
  const n = config.terrainResolution;
  const size = config.sizeMeters;
  const half = size / 2;

  // fBm : 4 octaves de simplex, amplitude /2 et fréquence ×2 à chaque octave.
  const heightAt = (x: number, z: number): number => {
    let amp = 1, freq = 1 / config.noiseWavelength, sum = 0, norm = 0;
    for (let o = 0; o < 4; o++) {
      sum += amp * noise2D(x * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    let h = (sum / norm + 1) / 2;      // → [0, 1]
    h = Math.pow(h, 1.4);               // aplatit les vallées, garde des sommets
    // Falloff insulaire : le relief s'éteint vers le bord → océan garanti.
    const d = Math.hypot(x, z) / half;
    return h * config.maxHeight * falloff(d, 0.55, 1.0);
  };

  const heights = new Float32Array((n + 1) * (n + 1));
  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) {
      heights[iz * (n + 1) + ix] = heightAt((ix / n) * size - half, (iz / n) * size - half);
    }
  }

  // Rivières : deux chenaux en croix creusés sous le niveau de l'eau, des
  // hauteurs centrales vers les deux mers. Répartit l'eau (donc les points où
  // boire, donc les proies) sur toute l'île. Méandre par un bruit dédié
  // (graine séparée → le relief hors rivières est identique à avant).
  if (config.riverWidth > 0) {
    const meander = createNoise2D(createRng(config.seed + ":rivers"));
    const w = config.riverWidth;
    for (let iz = 0; iz <= n; iz++) {
      for (let ix = 0; ix <= n; ix++) {
        const x = (ix / n) * size - half;
        const z = (iz / n) * size - half;
        const cz = config.riverMeander * meander(x * 0.012, 7.3);  // rivière ~E-O
        const cx = config.riverMeander * meander(z * 0.012, 19.1); // rivière ~N-S
        const d = Math.min(Math.abs(z - cz), Math.abs(x - cx));
        if (d < w) {
          const t = d / w;                            // 0 au centre, 1 à la berge
          const bed = config.waterLevel - config.riverDepth * (1 - t * t);
          const idx = iz * (n + 1) + ix;
          if (heights[idx]! > bed) heights[idx] = bed;
        }
      }
    }
  }

  // Pont naturel central : une bande étroite surélevée au-dessus de l'eau qui
  // retraverse le carrefour de rivières pour relier les terres. Étroit et bordé
  // d'eau → les animaux le franchissent mais certains s'égarent au bord.
  if (config.bridgeWidth > 0) {
    const deck = config.waterLevel + config.bridgeHeight;
    for (let iz = 0; iz <= n; iz++) {
      for (let ix = 0; ix <= n; ix++) {
        const x = (ix / n) * size - half;
        const z = (iz / n) * size - half;
        if (Math.abs(x) < config.bridgeReach && Math.abs(z) < config.bridgeWidth) {
          const idx = iz * (n + 1) + ix;
          if (heights[idx]! < deck) heights[idx] = deck;
        }
      }
    }
  }

  const terrain: TerrainData = {
    heights, zones: new Uint8Array(0), shoreCells: new Uint32Array(0),
  };

  // Zones aux centres des cellules de la grille biomasse.
  const b = config.biomassResolution;
  const zones = new Uint8Array(b * b);
  for (let iz = 0; iz < b; iz++) {
    for (let ix = 0; ix < b; ix++) {
      const x = ((ix + 0.5) / b) * size - half;
      const z = ((iz + 0.5) / b) * size - half;
      const h = sampleHeight(terrain, config, x, z);
      zones[iz * b + ix] = classifyZone(h, slopeAt(terrain, config, x, z), config);
    }
  }
  terrain.zones = zones;

  // Cellules de rive : herbe en 4-voisinage d'une cellule d'eau — les abreuvoirs.
  const shore: number[] = [];
  for (let iz = 0; iz < b; iz++) {
    for (let ix = 0; ix < b; ix++) {
      const i = iz * b + ix;
      if (zones[i] !== ZONE_GRASS) continue;
      if ((ix > 0 && zones[i - 1] === ZONE_WATER) ||
          (ix < b - 1 && zones[i + 1] === ZONE_WATER) ||
          (iz > 0 && zones[i - b] === ZONE_WATER) ||
          (iz < b - 1 && zones[i + b] === ZONE_WATER)) shore.push(i);
    }
  }
  terrain.shoreCells = Uint32Array.from(shore);
  return terrain;
}

/** Hauteur du terrain en coordonnées monde (interpolation bilinéaire, clamp aux bords). */
export function sampleHeight(t: TerrainData, config: WorldConfig, x: number, z: number): number {
  const n = config.terrainResolution;
  const half = config.sizeMeters / 2;
  // coordonnées de grille flottantes, clampées dans [0, n]
  const gx = Math.min(n, Math.max(0, ((x + half) / config.sizeMeters) * n));
  const gz = Math.min(n, Math.max(0, ((z + half) / config.sizeMeters) * n));
  const ix = Math.min(n - 1, Math.floor(gx));
  const iz = Math.min(n - 1, Math.floor(gz));
  const fx = gx - ix, fz = gz - iz;
  const w = n + 1;
  const h00 = t.heights[iz * w + ix]!, h10 = t.heights[iz * w + ix + 1]!;
  const h01 = t.heights[(iz + 1) * w + ix]!, h11 = t.heights[(iz + 1) * w + ix + 1]!;
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

/** Pente locale (dy par mètre horizontal) par différences centrées à ±1 m. */
export function slopeAt(t: TerrainData, config: WorldConfig, x: number, z: number): number {
  const e = 1;
  const dx = (sampleHeight(t, config, x + e, z) - sampleHeight(t, config, x - e, z)) / (2 * e);
  const dz = (sampleHeight(t, config, x, z + e) - sampleHeight(t, config, x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}
