# PROGRESS.md — État d'avancement

> À mettre à jour à la fin de chaque phase, avant commit.
> Format : garder l'historique des phases précédentes en dessous, ne pas écraser.

---

## État actuel

**Phase en cours :** Phase 6 — Incarnation & survie — **CODE LIVRÉ le 2026-07-14,
validation manette-en-main par Shin EN ATTENTE**

**LE PROJET EST DEVENU UN JEU.** Décision de Shin (2026-07-14) : *« Pour l'instant
ça reste une simulation. On ne voit que de la vie mais rien d'autre. »* Le plan de
phases a été refondu — voir `docs/architecture.md` § Révisions. Le serveur
persistant, qui devait être la Phase 6, **glisse en Phase 9** : on ne construit pas
de netcode autour d'un jeu dont personne n'a vérifié qu'il est bon.

**Nouveau plan :** 6 = incarnation · 7 = craft · 8 = lignée & hérédité ·
9 = serveur & multi.

**Livré en Phase 6** (spec :
`docs/superpowers/specs/2026-07-14-phase-6-incarnation-design.md`) :
tu incarnes un humain de la simulation. Caméra 3ᵉ personne, contrôle direct
(ZQSD/WASD + sprint), jauge de vitalité, meutes qui osent t'attaquer,
chasser → tuer → **dévorer la carcasse**, boire à la rive, mort et renaissance,
HUD de survie. `Tab` bascule en mode spectateur, où **tous les outils de la
Phase 5 restent intacts**.

**Santé de la base :** 139 tests verts (122 sim + 11 client + 6 shared),
typecheck strict OK, tick **1,01 ms** à 600 agents (budget 3 ms — en hausse
depuis les 0,80 ms de la Phase 3, marge encore large).

**L'équilibre de la Phase 4 est PROUVÉ intact**, pas seulement supposé : le
harness rejoué sur le commit d'avant la phase (`6388307`) rend un verdict
**identique au caractère près** — herbivores [143..326], carnivores [1..28],
mêmes compteurs de morts (729/404/200/73/43/18). Deux tests le verrouillent :
le cerf meurt toujours d'un coup net (sans perdre un point de vie), et une
graine fixe sans joueur rejoue la partie à l'identique.

**Ce qui reste à faire :** *jouer dix minutes et dire si on a peur des loups.*
C'est le seul critère de sortie de cette phase, et il n'appartient qu'à Shin.

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
- **`PLAYER` (`species.ts`, Phase 6) — L'ÉQUILIBRE DU JEU N'EST PAS TUNÉ.**
  Ce sont des valeurs de départ défendables, pas des vérités : le premier retour
  manette-en-main de Shin est *attendu* pour les corriger.
  - **L'équation de la fuite** : le loup sprinte à 12 m/s, le joueur à **11** — le
    loup gagne 1 m/s. Depuis ses 45 m de portée de sprint il lui faudrait ~45 s
    pour te toucher, mais son souffle ne dure que **25 s** : il abandonne avant.
    On ne fuit pas par la vitesse, on fuit par le souffle (**30 s** pour le
    joueur). Surpris à 10 m en revanche, on est mordu en 10 s.
  - `strikeDamageCarnivore` (0,25 → **4 coups** pour abattre un loup),
    `strikeCooldownSeconds` (0,8), `strikeRange` (2,5 m), `eatCorpsePerSec`
    (0,25), `healthRegenPerSec` (0,02) / `healthRegenDelaySeconds` (8 s).
- **Combat carnivore → humain (`CARNIVORE`)** : `humanHuntPackMin` (2),
  `humanHuntPackMinNight` (**1** — la nuit, un solitaire tente sa chance),
  `humanHuntPackRadius` (35 m), `biteDamage` (0,34 → **3 morsures tuent**),
  `biteCooldownSeconds` (1,5 → une meute de trois te dévore en ~5 s).
  **Ces valeurs ne touchent QUE le duel loup ↔ humain** : la prédation des
  herbivores est intacte.

---

## À retravailler (demandes de Shin)

- ~~Le pont central ne fait pas naturel~~ → **RÉGLÉ** : les berges de rivière
  sont maintenant en pente douce, les rivières se franchissent à gué et le pont
  artificiel a été supprimé (`bridgeWidth: 0`).
- **Équilibre Lotka-Volterra non stabilisé sur 2 h** : cycles réels et
  coexistence de 40-50 min, mais le creux emporte les carnivores. Voir
  `docs/tuning-phase4.md` pour le bilan et les pistes.

## Points fragiles connus

