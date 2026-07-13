# Architecture — Écosystème 3D avec agents autonomes (Phase 0)

> Livrable de la Phase 0. Statut : **livré pour validation** (2026-07-13).
> Toute révision ultérieure d'une décision de ce document se documente dans la
> section « Révisions » en bas de fichier — jamais par écrasement silencieux.

---

## 0. Cadrage acté (réponses de Shin, 2026-07-13)

| Question | Réponse |
|---|---|
| Cible de performance | **~1 000 agents à 60 FPS** (engagement mesurable) |
| Style visuel | **Cel-shading façon Wind Waker** : terrain lisse stylisé, paliers de lumière, couleurs saturées |
| Compatibilité navigateur | **Large** : Chrome + Firefox + Safari récents |
| Où vit la simulation | **Monde persistant côté serveur** (Node sur VPS, navigateurs spectateurs) — introduit en phase dédiée, la sim étant isomorphe dès le départ |

La conséquence architecturale majeure du dernier point : la simulation doit être
**exécutable indifféremment dans un navigateur et dans Node**, et le rendu ne doit
jamais dépendre d'un accès direct à l'état de la sim. C'est le fil rouge de tout
ce document.

---

## 1. Moteur de rendu

**Options envisagées**
- **Three.js sur WebGL2** — bibliothèque de rendu mature, énorme écosystème.
- **WebGPU natif** (ou Three.js `WebGPURenderer`) — compute shaders, débit supérieur.
- **Babylon.js** — moteur complet (scene graph riche, physique, GUI intégrés).

**Décision : Three.js, `WebGLRenderer` classique (WebGL2).**

**Justification (chiffrée)** : à 1 000 agents, le rendu n'est pas le goulot.
Un `InstancedMesh` par espèce (~5 espèces) = **moins de 10 draw calls** pour tous
les agents ; terrain ~130 k triangles en 1 draw call ; végétation instanciée en 1-2
draw calls. Total < 50 draw calls — très loin des limites de WebGL2. Le facteur
limitant est la **sim CPU**, que WebGPU compute n'aiderait qu'au-delà de ~5 000
agents. Et la compat Safari/Firefox exigée exclut WebGPU de toute façon.
Babylon.js est rejeté par la contrainte « pas de moteur clé en main » du cadrage :
Three.js est une bibliothèque de rendu, pas un framework de gameplay.

**Réversibilité** : coûteuse (tout `packages/client`), mais le découplage sim/rendu
(§2) borne le rayon d'impact au seul package client. Une migration future vers le
`WebGPURenderer` de Three.js (avec fallback WebGL) resterait dans le même écosystème.

---

## 2. Architecture d'ensemble : sim isomorphe, rendu spectateur

**Principe central : le rendu est TOUJOURS un spectateur.** Il ne lit jamais l'état
de la sim directement ; il consomme des **snapshots** (état sérialisé émis à chaque
tick) et envoie des **commandes** (perturbations, contrôle du temps). Que la sim
tourne dans le thread principal, dans un Web Worker ou sur un VPS à 800 km, le
client fait exactement la même chose.

```
                    ┌────────────────────────────────────────┐
                    │              packages/sim               │
                    │  TS pur, zéro dépendance DOM/Three      │
                    │  monde, agents, FSM, grille spatiale    │
                    └────────────────────────────────────────┘
                          ▲ commandes        │ snapshots + événements
                          │                  ▼
      ┌───────────────────────────────────────────────────────────┐
      │                interface SimHost (packages/shared)         │
      ├──────────────────┬─────────────────────┬──────────────────┤
      │ MainThreadSimHost│   WorkerSimHost     │  RemoteSimHost   │
      │ (Phase 2, debug) │   (Phase 3+)        │  (Phase 6, WS)   │
      └──────────────────┴─────────────────────┴──────────────────┘
                          ▲                  │
                          │                  ▼
                    ┌────────────────────────────────────────┐
                    │            packages/client              │
                    │  Three.js, interpolation, UI overlay    │
                    └────────────────────────────────────────┘
```

**Ce que ça achète** :
- Le mode « monde persistant serveur » est un changement d'implémentation de
  `SimHost`, pas une réécriture.
- La sim peut tourner **headless en Node, en accéléré, dans des tests** : on pourra
  simuler des heures d'écosystème en quelques secondes pour tuner l'équilibre
  Lotka-Volterra de la Phase 4 (balayages de paramètres automatisés). C'est
  l'avantage caché le plus précieux de cette architecture.
- Le contrat sim↔client (snapshots + commandes) est le seul point de couplage :
  il vit dans `packages/shared` et se teste indépendamment.

**Réversibilité** : c'est la décision la plus coûteuse à changer du projet — elle
structure tout. Elle est assumée comme fondation.

---

## 3. Monorepo & outillage

