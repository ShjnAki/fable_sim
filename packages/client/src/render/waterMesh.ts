import * as THREE from "three";
import type { WorldConfig } from "@eco/shared";
import { createToonGradient } from "./materials";

export function buildWaterMesh(config: WorldConfig): THREE.Mesh {
  // Déborde du monde (×1.6) pour donner un horizon d'océan.
  const geo = new THREE.PlaneGeometry(config.sizeMeters * 1.6, config.sizeMeters * 1.6);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshToonMaterial({
    color: 0x2e9ad0,
    gradientMap: createToonGradient(),
    transparent: true,
    opacity: 0.88,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = config.waterLevel;
  return mesh;
}
