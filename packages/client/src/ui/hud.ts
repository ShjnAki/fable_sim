import type { PlayerStatus } from "@eco/shared";

const GAUGES = [
  { key: "health", label: "vitalité", color: "#e05a4f" },
  { key: "energy", label: "faim", color: "#7ec850" },
  { key: "hydration", label: "soif", color: "#4fa8e0" },
  { key: "stamina", label: "souffle", color: "#e8c65c" },
] as const;

/** HUD de survie : 4 jauges, alerte de traque, écran de mort. */
export function createHud(root: HTMLDivElement, death: HTMLDivElement, onRespawn: () => void) {
  const fills = new Map<string, HTMLElement>();
  for (const g of GAUGES) {
    const label = document.createElement("div");
    label.textContent = g.label;
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("i");
    fill.style.background = g.color;
    bar.appendChild(fill);
    root.appendChild(label);
    root.appendChild(bar);
    fills.set(g.key, fill);
  }
  const danger = document.createElement("div");
  danger.className = "danger";
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "ZQSD bouger · Maj sprint · clic frapper · E boire/dévorer · Tab spectateur";
  root.appendChild(danger);
  root.appendChild(hint);

  let wasAlive = true;

  return {
    setVisible(on: boolean): void {
      root.classList.toggle("on", on);
      if (!on) death.classList.remove("on");
    },
    update(p: PlayerStatus | null): void {
      if (!p) return;
      for (const g of GAUGES) {
        const v = Math.max(0, Math.min(1, p[g.key]));
        fills.get(g.key)!.style.width = `${v * 100}%`;
      }
      danger.textContent = p.hunters > 0
        ? `⚠ ${p.hunters} loup${p.hunters > 1 ? "s" : ""} te traque${p.hunters > 1 ? "nt" : ""} !`
        : "";

      if (!p.alive && wasAlive) {
        death.replaceChildren();
        const box = document.createElement("div");
        const title = document.createElement("div");
        title.className = "title";
        title.textContent = "Tu es mort.";
        const bilan = document.createElement("div");
        bilan.textContent = `Survécu ${Math.round(p.survivedSeconds)} s · `
          + `${p.preyKilled} proie${p.preyKilled > 1 ? "s" : ""} · `
          + `${p.wolvesKilled} loup${p.wolvesKilled > 1 ? "s" : ""} abattu${p.wolvesKilled > 1 ? "s" : ""}`;
        const btn = document.createElement("button");
        btn.textContent = "Renaître";
        btn.onclick = (): void => {
          death.classList.remove("on");
          onRespawn();
        };
        box.append(title, bilan, btn);
        death.appendChild(box);
        death.classList.add("on");
      }
      wasAlive = p.alive;
    },
  };
}
