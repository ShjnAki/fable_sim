/** Overlay debug : lignes clé→texte, mises à jour à cadence lente (2 Hz). */
export function createOverlay(parent: HTMLElement) {
  const lines = new Map<string, string>();
  return {
    setLine(key: string, text: string): void {
      lines.set(key, text);
      parent.textContent = [...lines.values()].join("\n");
    },
  };
}
