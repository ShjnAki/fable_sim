import { createScene } from "./render/scene";
import { createFrameStats } from "./ui/frameStats";
import { createOverlay } from "./ui/overlay";

const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const { scene, camera, renderer } = createScene(canvas);
const overlay = createOverlay(document.querySelector<HTMLDivElement>("#overlay")!);
const stats = createFrameStats();

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
