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

Phase 4 (chaîne trophique : carnivores, prédation, chasse à l'endurance,
fuite, charognage) — mécaniques terminées ; équilibre Lotka-Volterra en
coexistence métastable. Harness de tuning : `pnpm harness`. Suivi détaillé
dans `PROGRESS.md` et `docs/tuning-phase4.md`.
