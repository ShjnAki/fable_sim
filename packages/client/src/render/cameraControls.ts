import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { WorldConfig } from "@eco/shared";

/**
 * Souris = orbite/zoom (OrbitControls). ZQSD/WASD + flèches = translation de la
 * cible sur le plan du sol, relative au cap de la caméra.
 */
export function createCameraControls(
  camera: THREE.PerspectiveCamera, domElement: HTMLElement, config: WorldConfig,
) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // jamais sous l'horizon
  controls.minDistance = 10;
  controls.maxDistance = 600;
  controls.target.set(0, 10, 0);

  const pressed = new Set<string>();
  window.addEventListener("keydown", (e) => pressed.add(e.code));
  window.addEventListener("keyup", (e) => pressed.delete(e.code));

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const SPEED = 80; // m/s
  const limit = config.sizeMeters * 0.75;

  return {
    update(deltaSeconds: number): void {
      // Axes de déplacement projetés sur le plan du sol.
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, DOWN); // gauche caméra
      move.set(0, 0, 0);
      if (pressed.has("KeyW") || pressed.has("ArrowUp")) move.add(forward);
      if (pressed.has("KeyS") || pressed.has("ArrowDown")) move.sub(forward);
      if (pressed.has("KeyA") || pressed.has("ArrowLeft")) move.add(right);
      if (pressed.has("KeyD") || pressed.has("ArrowRight")) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(SPEED * deltaSeconds);
        controls.target.add(move);
        camera.position.add(move);
        // On reste au-dessus du monde (pas de vol au-delà de l'océan utile).
        controls.target.x = THREE.MathUtils.clamp(controls.target.x, -limit, limit);
        controls.target.z = THREE.MathUtils.clamp(controls.target.z, -limit, limit);
      }
      controls.update();
    },
  };
}
