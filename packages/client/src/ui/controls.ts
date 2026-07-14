import type { SimHost } from "@eco/shared";

/** Outil actif : inspection (défaut) ou pinceau d'ajout d'une espèce. */
export type Tool = "inspect" | "add-herbivore" | "add-carnivore" | "add-human";

/**
 * Barre de contrôle du temps (pause + vitesses) et palette de perturbation
 * (pinceaux d'ajout, sécheresse/abondance). Phase 5. Vanilla DOM, pas de lib.
 */
export function createControls(host: SimHost) {
  const timebar = document.querySelector<HTMLDivElement>("#timebar")!;
  const tools = document.querySelector<HTMLDivElement>("#tools")!;

  // --- Barre de temps ---
  const SPEEDS = [0.5, 1, 2, 4, 8];
  let currentSpeed = 1;
  let paused = false;
  const speedBtns = new Map<number, HTMLButtonElement>();

  function applySpeed(): void {
    host.setSpeed(paused ? 0 : currentSpeed);
    pauseBtn.classList.toggle("active", paused);
    pauseBtn.textContent = paused ? "▶" : "⏸";
    for (const [s, b] of speedBtns) b.classList.toggle("active", !paused && s === currentSpeed);
  }

  const pauseBtn = document.createElement("button");
  pauseBtn.onclick = () => { paused = !paused; applySpeed(); };
  timebar.appendChild(pauseBtn);
  for (const s of SPEEDS) {
    const b = document.createElement("button");
    b.textContent = `${s}×`;
    b.onclick = () => { currentSpeed = s; paused = false; applySpeed(); };
    speedBtns.set(s, b);
    timebar.appendChild(b);
  }

  // --- Palette d'outils ---
  let tool: Tool = "inspect";
  const toolBtns = new Map<Tool, HTMLButtonElement>();
  function setTool(t: Tool): void {
    tool = t;
    for (const [k, b] of toolBtns) b.classList.toggle("active", k === t);
  }
  function toolButton(t: Tool, label: string): void {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => setTool(t);
    toolBtns.set(t, b);
    tools.appendChild(b);
  }
  toolButton("inspect", "🔍 Inspecter");
  toolButton("add-herbivore", "+ Herbivore");
  toolButton("add-carnivore", "+ Carnivore");
  toolButton("add-human", "+ Humain");

  const sep = document.createElement("div");
  sep.className = "sep";
  tools.appendChild(sep);

  const drought = document.createElement("button");
  drought.textContent = "☀ Sécheresse";
  drought.onclick = () => host.applyEnvironment("drought");
  tools.appendChild(drought);
  const abundance = document.createElement("button");
  abundance.textContent = "🌿 Abondance";
  abundance.onclick = () => host.applyEnvironment("abundance");
  tools.appendChild(abundance);

  // --- Raccourcis clavier ---
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); paused = !paused; applySpeed(); }
    else if (e.code >= "Digit1" && e.code <= "Digit5") {
      currentSpeed = SPEEDS[Number(e.code.slice(5)) - 1]!;
      paused = false; applySpeed();
    }
  });

  applySpeed();
  setTool("inspect");

  return { activeTool: (): Tool => tool };
}
