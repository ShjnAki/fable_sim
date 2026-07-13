/** Générateur pseudo-aléatoire : () => nombre uniforme dans [0, 1). */
export type Rng = () => number;

// xmur3 : hache une chaîne vers des entiers 32 bits (dérivation de graine).
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/**
 * mulberry32 : PRNG 32 bits rapide, largement suffisant pour une sim
 * (aucun usage cryptographique). Déterministe sur une même machine.
 */
export function createRng(seed: string | number): Rng {
  let a = typeof seed === "number" ? seed >>> 0 : xmur3(seed)();
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
