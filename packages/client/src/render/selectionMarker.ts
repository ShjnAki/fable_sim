import * as THREE from "three";

/**
 * Anneau lumineux qui flotte au-dessus de l'agent sélectionné (inspection au
 * clic, Phase 5). Tourne lentement pour attirer l'œil ; caché si rien de
 * sélectionné.
 */
export function createSelectionMarker(scene: THREE.Scene) {
  const geo = new THREE.TorusGeometry(0.8, 0.12, 8, 20);
  geo.rotateX(Math.PI / 2); // anneau horizontal
  const marker = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0xffeb3b }),
  );
  marker.visible = false;
  scene.add(marker);

  return {
    update(worldPos: THREE.Vector3 | null, dtSeconds: number): void {
      if (!worldPos) { marker.visible = false; return; }
      marker.visible = true;
      marker.position.copy(worldPos);
      marker.rotation.y += dtSeconds * 2;
    },
  };
}
