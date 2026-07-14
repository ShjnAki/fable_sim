# PROGRESS.md — État d'avancement

> À mettre à jour à la fin de chaque phase, avant commit.
> Format : garder l'historique des phases précédentes en dessous, ne pas écraser.

---

## État actuel

**Phase en cours :** Phase 4 — Chaîne trophique
**Statut :** démarrage (brainstorm puis plan à écrire). LA phase à risque du
projet : tuning Lotka-Volterra — mitigation par harness headless accéléré.
**Dernier commit pertinent :** validation Phase 3

---

## Paramètres à tuner

Tous vivent dans `DEFAULT_WORLD_CONFIG` (`packages/shared/src/config.ts`) :

- `noiseWavelength` (180 m), `maxHeight` (36 m), `waterLevel` (5 m), `rockSlope`
  (0.7) — forme de l'île et répartition eau/herbe/roche. Valeurs par défaut non
  encore validées à l'œil.
- `biomassRegrowthRate` (0.08/s) — vitesse de verdissement visible.
- `dayLengthSeconds` (600 s) — rythme du cycle jour/nuit.
- Palette jour/nuit : keyframes dans `packages/client/src/render/dayNight.ts`.
- `HERBIVORE` (`packages/shared/src/species.ts`) — tout le comportement agent :
  décroissances faim/soif, seuils FSM (critique/déclenchement/hystérésis),
  vitesses de steering, rayon de perception, débits manger/boire ; et depuis la
  Phase 3 : poids boids (séparation/alignement/cohésion), seuils de
  reproduction (éligibilité, coût 0.35, cooldown 60 s), âge adulte 45 s, âge
  max 600 ± 120 s. **L'équilibre population/biomasse n'est PAS tuné finement —
  c'est le travail de la Phase 4 (Lotka-Volterra).**
- `initialHerbivores` (30) dans `DEFAULT_WORLD_CONFIG` ; override `?pop=N`
  côté client pour les tests de charge.

---

## Points fragiles connus

- **Getters statiques de `SimHost` synchrones** — devront devenir asynchrones au
  passage en Web Worker (Phase 3). Assumé et documenté (architecture §13).
- **`vegetation.refresh` réécrit toutes les matrices d'instances** à chaque
  rafraîchissement (~1 Hz). Négligeable aujourd'hui (~8k instances) ; passer aux
  cellules sales si ça pèse un jour.
- **Pas d'ombres portées** — choix perf assumé (architecture §9).
- **Recherche d'eau = scan linéaire de toutes les cellules de rive** à
  l'acquisition de cible (pas à chaque tick). Toujours OK à 600 agents
  (tick 0,80 ms mesuré) ; à revoir si le tick dérive.
- **SeekMate requête la grille (r = 60 m) à chaque tick par prétendant** —
  couvert par le test de charge (0,80 ms à 600 agents), à surveiller si les
  prétendants simultanés se comptent par centaines.
- **Séparation boids coupée à < 4 m du partenaire en SeekMate** (écart spec
  assumé) : sans ça, la séparation interdit le contact de reproduction.
- **makeSnapshot alloue N objets par tick** — toléré (frontière sim→rendu),
  à passer en ArrayBuffer réutilisé en Phase 6 si besoin.
- **Attrition initiale des fondateurs (~10 %)** : partis du centre sans
  mémoire d'eau, certains meurent de soif avant de trouver une rive. Assumé
  (la population récupère) — se tune via `seekWaterBelow` si gênant.
- **Couleur du corps = état FSM** — choix debug assumé, à revoir quand
  plusieurs espèces coexisteront (Phase 3/4).
- **L'agent ignore les pentes** (pas d'évitement de roche) — il peut gravir de
  la roche abrupte. Steering d'évitement en Phase 3+ si visuellement gênant.
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
- Statut : **VALIDÉE visuellement par Shin le 2026-07-13** (« l'île est belle »)
  (plan exécuté en entier :
  `docs/superpowers/plans/2026-07-13-phase-1-monde-statique.md`)
- Livré : monorepo pnpm (shared/sim/client), terrain fBm insulaire + zones,
  biomasse logistique, world/tick 20 Hz/snapshot, client Three.js toon, eau,
  caméra orbite+clavier, cycle jour/nuit, ~8k touffes instanciées, overlay
  FPS/tick/heure. 29 tests, typecheck strict, build prod OK.
- Reste : validation visuelle par Shin dans son navigateur.

### Phase 2 — Un agent qui vit
- Statut : **VALIDÉE visuellement par Shin le 2026-07-14** (« il se balade et
  suit le rythme fixé, c'est parfait »)
  (plan exécuté en entier :
  `docs/superpowers/plans/2026-07-13-phase-2-un-agent-qui-vit.md`)
- Livré : un herbivore unique vivant — besoins énergie/hydratation, FSM à
  priorités d'interruption (`decide()` pure), steering seek/arrive/wander
  zéro-alloc, recherche d'eau (cellules de rive) et d'herbe (biomasse),
  mémoire de ressources, mort de faim/soif + despawn du cadavre ; protocole
  étendu (`agents[]`, `interpolationAlpha`, `getAgentDetail`) ; rendu
  InstancedMesh (capacité 512) coloré par état, interpolé entre snapshots ;
  inspecteur temps réel (barres, mémoire, ring buffer de transitions).
  50 tests, typecheck strict OK.

### Phase 3 — Population & voisinage
- Statut : **VALIDÉE visuellement par Shin le 2026-07-14** — 60 FPS tenus à
  `?pop=600` sur son GPU (critère de sortie rempli)
  (spec : `docs/superpowers/specs/2026-07-14-phase-3-population-design.md`,
  plan exécuté en entier :
  `docs/superpowers/plans/2026-07-14-phase-3-population-voisinage.md`)
- Livré : grille spatiale uniforme (tri de comptage, `forEachNeighbor`),
  boids (3 forces en errance, séparation partout), reproduction SeekMate
  (éligibilité, appariement au plus proche, naissance par le parent au plus
  petit id, coût + cooldown), juvéniles (échelle 0.6, adultes à 45 s), mort
  de vieillesse (600 ± 120 s), 30 fondateurs adultes étalés, graphe de
  population canvas (1 Hz sim, fenêtre 10 min), `?pop=N`, overlay `agents N`.
  71 tests (dont charge : 600 agents = tick 0,80 ms), typecheck strict OK.

### Phase 4 — Chaîne trophique
- Statut : à venir

### Phase 5 — Interaction & observation
- Statut : à venir

### Phase 6 — Monde persistant serveur (Node + WebSocket + Docker/Caddy)
- Statut : à venir

### Phase 7 (bonus) — Évolution
- Statut : à venir
