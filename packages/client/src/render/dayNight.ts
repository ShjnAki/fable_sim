import * as THREE from "three";

/** Keyframes du cycle : minuit → aube → midi → crépuscule → minuit. */
interface Key {
  t: number;
  sky: number; sunColor: number; sunIntensity: number; hemiIntensity: number;
}
const KEYS: Key[] = [
  { t: 0.0, sky: 0x0d1b2e, sunColor: 0x8fb7ff, sunIntensity: 0.05, hemiIntensity: 0.12 },
  { t: 0.25, sky: 0xffc48a, sunColor: 0xffb36b, sunIntensity: 0.7, hemiIntensity: 0.35 },
  { t: 0.5, sky: 0x8ed4ff, sunColor: 0xffffff, sunIntensity: 1.2, hemiIntensity: 0.5 },
  { t: 0.75, sky: 0xff9e6b, sunColor: 0xff8c4d, sunIntensity: 0.7, hemiIntensity: 0.3 },
  { t: 1.0, sky: 0x0d1b2e, sunColor: 0x8fb7ff, sunIntensity: 0.05, hemiIntensity: 0.12 },
];

export function formatTimeOfDay(t: number): string {
  const minutes = Math.floor(t * 24 * 60);
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function createDayNight(scene: THREE.Scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x6a8f5a, 0.5);
  scene.add(sun, hemi);
  scene.fog = new THREE.Fog(0x8ed4ff, 400, 1400);
  const sky = new THREE.Color();
  const sunColor = new THREE.Color();
  const a = new THREE.Color(), b = new THREE.Color();

  return {
    update(timeOfDay: number): void {
      // interpolation entre les deux keyframes encadrantes
      let i = 0;
      while (KEYS[i + 1]!.t < timeOfDay) i++;
      const k0 = KEYS[i]!, k1 = KEYS[i + 1]!;
      const f = (timeOfDay - k0.t) / (k1.t - k0.t);

      sky.lerpColors(a.setHex(k0.sky), b.setHex(k1.sky), f);
      sunColor.lerpColors(a.setHex(k0.sunColor), b.setHex(k1.sunColor), f);
      (scene.background as THREE.Color).copy(sky);
      (scene.fog as THREE.Fog).color.copy(sky);
      sun.color.copy(sunColor);
      sun.intensity = THREE.MathUtils.lerp(k0.sunIntensity, k1.sunIntensity, f);
      hemi.intensity = THREE.MathUtils.lerp(k0.hemiIntensity, k1.hemiIntensity, f);

      // Course du soleil : lever à l'est (t=0.25), zénith à midi, sous l'horizon la nuit.
      const angle = timeOfDay * Math.PI * 2 - Math.PI / 2;
      sun.position.set(Math.cos(angle) * 400, Math.sin(angle) * 400, 120);
    },
  };
}
