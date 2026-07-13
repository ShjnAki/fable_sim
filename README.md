# Écosystème 3D — agents autonomes

Simulation d'écosystème 3D dans le navigateur : terrain procédural cel-shadé,
ressources qui repoussent, et (à venir) herbivores/carnivores autonomes en
équilibre Lotka-Volterra. Architecture complète : `docs/architecture.md`.

## Démarrer

```bash
pnpm install
pnpm dev        # client Vite (écoute sur --host pour WSL2)
pnpm test       # tests des 3 packages
pnpm typecheck
```

Contrôles : souris = orbite/zoom · ZQSD/WASD/flèches = déplacement.

## Structure

- `packages/shared` — types du protocole sim↔client, config, PRNG seedé
- `packages/sim` — logique de simulation (TS pur, zéro dépendance DOM/Three)
- `packages/client` — rendu Three.js, UI overlay, hôtes de sim

## État

Phase 2 (un herbivore vivant et inspectable) terminée côté code — suivi
détaillé dans `PROGRESS.md`.