- **pnpm workspaces** (rapide, `node_modules` strict qui évite les imports
  fantômes entre packages). Réversible trivialement vers npm workspaces.
- **TypeScript strict** partout, config partagée à la racine.
- **Vite** pour `client` (dev server + build). **Vitest** pour les tests de `sim`
  (la sim étant du TS pur, elle se teste sans navigateur).
- UI overlay en **vanilla DOM/CSS** (conforme CLAUDE.md), graphes de population
  dessinés à la main sur `<canvas>`.

```
packages/
├── shared/    types du protocole (snapshots, commandes), constantes espèces,
│              PRNG seedé, format binaire des snapshots
├── sim/       toute la logique : terrain-data, agents, FSM, steering, flocking,
│              grille spatiale, boucle de tick. Zéro import DOM/Three.
├── client/    Three.js, caméra, matériaux toon, InstancedMesh, interpolation,
│              UI overlay, implémentations SimHost (main-thread, worker, remote)
└── server/    (créé en Phase 6) runtime Node headless + WebSocket + Docker
```

**Conventions** : 1 unité = 1 mètre, plan de sol XZ, Y vers le haut. Monde initial
512×512 m (paramètre).

---

## 4. Boucle de simulation

**Options envisagées** : sim à 60 Hz couplée au rendu ; tick fixe découplé + interpolation ; timestep variable.

**Décision : tick fixe à 20 Hz (50 ms), rendu 60 FPS découplé, interpolation des
positions entre les deux derniers snapshots.**

**Justification** : les comportements (faim, steering, décisions) n'ont aucun besoin
de 60 Hz — à 20 Hz un agent à 5 m/s parcourt 25 cm par tick, largement assez fin.
Ça divise le budget CPU par 3, rend le coût du tick indépendant du framerate, et
c'est **exactement le modèle qu'impose le mode réseau** (le serveur émettra des
snapshots, le client interpolera pareil) : mode local et mode serveur partagent le
même pipeline snapshot → interpolation → rendu.

- **Accélération du temps** : exécuter k ticks par intervalle réel (x1, x2, x4, x8).
  Le rendu interpole toujours les deux derniers snapshots. Plafond pratique dicté
  par le coût du tick (§11).
- **Déterminisme (honnêteté)** : PRNG seedé (mulberry32) + tick fixe ⇒ une même
  graine rejoue la même partie **sur la même machine** — suffisant pour déboguer.
  Le déterminisme inter-machines (fonctions trigonométriques non normalisées entre
  moteurs JS) n'est PAS garanti et n'est pas nécessaire : le serveur est autoritaire,
  les clients ne recalculent rien.
- **Snapshots** : positions/orientations quantifiées + espèce + état FSM + énergie
  (~16 octets/agent ⇒ ~16 Ko pour 1 000 agents), plus les événements discrets
  (naissances, morts, prédations) pour les graphes, plus les deltas de végétation.
  En local : `ArrayBuffer` transférable (coût quasi nul). En réseau : le même format
  binaire sur WebSocket.

---

## 5. Modèle de données des agents

**Options envisagées**
- **ECS externe** (bitECS, miniplex) — interdit par le cadrage sauf justification forte ; à 1 000 agents il n'y en a pas.
- **SoA maison** (Float32Array par attribut) — optimal en cache et en sérialisation, mais illisible pour du debug et prématuré à cette échelle.
- **Objets TS lisibles (AoS)** + sérialisation en snapshot binaire au moment de l'émission.

**Décision : objets TS lisibles.** Un agent = un objet avec des champs nommés
(`position`, `velocity`, `energy`, `thirst`, `age`, `fsm`, `memory`, `genes` plus
tard). La sérialisation vers le format binaire n'a lieu qu'à la frontière (snapshot).

**Justification** : à 1 000 agents, itérer sur 1 000 objets à hidden classes stables
coûte des microsecondes — la lisibilité et la débuggabilité (critères de qualité
explicites du projet) priment. La sérialisation est un point de passage obligé de
toute façon (worker + réseau), donc le « coût » de l'AoS est déjà payé.
**Règle anti-GC** : aucune allocation dans la boucle de tick (vecteurs scratch
réutilisés, pools pour naissances/morts).

**Réversibilité** : si un jour on vise 10 000+ agents, la migration vers SoA est
confinée à `packages/sim` — le contrat snapshot ne change pas.

---

## 6. Structure spatiale

**Options envisagées** : grille uniforme (spatial hash) ; quadtree/octree ; kd-tree.

**Décision : grille uniforme 2D sur le plan XZ**, taille de cellule ≈ rayon de
perception max (~10 m), reconstruite intégralement à chaque tick.

