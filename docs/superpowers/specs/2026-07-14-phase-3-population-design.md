# Phase 3 — Population & voisinage : design validé

> Validé par Shin le 2026-07-14 (brainstorm session 2).
> Référence : `docs/architecture.md` §6 (grille spatiale figée), §7 (FSM, ordre
> de priorités figé), §11 (budget perf), §12 (critère de sortie Phase 3).

## Objectif

Passer de 1 à N herbivores : grille spatiale, flocking (boids), reproduction
par recherche de partenaire, mort de vieillesse, et un graphe de population
temps réel. Critère de sortie : **500+ agents à 60 FPS (tick ≤ 3 ms)** et une
dynamique de population observable depuis ~30 individus.

## Décisions de cadrage (choix de Shin)

1. **Reproduction = recherche de partenaire** (état `SeekMate`), pas de
   division solo. Deux adultes repus se rejoignent, un petit naît, les deux
   payent un coût d'énergie. Prépare la génétique (Phase 7).
2. **Flocking = boids complets en `Wander`, séparation seule partout ailleurs**
   (anti-empilement dans tous les états mobiles).
3. **Départ à ~30 herbivores** ; le critère 500+ se valide via un override de
   charge (`?pop=600` côté client), séparé de l'observation écologique.

## Composants

### 1. Grille spatiale — `packages/sim/src/spatialGrid.ts` (nouveau)

- Grille uniforme sur XZ, cellule 10 m (512 m / 10 → 52×52 cellules arrondi
  supérieur), **reconstruite intégralement à chaque tick** dans des tableaux
  préalloués — zéro allocation en régime permanent.
- API : `rebuildGrid(grid, agents)` + `forEachNeighbor(grid, x, z, r, fn)`.
  Le callback évite les allocations ; les agents morts sont exclus à la
  reconstruction. Ordre d'itération stable (cellules row-major, insertion dans
  l'ordre du tableau `agents`) → déterminisme conservé.
- Requêtes servies : boids (r ≈ 10 m ⇒ 3×3 cellules), partenaires (r =
  `perceptionRadius`). La recherche de nourriture (champ de biomasse) et d'eau
  (`shoreCells`) ne passe PAS par cette grille (inchangée, Phase 2).

### 2. Boids — `packages/sim/src/boids.ts` (nouveau)

- Trois forces pures zéro-alloc : séparation (repousse pondérée par 1/d),
  alignement (vitesse moyenne des voisins), cohésion (centre de masse).
- Rayon de voisinage boids et poids des 3 forces dans `HERBIVORE`
  (`boidsRadius`, `separationWeight`, `alignmentWeight`, `cohesionWeight`).
- Intégration dans `tickAgent` : en `Wander`, force = errance + les 3 boids ;
  dans les autres états mobiles (`SeekWater`, `SeekFood`, `SeekMate`), force =
  comportement + séparation seule. Somme bornée par `maxForce` après blend.

### 3. Reproduction — extension `decide.ts` + `agentTick.ts`

