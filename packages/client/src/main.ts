import * as THREE from "three";
import { DEFAULT_WORLD_CONFIG } from "@eco/shared";
import { generateTerrain } from "@eco/sim";
import { createScene } from "./render/scene";
import { buildTerrainMesh } from "./render/terrainMesh";
import { buildWaterMesh } from "./render/waterMesh";
import { createFrameStats } from "./ui/frameStats";
import { createOverlay } from "./ui/overlay";

const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const { scene, camera, renderer } = createScene(canvas);
const overlay = createOverlay(document.querySelector<HTMLDivElement>("#overlay")!);
const stats = createFrameStats();

// Terrain généré directement (le SimHost prend le relais en Task 8).
const config = DEFAULT_WORLD_CONFIG;
const terrain = generateTerrain(config);
scene.add(buildTerrainMesh(terrain, config));
scene.add(buildWaterMesh(config));

// Éclairage provisoire (remplacé par le cycle jour/nuit en Task 8)
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(200, 300, 100);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x6a8f5a, 0.5));

let last = performance.now();
let lastOverlayUpdate = 0;

renderer.setAnimationLoop((now) => {
  const frameMs = now - last;
  last = now;
  stats.addFrame(frameMs);

  if (now - lastOverlayUpdate > 500) {
    lastOverlayUpdate = now;
    overlay.setLine("fps", `FPS ${stats.fps().toFixed(0)}  (${stats.avgFrameMs().toFixed(1)} ms)`);
  }

  renderer.render(scene, camera);
});

export {}; // module
