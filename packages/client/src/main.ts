import { createMainThreadHost } from "./hosts/mainThreadHost";
import { createCameraControls } from "./render/cameraControls";
import { createDayNight, formatTimeOfDay } from "./render/dayNight";
import { createScene } from "./render/scene";
import { buildTerrainMesh } from "./render/terrainMesh";
import { buildWaterMesh } from "./render/waterMesh";
import { createFrameStats } from "./ui/frameStats";
import { createOverlay } from "./ui/overlay";

const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const { scene, camera, renderer } = createScene(canvas);
const overlay = createOverlay(document.querySelector<HTMLDivElement>("#overlay")!);
const stats = createFrameStats();

// La sim tourne « ailleurs » (ici : main thread) ; le rendu n'est que spectateur.
const host = createMainThreadHost();
const config = host.getConfig();
const terrain = { heights: host.getTerrainHeights(), zones: host.getTerrainZones() };

scene.add(buildTerrainMesh(terrain, config));
scene.add(buildWaterMesh(config));
const dayNight = createDayNight(scene);
const cameraControls = createCameraControls(camera, renderer.domElement, config);

let last = performance.now();
let lastOverlayUpdate = 0;

renderer.setAnimationLoop((now) => {
  const frameMs = now - last;
  last = now;
  stats.addFrame(frameMs);

  host.update(now);
  const [, snapshot] = host.latestSnapshots();
  if (snapshot) dayNight.update(snapshot.timeOfDay);

  cameraControls.update(frameMs / 1000);

  if (now - lastOverlayUpdate > 500) {
    lastOverlayUpdate = now;
    overlay.setLine("fps", `FPS ${stats.fps().toFixed(0)}  (${stats.avgFrameMs().toFixed(1)} ms)`);
    if (snapshot) {
      overlay.setLine("tick", `tick ${snapshot.lastTickDurationMs.toFixed(2)} ms  (#${snapshot.tickCount})`);
      overlay.setLine("time", `heure ${formatTimeOfDay(snapshot.timeOfDay)}`);
    }
  }

  renderer.render(scene, camera);
});

export {}; // module
