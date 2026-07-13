import { describe, expect, it } from "vitest";
import { createRng } from "@eco/shared";
import { createHerbivore } from "./agent";
import { arrive, seek, wander, type SteerOut } from "./steering";

const out: SteerOut = { ax: 0, az: 0 };
const mk = () => createHerbivore(1, 0, 0, createRng("s"));

describe("steering", () => {
  it("seek accélère vers la cible, borné par maxForce", () => {
    const a = mk();
    seek(a, 100, 0, 4, 6, out);
    expect(out.ax).toBeCloseTo(4); // désiré (4,0) − vitesse (0,0), sous maxForce
    expect(out.az).toBeCloseTo(0);
    seek(a, 0, -100, 10, 6, out); // désiré (0,−10) : norme 10 > maxForce 6
    expect(Math.hypot(out.ax, out.az)).toBeCloseTo(6);
  });

  it("arrive ralentit dans le rayon d'approche", () => {
    const far = mk();
    arrive(far, 100, 0, 6, 4, 6, out);
    const speedFar = Math.hypot(out.ax, out.az);
    const near = mk();
    arrive(near, 1, 0, 6, 4, 6, out);
    const speedNear = Math.hypot(out.ax, out.az);
    expect(speedNear).toBeLessThan(speedFar);
  });

  it("wander est déterministe et fait dériver l'angle", () => {
    const a = mk(), b = mk();
    const ra = createRng("w"), rb = createRng("w");
    const before = a.wanderAngle;
    for (let i = 0; i < 10; i++) { wander(a, ra, 4, 6, out); wander(b, rb, 4, 6, out); }
    expect(a.wanderAngle).toBe(b.wanderAngle);
    expect(a.wanderAngle).not.toBe(before);
  });
});
