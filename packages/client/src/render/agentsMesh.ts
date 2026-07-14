import * as THREE from "three";
import type { AgentSnapshot, WorldConfig } from "@eco/shared";
import { sampleHeight, type TerrainData } from "@eco/sim";
import { createToonGradient } from "./materials";

/** Couleur du corps = état FSM ; l'ESPÈCE se lit à la silhouette (spec P4). */
const STATE_COLORS: Record<string, number> = {
  Wander: 0xf5f5f5, SeekWater: 0x42a5f5, Drink: 0x26c6da,
  SeekFood: 0xffa726, Eat: 0xffee58, SeekMate: 0xf06292,
  Flee: 0xba68c8, Hunt: 0xef5350, Scavenge: 0x8d6e63, Sleep: 0x5c6bc0, Dead: 0x616161,
};

const HERB_CAPACITY = 1024; // dimensionné pour le test de charge (?pop=600)
const CARN_CAPACITY = 256;

export function createAgentsMesh(scene: THREE.Scene, terrain: TerrainData, config: WorldConfig) {
  const mat = new THREE.MeshToonMaterial({ gradientMap: createToonGradient() });

  const herbGeo = new THREE.SphereGeometry(0.7, 7, 5);
  herbGeo.scale(0.9, 0.75, 1.2); // corps trapu, museau vers +Z (convention heading)
  const herbMesh = new THREE.InstancedMesh(herbGeo, mat, HERB_CAPACITY);

  // Carnivore = cône (silhouette triangulaire anguleuse) — repère visuel
  // temporaire, en attendant le design final. Pointe vers +Z (cap).
  const carnGeo = new THREE.ConeGeometry(0.85, 2.6, 4);
  carnGeo.rotateX(Math.PI / 2);   // axe du cône de +Y vers +Z (direction du cap)
  carnGeo.translate(0, 0.25, 0);
  const carnMesh = new THREE.InstancedMesh(carnGeo, mat, CARN_CAPACITY);

  for (const mesh of [herbMesh, carnMesh]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    scene.add(mesh);
  }

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const prevById = new Map<number, AgentSnapshot>();

  return {
    /** Interpole prev→latest (alpha ∈ [0,1]) : positions lisses à 60 FPS malgré le tick 20 Hz. */
    update(prev: AgentSnapshot[] | null, latest: AgentSnapshot[] | null, alpha: number): void {
      prevById.clear();
      if (prev) for (const a of prev) prevById.set(a.id, a);
      const list = latest ?? [];
      let nh = 0, nc = 0;
      for (let k = 0; k < list.length; k++) {
        const a = list[k]!;
        const isHerb = a.species === "herbivore";
        const mesh = isHerb ? herbMesh : carnMesh;
        const idx = isHerb ? nh : nc;
        if (idx >= (isHerb ? HERB_CAPACITY : CARN_CAPACITY)) continue;
        const b = prevById.get(a.id);
        const x = b ? b.x + (a.x - b.x) * alpha : a.x;
        const z = b ? b.z + (a.z - b.z) * alpha : a.z;
        let heading = a.heading;
        if (b) { // interpolation d'angle par le plus court chemin
          let dh = a.heading - b.heading;
          if (dh > Math.PI) dh -= Math.PI * 2;
          if (dh < -Math.PI) dh += Math.PI * 2;
          heading = b.heading + dh * alpha;
        }
        pos.set(x, sampleHeight(terrain, config, x, z) + 0.55, z);
        quat.setFromAxisAngle(up, heading);
        const s = a.adult ? 1 : 0.6; // les juvéniles sont visiblement petits
        scale.set(s, s, s);
        m.compose(pos, quat, scale);
        mesh.setMatrixAt(idx, m);
        mesh.setColorAt(idx, color.setHex(STATE_COLORS[a.state] ?? 0xffffff));
        if (isHerb) nh++; else nc++;
      }
      herbMesh.count = nh;
      carnMesh.count = nc;
      for (const mesh of [herbMesh, carnMesh]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