### Phase 6 (jeu)

- **Vitalité asymétrique — le compromis central de la phase.** Les loups ont des
  points de vie face au joueur, mais tuent toujours les cerfs d'un seul coup au
  contact. C'est incohérent « en fiction », et parfaitement délibéré : c'est le
  prix à payer pour ne pas retuner l'équilibre Lotka-Volterra de la Phase 4
  (≈30 itérations). Signalé plutôt que caché.
- **L'humain IA et le joueur ne mangent pas pareil** : l'humain IA (outil de
  perturbation Phase 5) tue et gagne son énergie dans le même geste ; le joueur
  doit dévorer la carcasse. Incohérence assumée — elle préserve la Phase 5 et
  fabrique la tension de la carcasse convoitée.
- **Frappe sans cône de visée** : elle touche la cible la plus proche dans
  2,5 m. Suffisant à cette portée ; à raffiner si ça paraît mou.
- **Sprint du joueur à 11 m/s** (~40 km/h) : irréaliste pour un humain. Choix de
  *game feel* assumé — à vitesse réelle, aucune fuite n'est possible et aucune
  chasse ne conclut.
- **Pas d'animation de personnage** (pas de skinning — architecture §9).
  L'incarnation passe par la caméra et le HUD, pas par la belle animation.
- **Tick à 1,01 ms à 600 agents** (contre 0,80 ms en Phase 3). Marge encore
  large sur le budget de 3 ms, mais la hausse est réelle et non expliquée
  finement — à surveiller. Le comptage de meute, lui, est *inactif* tant
  qu'aucun humain n'existe (`humanCount === 0`), donc le harness ne paie rien.

### Phases antérieures

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

### Phase 6 — Incarnation & survie (le projet devient un jeu)
- Statut : **CODE LIVRÉ le 2026-07-14** — validation manette-en-main par Shin en
  attente (critère de sortie : « je joue dix minutes et j'ai peur des loups »).
  (spec : `docs/superpowers/specs/2026-07-14-phase-6-incarnation-design.md`,
  plan exécuté en entier :
  `docs/superpowers/plans/2026-07-14-phase-6-incarnation.md`)
- Livré :
  - **Le joueur est un `Agent`** dont le `decide()` est remplacé par les touches.
    Le reste de la sim ignore son existence, et il traverse le **même bloc de
    mouvement** que les autres (berges, culs-de-sac, bornes) : il hérite
    gratuitement de toute la physique de terrain déjà déboguée.
  - **Lâcher les commandes (`Tab`) ne le supprime pas** : la FSM reprend la main
    et son humain continue de vivre en IA. C'est la maquette du comportement de
    déconnexion de la Phase 9, obtenue pour rien.
  - **Vitalité** (`health`) : morsure de loup = −0,34 (3 morsures tuent, cadence
    1,5 s) ; frappe du joueur = −0,25 sur un loup (4 coups à mains nues).
    Cicatrisation après 8 s sans blessure. **Uniquement dans le duel loup ↔
    humain.**
  - **La menace est démographique, pas scriptée** : un loup seul n'ose pas ; il
    lui faut 2 congénères dans 35 m — **1 seul la nuit**. Trop de loups sur l'île
    et elle devient invivable ; trop peu et les herbivores épuisent l'herbe.
  - **Chasser ≠ manger** : la frappe laisse une **carcasse** qu'il faut dévorer
    (`E`) — et une carcasse fraîche **attire les loups** (le charognage de la
    Phase 4, à 150 m). Tension entièrement émergente, pas une ligne écrite pour.
  - Caméra 3ᵉ personne (pointer lock, molette), HUD 4 jauges + alerte de traque,
    écran de mort avec bilan, renaissance.
  - **Bug de rendu latent corrigé** (présent depuis la Phase 2) : Three.js fige
    la sphère englobante d'un `InstancedMesh` au premier frame, où les compteurs
    valent 0 ; la sphère sort vide et le test de frustum se réduit à « l'origine
    du monde est-elle dans le champ ? ». Vrai en caméra libre, faux dès que le
    joueur s'en éloigne → **tous les agents disparaissaient en mode jeu**.
    Corrigé par `frustumCulled = false` (ces meshes couvrent toute l'île de
    toute façon).
  - **Bug de comptage corrigé** : un humain était compté parmi les carnivores.
- Non fait (assumé) : pas d'animation de personnage (pas de skinning —
  architecture §9) ; le joueur est la même capsule toon que l'humain IA.

### Phase 7 (bonus) — Évolution
- Statut : à venir