**Justification** : les agents vivent plaqués sur un terrain-hauteur — le voisinage
est fondamentalement 2D, un octree n'apporte rien. La grille c'est ~50 lignes de
code, insertion et requête O(1), et reconstruire 1 000 entrées par tick est
négligeable (pas de logique incrémentale fragile). Requêtes servies : perception
(proies/prédateurs/congénères), flocking, recherche de nourriture.
Un quadtree ne gagnerait que sur des distributions très inégales à grande échelle —
pas notre cas à 512×512 m.

**Réversibilité** : facile — la structure est derrière une interface de requête
(`queryRadius(pos, r)`) dans `packages/sim`.

---

## 7. Prise de décision des agents

**Options envisagées** : FSM ; behavior tree ; utility AI.

**Décision : FSM à priorités d'interruption** — chaque tick, une fonction évalue
les besoins dans l'ordre strict `fuir > soif critique > faim critique > boire >
manger > se reproduire > errer` et peut interrompre l'état courant.
États prévus : `Wander, SeekFood, Eat, SeekWater, Drink, Flee, SeekMate, Hunt
(carnivores), Dead`.

**Justification** : le cadrage demande précisément une **priorisation stricte des
besoins** — c'est le cas d'école de la FSM. Un behavior tree apporte de la
composabilité dont 8 états n'ont pas besoin, et diffuse la logique de décision
(plus dur de répondre à « pourquoi cet agent fait ça ? »). L'utility AI rend le
tuning opaque. **Débuggabilité intégrée** : chaque agent garde un ring buffer de
ses N dernières transitions (état, cause, tick) — c'est ce qu'affichera
l'inspecteur au clic.

**Réversibilité** : le module décision est une fonction pure `(agent, perception) →
état` isolée dans `sim` ; remplaçable par un BT si la Phase 4+ révèle un vrai besoin
(à documenter en Révisions le cas échéant).

- **Mémoire spatiale** : chaque agent retient les dernières positions connues d'eau
  et de nourriture (taille fixe, 2-3 entrées) — pas de carte mentale complète.
- **Pathfinding** : steering + évitement de pente/obstacle par échantillonnage de la
  heightmap. Pas d'A* au départ (bonus explicite du cadrage) ; le terrain lisse
  retenu (§8) rend le steering seul crédible.

---

## 8. Terrain, ressources, cycle temporel

- **Terrain** : heightmap procédurale (bruit simplex, 3-4 octaves, graine du monde),
  maillage ~256×256 déplacé. Zones dérivées de l'altitude et de la pente :
  **eau** (sous le niveau d'eau), **herbe**, **roche** (pente forte / altitude).
  Le terrain-data (hauteurs, zones) vit dans `sim` ; `client` ne fait que le mailler.
- **Eau** : plan à hauteur fixe ; les cellules de rive sont les points où boire.
- **Végétation = champ de biomasse, pas des entités.** Grille de ressources
  (~128×128 cellules) portant une biomasse 0..1 à repousse logistique. Les
  herbivores broutent la cellule sous eux. Le rendu échantillonne ce champ pour
  placer des touffes instanciées. Justification : des milliers de « plantes-agents »
  n'apporteraient rien et coûteraient cher ; un champ scalaire se régénère, se
  sérialise et se débogue trivialement (vue heatmap possible).
- **Cycle jour/nuit** : horloge de sim (le jour dure ~10 min réelles en x1,
  paramètre). Côté sim : influence les comportements (repos nocturne, chasse à
  l'aube — à affiner en Phase 4). Côté client : lumière directionnelle animée +
  teinte du ciel. Saisons : bonus non planifié.

---

## 9. Rendu & style (cel-shading Wind Waker)

- **Toon shading** : `MeshToonMaterial` + gradient map 3-4 paliers, palette saturée,
  brouillard coloré léger. Ce style tient aux paliers de lumière et à la palette,
  pas au post-processing.
- **Contours (outline)** : PAS de passe de post-processing d'arêtes au départ —
  coûteux et fragile. Si un liseré s'avère indispensable : inverted hull sur les
  seuls agents (pas le terrain). Assumé comme compromis.
- **Agents** : 1 `InstancedMesh` par espèce, modèles low-poly « chunky » construits
  en code ou en géométrie simple. Pas de skinning : animation par transformations
  (tangage/roulis en marchant, échelle qui pulse) — lisible et quasi gratuit.
  `instanceColor` disponible pour teinter par état (debug) ou par gènes (Phase 7).
- **Caméra** : orbite + déplacement libre WASD.

---

## 10. Mode serveur persistant (esquisse — décisions fines en Phase 6)

- `packages/server` : Node fait tourner **le même `packages/sim`** à 20 Hz,
  diffuse les snapshots binaires en WebSocket (lib `ws`), derrière Caddy en
  reverse proxy (TLS), le tout en Docker.
- **Bande passante** : ~16 Ko/snapshot ; diffusion à 10 Hz ⇒ ~160 Ko/s
  (~1,3 Mbit/s) par spectateur. Dix spectateurs ≈ 13 Mbit/s : trivial.
  Optimisations en réserve si besoin : deltas, culling par zone d'intérêt.
- **Dimensionnement VPS** (question de Shin, 2026-07-13) : le serveur ne rend
  RIEN en 3D — il n'exécute que la logique. 1 000 agents à 20 Hz ≈ 1-3 ms de CPU
  par tick ⇒ **5-10 % d'un cœur** en x1 ; mémoire de la sim < 50 Mo.
  **Un VPS 2 vCPU / 2-4 Go (type Hetzner CX22 / OVH Starter, ~5 €/mois) est
  surdimensionné pour ce projet**, Caddy et Docker compris. Aucun GPU requis.
- **Contrôle du temps en monde partagé** : l'accélération devient globale — elle
  sera réservée à un rôle admin (token simple) ; les perturbations publiques
  (nourrir, etc.) seront à trancher en Phase 6 (rate-limit a minima).
- **Persistance** : sauvegarde périodique de l'état complet sur disque (JSON ou
  binaire, quelques Mo) pour survivre aux redémarrages.
- L'inspection d'agent reste côté client (le snapshot contient l'essentiel ; le
  détail — mémoire, log FSM — s'obtient par une commande `inspect(id)`).

---

## 11. Budget de performance (engagement)

**Engagement : 1 000 agents, rendu 60 FPS, sim 20 Hz, sur machine de dev et un
laptop à GPU intégré comme référence basse.** Mesuré, pas déclaré : l'overlay
affiche FPS + durée du tick sim + nombre d'agents **dès la Phase 2**.

| Poste | Budget cible | Marge / commentaire |
|---|---|---|
| Tick sim (1 000 agents) | **≤ 3 ms** | permet x8 (160 ticks/s ≈ 50 % d'un cœur, dans un Worker) |
| Frame GPU | ≤ 10 ms | < 50 draw calls, ~200 k tris : très confortable |
| Snapshot (sérialisation + transfert) | ≤ 0,5 ms | ArrayBuffer transférable |
| Mémoire sim | < 50 Mo | agents + champ de biomasse + grille |

Si le budget tick est dépassé durablement, la règle CLAUDE.md s'applique : le dire
explicitement et arbitrer (réduire la cible, optimiser, ou passer SoA) — pas de
dérive silencieuse.

---

## 12. Plan de phases révisé

Le plan du prompt initial est conservé, avec une insertion : le mode serveur
(choisi au cadrage) devient la **Phase 6**, l'évolution génétique passe en
**Phase 7 (bonus)** — l'écosystème doit être équilibré AVANT de tourner h24 sans
surveillance.

| Phase | Contenu | Critère de sortie (vérifiable) |
|---|---|---|
| 0 | Ce document | Validé par Shin |
| 1 | Terrain + eau + végétation qui repousse + cycle jour/nuit + caméra libre | Balade fluide 60 FPS, overlay FPS |
| 2 | 1 herbivore : steering, faim/soif, FSM, mort | On lit son état interne en overlay ; il survit s'il y a des ressources, meurt sinon |
| 3 | N herbivores, grille spatiale, flocking, reproduction/mort | 500+ agents à 60 FPS ; graphe de population temps réel |
| 4 | Carnivores, prédation, équilibre Lotka-Volterra | Oscillations sans extinction ni explosion sur ≥ 2 h de temps simulé (vérifié en headless accéléré) |
| 5 | Contrôle du temps, inspection au clic, perturbations | Chaque outil démontrable |
| 6 | Serveur persistant : Node + WS + Docker + Caddy, rôle admin | Monde h24 sur VPS, spectateurs simultanés |
| 7 (bonus) | Génétique : héritage, mutation, dérive des traits | Graphes de dérive des traits |

---

## 13. Risques et points fragiles anticipés

1. **Le tuning de la Phase 4 est LE risque du projet** (le cadrage le dit lui-même).
   Mitigation : harness headless (§2) pour balayer les paramètres en accéléré, et
   des amortisseurs classiques prévus dès la conception (repousse logistique,
   satiété, coût de reproduction, âge max) plutôt qu'ajoutés en panique.
2. **Pauses GC** si des allocations se glissent dans la boucle de tick — règle
   anti-allocation (§5) + surveillance de la durée de tick dans l'overlay.
3. **Déterminisme partiel seulement** (§4) — assumé, documenté.
4. **Le contrat snapshot est le point de couplage unique** : toute évolution de
   format doit rester rétro-compatible ou versionnée (un octet de version en tête).
5. Dev sous WSL2, navigateur sous Windows : Vite devra écouter sur `--host` ;
   point mineur mais à ne pas oublier en Phase 1.

---

## Révisions

_(vide — toute remise en cause d'une décision ci-dessus se documente ici : date,
décision remplacée, raison.)_
