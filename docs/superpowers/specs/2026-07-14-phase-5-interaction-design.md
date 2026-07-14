# Phase 5 — Interaction & observation : design validé

> Validé par Shin le 2026-07-14. Contrôle du temps, inspection au clic,
> perturbations, + nouvelle espèce Humain (apex non-reproducteur pour l'instant ;
> omnivore + reproduction plus tard, hors périmètre).

## 1. Contrôle du temps

- Barre de contrôle (bas de l'écran) : ⏸ Pause + vitesses 0.5× / 1× / 2× / 4× / 8×.
- `SimHost.setSpeed(multiplier)` existe déjà ; pause = `setSpeed(0)`.
- Ajout `SimHost.getSpeed(): number` pour l'affichage.
- Raccourcis : Espace = pause/reprise ; touches 1-5 = presets de vitesse.
- Overlay : ligne « vitesse ×N (pause) ».

## 2. Inspection au clic

- Raycast depuis la souris vers les meshes d'agents. `agentsMesh` expose :
  `pick(raycaster): number | null` (id de l'agent touché, ou null).
  Impl : à chaque `update`, on mémorise par mesh un tableau `instanceId → agentId` ;
  `pick` teste l'intersection sur les 3 InstancedMesh (herb/carn/humain).
- Clic sur un agent → `selectedId`. L'inspecteur se fige sur lui
  (`getAgentDetail(selectedId)`, toute espèce). Clic sol vide → désélection
  (retour au suivi du plus vieil herbivore, comportement actuel).
- Surlignage : un anneau (TorusGeometry fin, émissif) suit la position interpolée
  de l'agent sélectionné. `agentsMesh` expose la position interpolée d'un id, ou
  le marqueur lit le snapshot.
- Inspecteur généralisé : afficher l'espèce (`herbivore`/`carnivore`/`humain`).

## 3. Outils de perturbation

- Palette d'outils (coin) : boutons radio de « pinceau » —
  `Ajouter herbivore` / `Ajouter carnivore` / `Ajouter humain` / `Inspecter`
  (défaut). Quand un pinceau d'ajout est actif, un clic sur le sol
  (raycast terrain) spawne l'agent à cette position.
- Boutons `Sécheresse` / `Abondance` : modulent la biomasse globale (one-shot).
  - Sécheresse : `biomass[i] *= 0.25` partout (disette immédiate).
  - Abondance : `biomass[i] = min(1, biomass[i] * 2 + 0.3)` (verdissement).
- Commandes `SimHost` :
  `spawnAgent(species, x, z): void` et `applyEnvironment("drought"|"abundance"): void`.
  Le spawn place l'agent sur terre (si le clic tombe dans l'eau, on cherche la
  cellule d'herbe la plus proche) et l'insère avec `nextAgentId`.

## 4. Nouvelle espèce — Humain (apex non-reproducteur)

- `Agent.species` : `"herbivore" | "carnivore" | "human"`. `AgentSnapshot.species`
  idem. Nouveaux états FSM : aucun (réutilise Hunt/SeekWater/Drink/Wander/Dead).
- `HumanParams` (comme `CarnivoreParams`) dans species.ts, `HUMAN` exporté.
  Chasse **les deux** espèces animales ; **n'est chassé par personne**.
- `createHuman(id, x, z, rng)` ; `paramsOf` renvoie `HUMAN`.
- `decideHuman` : soif critique > faim (Hunt) > soif ordinaire > errance.
  Pas de fuite, pas de reproduction, pas de sommeil (apex, outil manuel).
- Chasse : la recherche de proie de l'humain vise l'animal (herbivore OU
  carnivore) le plus proche. Généraliser `considerPrey` : pour un chasseur
  humain, `n.species !== "human"` (tout ce qui n'est pas humain est proie) ;
  pour un carnivore, `n.species === "herbivore"` (inchangé).
- **Fuite étendue** : les herbivores fuient aussi les humains (la perception de
  menace inclut les humains) ; les carnivores ne fuient pas (ils se font
  chasser sans réagir — simplification assumée).
- Rendu : silhouette haute et fine (bipède) — un `CylinderGeometry` élancé,
  plus grand que les carnivores. Couleur par état.
- Démographie : les humains n'apparaissent qu'au spawn manuel (aucun au
  démarrage : `initialHumans = 0`). Ils meurent de faim/soif/vieillesse.

## Tests (sim)

1. `createHuman`/`paramsOf` : espèce human, params HUMAN.
2. `decideHuman` : chasse quand il a faim ; boit quand il a soif ; pas de fuite.
3. Un humain tue un herbivore ET un carnivore proches (chasse les deux).
4. Un carnivore ne fuit pas un humain ; un herbivore fuit un humain.
5. `spawnAgent`/`applyEnvironment` (host) : ajout d'un agent, biomasse modulée.
6. Déterminisme conservé sans humains (même graine → mêmes agents).

## Client (validation navigateur, pas de tests unitaires UI)

Barre de temps fonctionnelle (pause/vitesses), clic qui sélectionne+surligne et
fige l'inspecteur, pinceaux qui spawnent, sécheresse/abondance visibles sur la
végétation, humain qui traverse l'écosystème en chassant tout.

## Hors périmètre (rappel Shin)

- Humain omnivore (mange aussi des plantes) et humain qui se reproduit : plus tard.
- Créatures marines/fantastiques : plus tard.
- Transformation en « jeu » (objectifs, UI de jeu) : bien plus tard.
- Perturbations « retirer un agent » / « fléau » : non retenues cette phase.
