import type { PlayerIntent } from "@eco/shared";

/**
 * Clavier/souris → intention. La direction est convertie en repère MONDE ICI :
 * le client a la caméra, et `packages/sim` doit rester sans DOM (architecture §2).
 * ZQSD et WASD sont acceptés tous les deux (clavier FR ou US).
 */
export function createPlayerInput(dom: HTMLElement) {
  const down = new Set<string>();
  let enabled = false;
  // Réutilisée à chaque frame : zéro allocation dans la boucle de rendu.
  const intent: PlayerIntent = {
    moveX: 0, moveZ: 0, sprint: false, strike: false, interact: false,
  };

  window.addEventListener("keydown", (e) => { down.add(e.code); });
  window.addEventListener("keyup", (e) => { down.delete(e.code); });
  dom.addEventListener("mousedown", (e) => {
    if (enabled && e.button === 0) intent.strike = true;
  });

  return {
    setEnabled(on: boolean): void {
      enabled = on;
      if (!on) {
        down.clear();
        intent.moveX = 0; intent.moveZ = 0;
        intent.sprint = false; intent.strike = false; intent.interact = false;
      }
    },
    /** Intention du frame, en repère monde. `yaw` = cap de la caméra. */
    intent(yaw: number): PlayerIntent {
      // Avant/arrière et gauche/droite dans le repère de la CAMÉRA…
      const fwd = (down.has("KeyW") || down.has("KeyZ") ? 1 : 0) - (down.has("KeyS") ? 1 : 0);
      const right = (down.has("KeyD") ? 1 : 0)
        - (down.has("KeyA") || down.has("KeyQ") ? 1 : 0);
      // … puis projetés en repère MONDE : la caméra regarde vers (sin yaw, cos yaw),
      // et sa droite est (cos yaw, −sin yaw).
      intent.moveX = fwd * Math.sin(yaw) + right * Math.cos(yaw);
      intent.moveZ = fwd * Math.cos(yaw) - right * Math.sin(yaw);
      intent.sprint = down.has("ShiftLeft") || down.has("ShiftRight");
      if (down.has("KeyE")) intent.interact = true;
      return intent;
    },
    /** À appeler APRÈS l'envoi : côté client, une impulsion ne vaut qu'un frame. */
    clearImpulses(): void {
      intent.strike = false;
      intent.interact = false;
    },
  };
}