- **Éligibilité** : `ageSeconds ≥ adultAgeSeconds` ET `energy ≥ mateEnergyMin`
  ET `hydration ≥ mateHydrationMin` ET `mateCooldownSeconds` écoulé depuis la
  dernière naissance (champ `lastMateAgeSeconds` sur l'agent).
- **Priorité** (ordre figé architecture §7) : la reproduction passe APRÈS les
  besoins ordinaires — `decide()` ne propose `SeekMate` que depuis `Wander`,
  quand ni soif ni faim ordinaires. Toute soif/faim (même ordinaire)
  interrompt `SeekMate`.
- **Appariement** : en `SeekMate`, l'agent cible à chaque acquisition le
  voisin éligible le plus proche (via la grille, r = `perceptionRadius`) ;
  s'il n'y en a aucun → retour `Wander` (cause « aucun partenaire »).
  Pas de verrouillage mutuel : chacun cible indépendamment, ça converge.
- **Naissance** : quand deux agents éligibles sont à < 2 m, **celui au plus
  petit id** spawne le petit (évite la double naissance) à côté du couple.
  Les DEUX parents payent `mateEnergyCost`, démarrent leur cooldown et
  repassent en `Wander` (transition consignée, cause « naissance ») — lisible
  dans l'inspecteur.
- **Juvénile** : le nouveau-né a `energy`/`hydration` de départ standards
  (0.8) mais n'est éligible qu'adulte ; le client le rend à échelle réduite
  tant que `ageSeconds < adultAgeSeconds`. Le snapshot expose `adult: boolean`
  (calculé côté sim — le client ne connaît pas les seuils).

### 4. Vieillesse

- `maxAgeSeconds` moyen (~600 s = 1 jour sim) ± variance individuelle
  (`maxAgeVarianceSeconds`, tirée au `createHerbivore` via le rng du monde —
  déterministe). Champ `maxAgeSeconds` sur l'agent.
- Mort « vieillesse » gérée dans `tickAgent` comme faim/soif ; cadavre
  despawn inchangé.

### 5. Monde & config

- `WorldConfig.initialHerbivores` (défaut 30) ; spawn sur des cellules d'herbe
  distinctes autour du centre (réutilise `findSpawnCell` généralisé en
  `findSpawnCells(n)` — n cellules d'herbe les plus proches du centre,
  espacées d'au moins une cellule).
- Client : `?pop=600` dans l'URL → override `initialHerbivores` (test de
  charge). L'overlay affiche le nombre d'agents vivants.

### 6. Client

- `render/agentsMesh.ts` : `CAPACITY` 512 → 1024 ; échelle 0.6 pour les
  juvéniles (`adult` du snapshot) ; couleur `SeekMate` = rose (0xf06292).
- `ui/populationGraph.ts` (nouveau) : canvas vanilla ~260×80 px en bas à
  droite, échantillonne `snapshot.agents.length` 1×/s (temps sim), fenêtre
  glissante (~10 min sim), trait plein + valeur courante. Pas de lib.
- Inspecteur : suit **le plus vieux vivant** (id min vivant) — la sélection au
  clic arrive en Phase 5.

### 7. Protocole (shared)

- `AgentSnapshot` gagne `adult: boolean`. Pas d'autre changement de format ;
  `agents[]` était déjà dynamique.
- `HerbivoreParams` gagne : `boidsRadius`, `separationWeight`,
  `alignmentWeight`, `cohesionWeight`, `adultAgeSeconds`, `mateEnergyMin`,
  `mateHydrationMin`, `mateEnergyCost`, `mateCooldownSeconds`,
  `maxAgeSeconds`, `maxAgeVarianceSeconds`. Tous « à tuner » (PROGRESS.md).

## Performance

- Budget inchangé (architecture §11) : tick ≤ 3 ms à 1 000 agents, zéro
  allocation dans la boucle (buffers de voisinage réutilisés, callbacks).
- Attention au coût dominant attendu : boids = N × voisins ; à 600 agents en
  troupeaux denses, surveiller la durée de tick dans l'overlay.
- `findNearestShore` reste un scan linéaire des rives PAR ACQUISITION de cible
  (pas par tick) — point fragile déjà consigné, réévalué si le tick dépasse.

## Tests (Vitest, sim uniquement + smoke client existant)

1. Grille : équivalence avec une recherche force brute (positions aléatoires
   seedées) ; ordre d'itération stable ; agents morts exclus.
2. Boids : la séparation écarte deux agents proches ; la cohésion rapproche
   un agent isolé de son groupe ; déterminisme.
3. Reproduction : deux adultes repus proches → un agent de plus, coût payé
   par les deux, cooldown bloque la re-naissance immédiate ; un juvénile
   n'est pas éligible.
4. Vieillesse : un agent atteint son âge max → mort « vieillesse » ; variance
   déterministe (même graine → mêmes âges max).
5. Intégration : monde par défaut (30 agents), 2 000+ ticks → la population a
   crû (naissances > morts dans un monde riche) ; déterminisme two-worlds.
6. Charge (headless) : 600 agents, 200 ticks → durée moyenne de tick < 3 ms
   (test marqué lent, borne large pour éviter le flakiness CI).

## Hors périmètre (rappel)

- Carnivores, prédation, `Flee` → Phase 4.
- Sélection d'agent au clic, contrôle du temps → Phase 5.
- Génétique/héritage de traits → Phase 7 (mais `SeekMate` la prépare).
