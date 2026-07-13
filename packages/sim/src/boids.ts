import type { HerbivoreParams } from "@eco/shared";
import type { Agent } from "./agent";
import { forEachNeighbor, type SpatialGrid } from "./spatialGrid";
import type { SteerOut } from "./steering";

// État module partagé par le callback de voisinage — zéro allocation par appel.
let self: Agent;
let sepX = 0, sepZ = 0, velX = 0, velZ = 0, posX = 0, posZ = 0, count = 0;

function gather(n: Agent): void {
  if (n.id === self.id) return;
  count++;
  const dx = self.x - n.x, dz = self.z - n.z;
  const d2 = dx * dx + dz * dz;
  // Séparation pondérée par 1/d² : les très proches dominent largement.
  if (d2 > 1e-9) { sepX += dx / d2; sepZ += dz / d2; }
  velX += n.vx; velZ += n.vz;
  posX += n.x; posZ += n.z;
}

/**
 * Ajoute à out les forces de troupeau (Reynolds) calculées sur les voisins
 * dans boidsRadius, puis borne le TOTAL (comportement + boids) par maxForce.
 * fullFlock=false : séparation seule (anti-empilement hors errance).
 */
export function accumulateBoids(
  a: Agent, grid: SpatialGrid, p: HerbivoreParams, fullFlock: boolean, out: SteerOut,
): void {
  self = a;
  sepX = sepZ = velX = velZ = posX = posZ = 0;
  count = 0;
  forEachNeighbor(grid, a.x, a.z, p.boidsRadius, gather);
  if (count === 0) return;
  out.ax += sepX * p.separationWeight * p.maxSpeed;
  out.az += sepZ * p.separationWeight * p.maxSpeed;
  if (fullFlock) {
    // Alignement : rejoindre la vitesse moyenne ; cohésion : le centre de masse.
    out.ax += (velX / count - a.vx) * p.alignmentWeight;
    out.az += (velZ / count - a.vz) * p.alignmentWeight;
    out.ax += (posX / count - a.x) * p.cohesionWeight;
    out.az += (posZ / count - a.z) * p.cohesionWeight;
  }
  const m = Math.hypot(out.ax, out.az);
  if (m > p.maxForce) { out.ax = (out.ax / m) * p.maxForce; out.az = (out.az / m) * p.maxForce; }
}
