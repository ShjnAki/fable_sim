import * as THREE from "three";

/**
 * Caméra 3ᵉ personne : orbite derrière l'épaule du joueur. La souris (pointer
 * lock) tourne, la molette éloigne.
 *
 * Elle suit une cible LISSÉE, pas la position brute de l'agent : la sim tourne à
 * 20 Hz et le rendu à 60 FPS, donc la suivre au plus juste ferait trembler l'image
 * au rythme des ticks.
 */
export function createPlayerCamera(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
  let yaw = 0;
  let pitch = 0.35; // radians au-dessus de l'horizon
  let distance = 9;
  let enabled = false;
  const follow = new THREE.Vector3();
  let hasFollow = false;

  document.addEventListener("mousemove", (e) => {
    if (!enabled || document.pointerLockElement !== dom) return;
    yaw -= e.movementX * 0.0025;
    pitch = Math.min(1.2, Math.max(-0.2, pitch + e.movementY * 0.0025));
  });
  dom.addEventListener("wheel", (e) => {
    if (!enabled) return;
    distance = Math.min(25, Math.max(4, distance + e.deltaY * 0.01));
  }, { passive: true });

  return {
    setEnabled(on: boolean): void {
      enabled = on;
      hasFollow = false; // on ne « glisse » pas depuis l'ancienne position
      if (on) void dom.requestPointerLock();
      else if (document.pointerLockElement === dom) document.exitPointerLock();
    },
    /** Cap de la caméra — le client s'en sert pour convertir ZQSD en repère monde. */
    yaw: (): number => yaw,
    update(tx: number, ty: number, tz: number, dt: number): void {
      if (!enabled) return;
      if (!hasFollow) { follow.set(tx, ty, tz); hasFollow = true; }
      // Lissage exponentiel, indépendant du framerate.
      const k = 1 - Math.exp(-12 * dt);
      follow.x += (tx - follow.x) * k;
      follow.y += (ty - follow.y) * k;
      follow.z += (tz - follow.z) * k;
      const horiz = Math.cos(pitch) * distance;
      camera.position.set(
        follow.x - Math.sin(yaw) * horiz,
        follow.y + Math.sin(pitch) * distance + 1.5,
        follow.z - Math.cos(yaw) * horiz,
      );
      camera.lookAt(follow.x, follow.y + 1.2, follow.z);
    },
  };
}
