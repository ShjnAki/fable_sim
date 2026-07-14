# Phase 4 (suite) — Rythme nocturne & survie des prédateurs : design validé

> Validé par Shin le 2026-07-14. Extension de la chaîne trophique (Phase 4)
> pour enrichir le comportement (jour/nuit) et aider les prédateurs à traverser
> les creux du cycle sans s'éteindre. Le zéro-extinction stricte 2 h n'est plus
> l'objectif ; on vise une coexistence riche et durable.

## Contexte

Le cycle jour/nuit existe déjà (`timeOfDay(world)` : 0 = minuit, 0.5 = midi).
Les carnivores s'éteignent dans les creux du cycle proie/prédateur malgré les
5 stabilisateurs déjà en place (territorialité, charognage, refuge du troupeau,
refuge de rareté, clans migrants). On ajoute un levier écologique nouveau plutôt
que de continuer le tuning : la chasse nocturne sur des proies endormies.

## 1. Sommeil groupé nocturne (nouvel état `Sleep`, herbivores)

**Déclenchement** — un herbivore passe en `Sleep` (depuis `Wander` uniquement)
si TOUTES ces conditions tiennent :
- il fait nuit : `timeOfDay < nightStart (0.78)` OU `> nightEnd`… en pratique
  `timeOfDay > 0.80 || timeOfDay < 0.22` (nuit = crépuscule→aube) ;
- il est **entouré** : ≥ `sleepHerdMin` congénères vivants dans `sleepHerdRadius` ;
- aucun besoin pressant : pas de menace, énergie ≥ `seekFoodBelow`, hydratation
  ≥ `seekWaterBelow`.
- Seul la nuit → reste en `Wander` (vigilant). C'est la règle demandée par Shin.

**Effet en dormant** :
- immobile (vx=vz=0), pas de boids ;
- métabolisme au ralenti : faim et soif décroissent × `sleepMetabolism` (0.5) ;
- perception de menace réduite au rayon `sleepWakeRadius` (≪ fleeTriggerRadius),
  + un délai avant de fuir (`sleepWakeDelaySeconds`) modélisé par le temps que
  la perception rattrape la menace → le carnivore approche à distance de sprint.

**Réveil** (retour `Wander`, priorité basse — tout besoin l'interrompt) :
- à l'aube (`timeOfDay` repasse dans la fenêtre jour) ;
- un prédateur entre dans `sleepWakeRadius` (→ `Flee`, cause « réveil : prédateur ! ») ;
- énergie < `seekFoodBelow` ou hydratation < `seekWaterBelow` (→ besoin) ;
- plus assez de congénères autour (le groupe s'est dispersé).

**FSM** : `decideHerbivore` propose `Sleep` en toute dernière priorité (après
les besoins ordinaires et la reproduction), depuis `Wander`. La perception de
nuit + entourage + menace est écrite sur l'agent AVANT `decide` (comme
`hasThreat`/`rare`) : nouveaux champs `night: boolean`, `sheltered: boolean`.
`decideHerbivore` reste pure.

## 2. Réserve d'énergie des carnivores (« 150 vs 100 »)

On garde l'énergie normalisée 0..1 (fraction d'estomac). Le « plus grand
réservoir » = décroissance plus lente → survie prolongée en disette (déjà le cas :
C ≈ 1/700 vs H 1/150). On documente l'intention et on ajuste le ratio au harness
pour que les carnivores tiennent nettement plus longtemps sans manger. Aucune
refonte des seuils (tous restent en 0..1).

## 3. Valeur nutritive de la proie (ratio ~1:3-5)

- **Selon l'âge** : `killEnergyGain` effectif = `killEnergyGain × (0.4 + 0.6 ×
  min(1, preyAge / adultAgeHerbivore))`. Un juvénile nourrit ~0.4×, un adulte
  plein. Idem pour le charognage (`scavengeEnergyGain × même fraction`, figée
  dans le cadavre à la mort → stockée sur l'agent mort).
- **Carcasse partagée** : le tueur prend une **part** (`killEnergyGain`), le
  cadavre reste charognable par d'autres carnivores (mécanique déjà en place,
  cadavres persistants 90 s) → une proie nourrit le tueur + plusieurs
  charognards. On abaisse la part du tueur si besoin pour viser 1:3-5.

## 4. Client (visuel temporaire)

- **Carnivore = cône** (silhouette triangulaire/anguleuse) au lieu de la sphère
  allongée, pointe vers +Z (cap). Repère visuel provisoire en attendant le vrai
  design. Herbivore inchangé (sphère trapue).
- Couleur d'état : ajouter `Sleep` (indigo sombre, ex 0x5c6bc0).

## Nouveaux paramètres (tous « à tuner », dans species/config)

`HerbivoreParams` : `sleepHerdMin` (4), `sleepHerdRadius` (10),
`sleepMetabolism` (0.5), `sleepWakeRadius` (8), `sleepWakeDelaySeconds` (1.5).
`WorldConfig` : fenêtre nuit `nightStart` (0.80), `nightEnd` (0.22) — ou dérivée
de `timeOfDay` en dur si plus simple.
`CarnivoreParams` : (rien de neuf structurel ; ajustements de valeurs au harness).

## Tests (Vitest, sim)

1. `decideHerbivore` : propose `Sleep` la nuit entouré et repu ; jamais seul ;
   jamais avec un besoin ou une menace.
2. Un herbivore endormi ne bouge pas et sa faim décroît plus lentement.
3. Réveil : un prédateur proche réveille l'endormi (→ `Flee`) ; l'aube réveille.
4. Chasse nocturne : un carnivore attrape une proie endormie qu'il n'aurait pas
   attrapée éveillée (elle fuit trop tard).
5. Valeur proie : tuer un adulte rapporte plus qu'un juvénile.
6. Déterminisme complet à deux espèces conservé (même graine → mêmes agents).

## Critère de succès

Coexistence prolongée (harness `hours=1` STABLE sur ≥ 2 graines, idéalement
`hours=2`), sans régression de perf (tick ≤ 3 ms à 600 agents). Observation
navigateur : troupeaux qui dorment en groupe la nuit (indigo), carnivores-cônes
qui chassent plus la nuit.

## Hors périmètre

- Sommeil des carnivores (ils restent actifs h24 — ce sont eux qu'on veut aider).
- Pénalité de vigilance diurne, cycles de fatigue : non prévus.
- Rendu spécifique du sommeil (yeux fermés, Zzz) : le changement de couleur suffit.
