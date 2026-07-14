import * as THREE from "three";
import { createMainThreadHost } from "./hosts/mainThreadHost";
import { createAgentsMesh } from "./render/agentsMesh";
import { createCameraControls } from "./render/cameraControls";
import { createDayNight, formatTimeOfDay } from "./render/dayNight";
import { createScene } from "./render/scene";
import { createSelectionMarker } from "./render/selectionMarker";
import { buildTerrainMesh } from "./render/terrainMesh";
import { createVegetation } from "./render/vegetation";
import { buildWaterMesh } from "./render/waterMesh";
import { createControls } from "./ui/controls";
import { createFrameStats } from "./ui/frameStats";
import { createInspector } from "./ui/inspector";
import { createOverlay } from "./ui/overlay";
import { createPopulationGraph } from "./ui/populationGraph";

const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const { scene, camera, renderer } = createScene(canvas);
const overlay = createOverlay(document.querySelector<HTMLDivElement>("#overlay")!);
const stats = createFrameStats();

// La sim tourne « ailleurs » (ici : main thread) ; le rendu n'est que spectateur.
// ?pop=600 : test de charge (critère Phase 3 : 500+ agents à 60 FPS).
const urlParams = new URLSearchParams(location.search);
const popOverride = Number(urlParams.get("pop") ?? "");
const host = createMainThreadHost(
  Number.isFinite(popOverride) && popOverride > 0
    ? { initialHerbivores: Math.floor(popOverride) }
    : {},
);
const config = host.getConfig();
// shoreCells vide : le rendu n'utilise jamais les rives (compromis plan Phase 2).
const terrain = {
  heights: host.getTerrainHeights(),
  zones: host.getTerrainZones(),
  shoreCells: new Uint32Array(0),
};

const terrainMesh = buildTerrainMesh(terrain, config);
scene.add(terrainMesh);
scene.add(buildWaterMesh(config));
const dayNight = createDayNight(scene);
const cameraControls = createCameraControls(camera, renderer.domElement, config);
const vegetation = createVegetation(terrain, config, scene);
vegetation.refresh(host.getBiomass());
const agentsMesh = createAgentsMesh(scene, terrain, config);
const inspector = createInspector(document.querySelector<HTMLDivElement>("#inspector")!);
const popGraph = createPopulationGraph(document.querySelector<HTMLCanvasElement>("#popgraph")!);
const controls = createControls(host);
const selectionMarker = createSelectionMarker(scene);

// Inspection / perturbation au clic : rayon depuis la souris.
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let selectedId: number | null = null;

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  ndc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  const tool = controls.activeTool();
  if (tool === "inspect") {
    selectedId = agentsMesh.pick(raycaster); // null si clic dans le vide → désélection
  } else {
    // Pinceau d'ajout : point d'impact sur le terrain → spawn.
    const hit = raycaster.intersectObject(terrainMesh, false)[0];
    if (hit) {
      const species = tool === "add-herbivore" ? "herbivore"
        : tool === "add-carnivore" ? "carnivore" : "human";
      host.spawnAgent(species, hit.point.x, hit.point.z);
    }
  }
});

let last = performance.now();
let lastOverlayUpdate = 0;
let lastVegTick = 0;
let lastHerb = 0;
let lastCarn = 0;
let lastHuman = 0;

renderer.setAnimationLoop((now) => {
  const frameMs = now - last;
  last = now;
  stats.addFrame(frameMs);

  host.update(now);
  const [prevSnap, snapshot] = host.latestSnapshots();
  if (snapshot) dayNight.update(snapshot.timeOfDay);

  // Rafraîchissement de la végétation à cadence lente (~toutes les 1.25 s de sim).
  if (snapshot && snapshot.tickCount - lastVegTick >= 25) {
    lastVegTick = snapshot.tickCount;
    vegetation.refresh(host.getBiomass());
  }

  agentsMesh.update(
    prevSnap?.agents ?? null, snapshot?.agents ?? null, host.interpolationAlpha(), selectedId,
  );
  selectionMarker.update(agentsMesh.getSelectedPos(), frameMs / 1000);
  if (snapshot) {
    // L'agent sélectionné a-t-il disparu (mort/despawn) ? → désélection.
    if (selectedId != null && !snapshot.agents.some((a) => a.id === selectedId)) selectedId = null;
    let herb = 0, carn = 0, human = 0;
    for (const a of snapshot.agents) {
      if (a.species === "herbivore") herb++;
      else if (a.species === "carnivore") carn++;
      else human++;
    }
    popGraph.update(snapshot.simTimeSeconds, herb, carn);
    lastHerb = herb; lastCarn = carn; lastHuman = human;
  }

  cameraControls.update(frameMs / 1000);

  if (now - lastOverlayUpdate > 500) {
    lastOverlayUpdate = now;
    overlay.setLine("fps", `FPS ${stats.fps().toFixed(0)}  (${stats.avgFrameMs().toFixed(1)} ms)`);
    if (snapshot) {
      overlay.setLine("tick", `tick ${snapshot.lastTickDurationMs.toFixed(2)} ms  (#${snapshot.tickCount})`);
      overlay.setLine("time", `heure ${formatTimeOfDay(snapshot.timeOfDay)}`);
      overlay.setLine("veg", `végétation ${vegetation.count} touffes`);
      const humanStr = lastHuman > 0 ? ` · humains ${lastHuman}` : "";
      overlay.setLine("agents", `herbivores ${lastHerb} · carnivores ${lastCarn}${humanStr}`);
      const sp = host.getSpeed();
      overlay.setLine("speed", `vitesse ${sp === 0 ? "⏸ pause" : `×${sp}`}`);
      // Inspecteur : agent sélectionné au clic, sinon le plus vieil herbivore.
      const watchedId = selectedId ?? snapshot.agents.find((a) => a.species === "herbivore")?.id;
      inspector.update(watchedId != null ? host.getAgentDetail(watchedId) : null);
    }
  }

  renderer.render(scene, camera);
});

export {}; // module
