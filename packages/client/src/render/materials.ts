import * as THREE from "three";

/**
 * Gradient à paliers pour MeshToonMaterial : c'est LUI qui donne le rendu
 * cel-shading (bandes de lumière discrètes façon Wind Waker).
 */
export function createToonGradient(steps = 4): THREE.Texture {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    // paliers de 40% à 100% de luminosité — jamais noir total
    data[i] = Math.round(255 * (0.4 + (0.6 * i) / (steps - 1)));
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
