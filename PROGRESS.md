# PROGRESS.md — État d'avancement

> À mettre à jour à la fin de chaque phase, avant commit.
> Format : garder l'historique des phases précédentes en dessous, ne pas écraser.

---

## État actuel

**Phase en cours :** Phase 1 — Monde statique
**Statut :** code terminé et commité ; **vérification visuelle par Shin en attente**
(checklist : balade 60 FPS, cycle jour/nuit, repousse de la végétation, overlay)
**Dernier commit pertinent :** `[Phase 1] Végétation instanciée pilotée par la biomasse`

---

## Paramètres à tuner

Tous vivent dans `DEFAULT_WORLD_CONFIG` (`packages/shared/src/config.ts`) :

- `noiseWavelength` (180 m), `maxHeight` (36 m), `waterLevel` (5 m), `rockSlope`
  (0.7) — forme de l'île et répartition eau/herbe/roche. Valeurs par défaut non
  encore validées à l'œil.
- `biomassRegrowthRate` (0.08/s) — vitesse de verdissement visible.
- `dayLengthSeconds` (600 s) — rythme du cycle jour/nuit.
- Palette jour/nuit : keyframes dans `packages/client/src/render/dayNight.ts`.

---

## Points fragiles connus

- **Getters statiques de `SimHost` synchrones** — devront devenir asynchrones au
  passage en Web Worker (Phase 3). Assumé et documenté (architecture §13).
- **`vegetation.refresh` réécrit toutes les matrices d'instances** à chaque
  rafraîchissement (~1 Hz). Négligeable aujourd'hui (~8k instances) ; passer aux
  cellules sales si ça pèse un jour.
- **Pas d'ombres portées** — choix perf assumé (architecture §9).
- Le tuning Lotka-Volterra (Phase 4) reste le risque majeur du projet —
  mitigation : harness headless accéléré (architecture §13).
- Environnement WSL2 sans navigateur : les vérifications visuelles passent par le
  navigateur Windows de Shin (Vite écoute sur `--host`).

---

## Décisions clés (résumé rapide — détail complet dans docs/architecture.md)

- Moteur de rendu : **Three.js / WebGL2** (compat large exigée ; WebGPU inutile à 1k agents)
- Architecture : **sim isomorphe (TS pur) consommée par snapshots** via interface
  `SimHost` (main-thread → worker → serveur distant)
- Boucle : **tick fixe 20 Hz**, rendu 60 FPS découplé, interpolation entre snapshots
  (interpolation effective à partir de la Phase 2 — rien ne bouge vite en Phase 1)
- Structure spatiale : **grille uniforme 2D (XZ)**, cellule ~10 m, rebuild par tick
  (arrive en Phase 3)
- Modèle de décision agent : **FSM à priorités d'interruption** + ring buffer de
  transitions pour l'inspecteur (arrive en Phase 2)
- Modèle de données agents : **objets TS lisibles** (pas d'ECS, pas de SoA), zéro
  allocation dans la boucle de tick
- Cible de performance : **1 000 agents @ 60 FPS, tick sim ≤ 3 ms** (mesuré via
  overlay — le tick Phase 1 est < 1 ms)
- Style visuel : **cel-shading façon Wind Waker** (MeshToonMaterial + gradient 4
  paliers, palette saturée, pas de post-processing d'outline)
- Monde persistant : **serveur Node sur VPS en Phase 6** ; VPS 2 vCPU / 2-4 Go suffisant
- Monorepo : **pnpm workspaces** — `shared` / `sim` / `client` (+ `server` en Phase 6)
- Plan de phases : 0-5 comme le prompt initial, **6 = serveur persistant**,
  **7 = évolution génétique (bonus)**

---

## Historique des phases

### Phase 0 — Décisions d'architecture
- Statut : **VALIDÉE par Shin le 2026-07-13**
- Livrable : `docs/architecture.md`

### Phase 1 — Monde statique
- Statut : **code terminé le 2026-07-13** (plan exécuté en entier :
  `docs/superpowers/plans/2026-07-13-phase-1-monde-statique.md`)
- Livré : monorepo pnpm (shared/sim/client), terrain fBm insulaire + zones,
  biomasse logistique, world/tick 20 Hz/snapshot, client Three.js toon, eau,
  caméra orbite+clavier, cycle jour/nuit, ~8k touffes instanciées, overlay
  FPS/tick/heure. 29 tests, typecheck strict, build prod OK.
- Reste : validation visuelle par Shin dans son navigateur.

### Phase 2 — Un agent qui vit
- Statut : à venir

### Phase 3 — Population & voisinage
- Statut : à venir

### Phase 4 — Chaîne trophique
- Statut : à venir

### Phase 5 — Interaction & observation
- Statut : à venir

### Phase 6 — Monde persistant serveur (Node + WebSocket + Docker/Caddy)
- Statut : à venir

### Phase 7 (bonus) — Évolution
- Statut : à venir
