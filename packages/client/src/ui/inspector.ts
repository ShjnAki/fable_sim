import type { AgentDetail } from "@eco/shared";

function bar(v: number): string {
  const n = Math.round(Math.max(0, Math.min(1, v)) * 10);
  return "█".repeat(n) + "░".repeat(10 - n) + ` ${(v * 100).toFixed(0)}%`;
}

/** Panneau debug : état interne complet de l'agent suivi (architecture : débuggabilité). */
export function createInspector(parent: HTMLElement) {
  return {
    update(d: AgentDetail | null): void {
      if (!d) { parent.textContent = "aucun agent vivant"; return; }
      parent.textContent = [
        `${d.species} #${d.id} — ${d.state}`,
        `énergie     ${bar(d.energy)}`,
        `hydratation ${bar(d.hydration)}`,
        `âge ${d.ageSeconds.toFixed(0)} s   pos (${d.x.toFixed(0)}, ${d.z.toFixed(0)})`,
        `mémoire : eau ${d.memory.hasWater ? "connue" : "?"} · herbe ${d.memory.hasFood ? "connue" : "?"}`,
        `— dernières transitions —`,
        ...d.transitions.slice(-5).map((t) => `#${t.tick} ${t.from} → ${t.to} (${t.cause})`),
      ].join("\n");
    },
  };
}
