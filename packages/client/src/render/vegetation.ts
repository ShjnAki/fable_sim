import * as THREE from "three";
import { createRng, type WorldConfig } from "@eco/shared";
import { ZONE_GRASS, sampleHeight, type TerrainData } from "@eco/sim";
import { createToonGradient } from "./materials";

/**
 * Une touffe (cône low-poly) par cellule d'herbe, en InstancedMesh (1 draw call).
 * L'échelle verticale de chaque touffe suit la biomasse de sa cellule : le monde
 * « verdit » à l'œil nu quand la végétation repousse.
 */
export function createVegetation(
  terrain: TerrainData, config: WorldConfig, scene: THREE.Scene,
) {
  const rng = createRng(config.seed + ":veg");
  const b = config.biomassResolution;
  const cellSize = config.sizeMeters / b;
  const half = config.sizeMeters / 2;

  // Une instance par cellule d'herbe : position fixée à l'init, jitter déterministe.
  const cells: number[] = [];
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < terrain.zones.length; i++) {
    if (terrain.zones[i] !== ZONE_GRASS) continue;
    const ix = i % b, iz = Math.floor(i / b);
    const x = (ix + 0.2 + rng() * 0.6) * cellSize - half;
    const z = (iz + 0.2 + rng() * 0.6) * cellSize - half;
    cells.push(i);
    positions.push(new THREE.Vector3(x, sampleHeight(terrain, config, x, z), z));
  }

  const geo = new THREE.ConeGeometry(0.5, 1.4, 5);
  geo.translate(0, 0.7, 0); // pivot à la base : scale.y fait « pousser » la touffe
  const mat = new THREE.MeshToonMaterial({ gradientMap: createToonGradient() });
  const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Teinte verte légèrement variée par instance (cel-shading moins uniforme).
  const green = new THREE.Color();
  for (let k = 0; k < cells.length; k++) {
    green.setHSL(0.31 + rng() * 0.06, 0.55, 0.32 + rng() * 0.12);
    mesh.setColorAt(k, green);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();

  return {
    count: cells.length,
    /** À appeler à cadence lente (~1 Hz) — réécrit toutes les matrices (peu coûteux). */
    refresh(biomass: Float32Array): void {
      for (let k = 0; k < cells.length; k++) {
        const bio = biomass[cells[k]!]!;
        // sous 0.05 : invisible ; sinon la touffe grandit avec la biomasse
        const sy = bio < 0.05 ? 0.0001 : 0.25 + 0.75 * bio;
        s.set(0.6 + 0.4 * bio, sy, 0.6 + 0.4 * bio);
        m.compose(positions[k]!, q, s);
        mesh.setMatrixAt(k, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
