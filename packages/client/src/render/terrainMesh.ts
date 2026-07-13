import * as THREE from "three";
import type { WorldConfig } from "@eco/shared";
import {
  ZONE_ROCK, ZONE_WATER, classifyZone, sampleHeight, slopeAt, type TerrainData,
} from "@eco/sim";
import { createToonGradient } from "./materials";

// Palette Wind Waker : saturée, chaleureuse.
const GRASS_LOW = new THREE.Color(0x4caf50);
const GRASS_HIGH = new THREE.Color(0x8bc34a);
const ROCK = new THREE.Color(0x8d8d93);
const SAND = new THREE.Color(0xe8d59b);

export function buildTerrainMesh(terrain: TerrainData, config: WorldConfig): THREE.Mesh {
  const n = config.terrainResolution;
  const size = config.sizeMeters;
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2); // plan XZ, Y vers le haut

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = sampleHeight(terrain, config, x, z);
    pos.setY(i, h);

    // Couleur par sommet : mêmes règles de zone que la sim (classifyZone),
    // plus une bande de sable purement visuelle près de l'eau.
    const zone = classifyZone(h, slopeAt(terrain, config, x, z), config);
    if (zone === ZONE_ROCK) c.copy(ROCK);
    else if (zone === ZONE_WATER || h < config.waterLevel + 1.2) c.copy(SAND);
    else c.lerpColors(GRASS_LOW, GRASS_HIGH, Math.min(1, h / config.maxHeight));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  pos.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonGradient(),
  });
  return new THREE.Mesh(geo, mat);
}
