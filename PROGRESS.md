# PROGRESS.md — État d'avancement

> À mettre à jour à la fin de chaque phase, avant commit.
> Format : garder l'historique des phases précédentes en dessous, ne pas écraser.

---

## État actuel

**Phase en cours :** Phase 6 — Monde persistant serveur (démarrage 2026-07-14)
**Statut :** Phases 0 à 5 **livrées et validées par Shin**. Base saine :
116 tests verts (106 sim + 10 client), typecheck strict OK, tick 0,80 ms à
600 agents.

La Phase 5 (interaction & observation) est close : contrôle du temps, inspection
au clic, outils de perturbation, espèce Humain apex — détail dans l'historique
ci-dessous.

**Cadrage Phase 6 acté avec Shin (2026-07-14) :**
- **Cible** : stack déployable **vérifiée en local** (`packages/server` Node +
  WebSocket, Dockerfile, docker-compose + Caddy, persistance disque). Le
  déploiement VPS lui-même reste à la main de Shin (procédure fournie) — je n'ai
  pas ses accès SSH.
- **Mode local conservé** : `createMainThreadHost` reste le défaut (dev rapide,
  harness de tuning intact) ; `?server=wss://…` bascule sur `RemoteSimHost`.
- **Droits** : spectateurs en **lecture seule** ; vitesse du temps ET
  perturbations réservées à l'admin (token). L'équilibre h24 est trop fragile
  pour être ouvert à tous.

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
- `initialHerbivores` (60) / `initialCarnivores` (6) dans
  `DEFAULT_WORLD_CONFIG` ; override `?pop=N` côté client (test de charge).
- `CARNIVORE` (`packages/shared/src/species.ts`) — chasse (sprint, stamina,
  killGain), charognage (scavengeRadius/Gain), territorialité
  (territoryRadius/Max), démographie. **Ce sont les leviers de l'équilibre
  Lotka-Volterra ; historique de tuning complet dans `docs/tuning-phase4.md`.**
- `harness` : `pnpm harness hours=2 seed=... [param=valeur]` — CSV + verdict
  extinction/explosion/stable, pour re-tuner l'équilibre.

---

## À retravailler (demandes de Shin)

- ~~Le pont central ne fait pas naturel~~ → **RÉGLÉ** : les berges de rivière
  sont maintenant en pente douce, les rivières se franchissent à gué et le pont
  artificiel a été supprimé (`bridgeWidth: 0`).
- **Équilibre Lotka-Volterra non stabilisé sur 2 h** : cycles réels et
  coexistence de 40-50 min, mais le creux emporte les carnivores. Voir
  `docs/tuning-phase4.md` pour le bilan et les pistes.

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
- **Équilibre Lotka-Volterra (Phase 4) : coexistence métastable, pas stabilité
  stricte 2 h garantie** — système proche d'une bifurcation, issue seed-sensible
  entre ~1 h et ~2 h. C'était le risque majeur annoncé du projet ; les
  amortisseurs (territorialité, charognage) l'ont fortement atténué sans
  l'éliminer. Re-tuner via `pnpm harness` ; durcissement possible : proie-refuge
  par le troupeau (`docs/tuning-phase4.md`).
- **Charognage = scan linéaire des cadavres** par carnivore affamé sans proie
  (pas la grille, qui exclut les morts). Rare, coût négligeable ; à indexer si
  un jour beaucoup de carnivores charognent en même temps.
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
- Statut : **mécaniques terminées le 2026-07-14, validation Shin + arbitrage
  critère 2 h en attente** (spec :
  `docs/superpowers/specs/2026-07-14-phase-4-chaine-trophique-design.md`,
  plan : `docs/superpowers/plans/2026-07-14-phase-4-chaine-trophique.md`).
- Livré : espèces `SpeciesParams`/`CarnivoreParams`, carnivores, prédation par
  poursuite à l'endurance (sprint + stamina + épuisement), fuite herbivore
  (vitesse liée à l'énergie → les faibles se font attraper), charognage,
  territorialité prédatrice, refuge du troupeau (4 amortisseurs
  densité-dépendants), harness headless (`pnpm harness`) avec verdict et
  compteurs de morts. Client : mesh carnivore distinct, couleurs
  Hunt/Flee/Scavenge, graphe à 2 courbes. 87 tests.
- **Point ouvert (honnêteté technique) :** l'équilibre tient une coexistence
  métastable démontrable (oscillations riches, jusqu'à ~2 h sur la graine par
  défaut) mais pas une stabilité stricte garantie ≥ 2 h sur toutes les graines
  — bistabilité près d'une bifurcation. ~30 itérations documentées dans
  `docs/tuning-phase4.md` ; 5ᵉ mécanisme proposé si stabilité stricte requise.

### Phase 5 — Interaction & observation
- Statut : **LIVRÉE, validée à l'œil par Shin le 2026-07-14**
  (spec : `docs/superpowers/specs/2026-07-14-phase-5-interaction-design.md`,
  plan exécuté en entier :
  `docs/superpowers/plans/2026-07-14-phase-5-interaction.md`)
- Livré :
  - **Contrôle du temps** : barre de temps (Pause, 0.5/1/2/4/8×), raccourcis
    clavier (Espace, 1-5), `SimHost.getSpeed()`.
  - **Inspection au clic** : picking par raycast sur les `InstancedMesh`
    (`agentsMesh.pick`), marqueur de sélection (anneau tournant), inspecteur
    épinglé sur l'agent choisi et multi-espèces (affiche l'espèce).
  - **Perturbations** : palette d'outils (Inspecter / +Herbivore / +Carnivore /
    +Humain au pinceau) via `SimHost.spawnAgent(species, x, z)` +
    `spawnAgentAt()` côté sim (glisse vers l'herbe si l'on clique dans l'eau) ;
    Sécheresse (×0,25) et Abondance (×2 +0,3) via `SimHost.applyEnvironment()`.
  - **Espèce Humain** : apex non-reproducteur (`HUMAN`), chasse **les deux**
    autres espèces (herbivores ET carnivores), très rapide (sprint 14 m/s),
    grande réserve d'énergie ; herbivores et carnivores le fuient.
    `initialHumans: 0` par défaut → **déterminisme des runs de tuning préservé**
    (il n'apparaît qu'au spawn manuel).
- 116 tests (106 sim + 10 client), typecheck strict OK.
- Non fait (assumé) : l'humain ne se reproduit pas et n'est pas omnivore —
  c'est un outil de perturbation vivant, pas une 3ᵉ espèce démographique.

### Phase 6 — Monde persistant serveur (Node + WebSocket + Docker/Caddy)
- Statut : **EN COURS** (démarrée le 2026-07-14) — cadrage acté, voir « État
  actuel » en haut de ce fichier.

### Phase 7 (bonus) — Évolution
- Statut : à venir
