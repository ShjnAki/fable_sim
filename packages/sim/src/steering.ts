import type { Rng } from "@eco/shared";
import type { Agent } from "./agent";

/** Sortie de steering : accélération. Rempli en place — zéro allocation. */
export interface SteerOut { ax: number; az: number; }

/** Accélération = (vitesse désirée − vitesse actuelle), bornée par maxForce. */
function steerToward(a: Agent, dvx: number, dvz: number, maxForce: number, out: SteerOut): void {
  let ax = dvx - a.vx, az = dvz - a.vz;
  const m = Math.hypot(ax, az);
  if (m > maxForce) { ax = (ax / m) * maxForce; az = (az / m) * maxForce; }
  out.ax = ax; out.az = az;
}

export function seek(a: Agent, tx: number, tz: number, maxSpeed: number, maxForce: number, out: SteerOut): void {
  const dx = tx - a.x, dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) { steerToward(a, 0, 0, maxForce, out); return; }
  steerToward(a, (dx / d) * maxSpeed, (dz / d) * maxSpeed, maxForce, out);
}

/** Comme seek, mais la vitesse désirée décroît linéairement dans slowRadius. */
export function arrive(a: Agent, tx: number, tz: number, slowRadius: number, maxSpeed: number, maxForce: number, out: SteerOut): void {
  const dx = tx - a.x, dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) { steerToward(a, 0, 0, maxForce, out); return; }
  const speed = d < slowRadius ? maxSpeed * (d / slowRadius) : maxSpeed;
  steerToward(a, (dx / d) * speed, (dz / d) * speed, maxForce, out);
}

/** Errance : le cap dérive par marche aléatoire — exploration sans but. */
export function wander(a: Agent, rng: Rng, maxSpeed: number, maxForce: number, out: SteerOut): void {
  a.wanderAngle += (rng() - 0.5) * 0.6;
  steerToward(a, Math.sin(a.wanderAngle) * maxSpeed * 0.5, Math.cos(a.wanderAngle) * maxSpeed * 0.5, maxForce, out);
}
