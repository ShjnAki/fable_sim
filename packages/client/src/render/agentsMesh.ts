import * as THREE from "three";
import type { AgentSnapshot, WorldConfig } from "@eco/shared";
import { sampleHeight, type TerrainData } from "@eco/sim";
import { createToonGradient } from "./materials";

/** Couleur du corps = état FSM ; l'ESPÈCE se lit à la silhouette. */
const STATE_COLORS: Record<string, number> = {
  Wander: 0xf5f5f5, SeekWater: 0x42a5f5, Drink: 0x26c6da,
  SeekFood: 0xffa726, Eat: 0xffee58, SeekMate: 0xf06292,
  Flee: 0xba68c8, Hunt: 0xef5350, Scavenge: 0x8d6e63, Sleep: 0x5c6bc0, Dead: 0x616161,
};

const HERB_CAPACITY = 1024; // dimensionné pour le test de charge (?pop=600)
const CARN_CAPACITY = 256;
const HUMAN_CAPACITY = 64; // les humains sont des outils, jamais nombreux

export function createAgentsMesh(scene: THREE.Scene, terrain: TerrainData, config: WorldConfig) {
  const mat = new THREE.MeshToonMaterial({ gradientMap: createToonGradient() });

  const herbGeo = new THREE.SphereGeometry(0.7, 7, 5);
  herbGeo.scale(0.9, 0.75, 1.2); // corps trapu, museau vers +Z (convention heading)
  const herbMesh = new THREE.InstancedMesh(herbGeo, mat, HERB_CAPACITY);

  // Carnivore = cône (silhouette triangulaire) — repère visuel temporaire.
  const carnGeo = new THREE.ConeGeometry(0.85, 2.6, 4);
  carnGeo.rotateX(Math.PI / 2);
  carnGeo.translate(0, 0.25, 0);
  const carnMesh = new THREE.InstancedMesh(carnGeo, mat, CARN_CAPACITY);

  // Humain = silhouette haute et fine (bipède), plus grande que les autres.
  const humanGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 6);
  humanGeo.translate(0, 0.9, 0); // pieds au sol
  const humanMesh = new THREE.InstancedMesh(humanGeo, mat, HUMAN_CAPACITY);

  const meshes = [herbMesh, carnMesh, humanMesh];
  for (const mesh of meshes) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    scene.add(mesh);
  }
  // instanceId → agentId, par mesh (pour le picking au clic).
  const ids: [number[], number[], number[]] = [[], [], []];

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const prevById = new Map<number, AgentSnapshot>();
  const selectedPos = new THREE.Vector3();
  let hasSelectedPos = false;

  function meshIndex(species: AgentSnapshot["species"]): 0 | 1 | 2 {
    return species === "herbivore" ? 0 : species === "carnivore" ? 1 : 2;
  }

  return {
    /** Interpole prev→latest ; `selectedId` : agent surligné (position mémorisée). */
    update(
      prev: AgentSnapshot[] | null, latest: AgentSnapshot[] | null, alpha: number,
      selectedId?: number | null,
    ): void {
      prevById.clear();
      if (prev) for (const a of prev) prevById.set(a.id, a);
      const list = latest ?? [];
      const counts: [number, number, number] = [0, 0, 0];
      const caps = [HERB_CAPACITY, CARN_CAPACITY, HUMAN_CAPACITY];
      hasSelectedPos = false;
      for (let k = 0; k < list.length; k++) {
        const a = list[k]!;
        const mi = meshIndex(a.species);
        const idx = counts[mi];
        if (idx >= caps[mi]!) continue;
        const b = prevById.get(a.id);
        const x = b ? b.x + (a.x - b.x) * alpha : a.x;
        const z = b ? b.z + (a.z - b.z) * alpha : a.z;
        let heading = a.heading;
        if (b) {
          let dh = a.heading - b.heading;
          if (dh > Math.PI) dh -= Math.PI * 2;
          if (dh < -Math.PI) dh += Math.PI * 2;
          heading = b.heading + dh * alpha;
        }
        const y = sampleHeight(terrain, config, x, z) + 0.55;
        pos.set(x, y, z);
        quat.setFromAxisAngle(up, heading);
        const s = a.adult ? 1 : 0.6;
        scale.set(s, s, s);
        m.compose(pos, quat, scale);
        meshes[mi]!.setMatrixAt(idx, m);
        meshes[mi]!.setColorAt(idx, color.setHex(STATE_COLORS[a.state] ?? 0xffffff));
        ids[mi]![idx] = a.id;
        if (selectedId != null && a.id === selectedId) {
          selectedPos.set(x, y + 1.6, z);
          hasSelectedPos = true;
        }
        counts[mi]++;
      }
      for (let mi = 0; mi < 3; mi++) {
        meshes[mi]!.count = counts[mi]!;
        ids[mi]!.length = counts[mi]!;
        meshes[mi]!.instanceMatrix.needsUpdate = true;
        if (meshes[mi]!.instanceColor) meshes[mi]!.instanceColor!.needsUpdate = true;
      }
    },

    /** Agent touché par le rayon (id), ou null. Teste les 3 meshes, plus proche gagne. */
    pick(raycaster: THREE.Raycaster): number | null {
      let bestId: number | null = null;
      let bestDist = Infinity;
      for (let mi = 0; mi < 3; mi++) {
        const hits = raycaster.intersectObject(meshes[mi]!, false);
        for (const h of hits) {
          if (h.instanceId != null && h.distance < bestDist) {
            bestDist = h.distance;
            bestId = ids[mi]![h.instanceId] ?? null;
          }
        }
      }
      return bestId;
    },

    /** Position monde de l'agent sélectionné au dernier update (pour le marqueur). */
    getSelectedPos(): THREE.Vector3 | null {
      return hasSelectedPos ? selectedPos : null;
    },
  };
}
