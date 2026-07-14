# Phase 4 — Chaîne trophique : design validé

> Validé par Shin le 2026-07-14 (brainstorm session 2).
> Référence : `docs/architecture.md` §7 (ordre de priorités FSM : `fuir > soif
> critique > faim critique > boire > manger > se reproduire > errer`), §12
> (critère de sortie), §13 (LE risque du projet : le tuning).

## Objectif

Ajouter les carnivores et la prédation, et atteindre un équilibre
Lotka-Volterra : **oscillations des deux populations sans extinction ni
explosion sur ≥ 2 h de temps simulé**, vérifié par un harness headless
accéléré. C'est la phase la plus dure du projet — le code est court, le
tuning est le livrable.

## Décisions de cadrage (choix de Shin)

1. **Prédation = poursuite avec endurance** (pas de mise à mort garantie) :
   le carnivore sprinte plus vite que la proie mais se fatigue ; la proie
   fuit d'autant moins vite qu'elle est affamée → les faibles et les vieux
   se font attraper (émergence voulue).
2. **Distinction visuelle = silhouette par espèce, couleur = état FSM**
   (débuggabilité conservée). Carnivore plus grand et élancé.
3. **Harness = script Node dédié (`pnpm harness`) + test Vitest court**
   (~10 min de sim) dans la suite. Le critère 2 h se vérifie via le script.

## Composants

### 1. Espèces — `packages/shared/src/species.ts` (refonte légère)

- `SpeciesParams` : le tronc commun de l'actuel `HerbivoreParams` —
  mouvement (`maxSpeed`, `maxForce`, `perceptionRadius`), besoins
  (`energyDecayPerSec`, `hydrationDecayPerSec`, `drinkPerSec`,
  `criticalNeed`, `seekWaterBelow`, `stopDrinkAt`), reproduction
  (`adultAgeSeconds`, `mateEnergyMin`, `mateHydrationMin`, `mateEnergyCost`,
  `mateCooldownSeconds`, `mateRetrySeconds`), vieillesse (`maxAgeSeconds`,
  `maxAgeVarianceSeconds`), `corpseDespawnSeconds`.
- `HerbivoreParams extends SpeciesParams` : + manger (`seekFoodBelow`,
  `stopEatAt`, `eatEnergyPerSec`, `eatBiomassPerSec`, `minFoodBiomass`),
  boids (`boidsRadius`, 3 poids), fuite (`fleeTriggerRadius` 20 m,
  `fleeSafeRadius` 35 m — hystérésis, `fleeBoost` 1.4).
- `CarnivoreParams extends SpeciesParams` : + chasse (`huntBelow` 0.65 —
  seuil de faim qui déclenche la chasse, `sprintSpeed` 7 m/s,
  `staminaDrainPerSec` 1/6 — ~6 s de sprint, `staminaRegenPerSec` 1/20,
  `killEnergyGain` 0.55, `killDistance` 1.5 m, `huntCooldownSeconds` 25 —
  digestion après un kill, `huntRetrySeconds` 8 — après un abandon).
- `CARNIVORE` : valeurs de départ prudentes — 4 individus, base
  `maxSpeed` 3.5 (plus lent qu'un herbivore au trot, le sprint fait la
  différence), `energyDecayPerSec` 1/220, reproduction chère (coût 0.45,
  cooldown 120 s, adulte à 60 s), vieillesse 800 ± 150 s. **Toutes ces
  valeurs sont des candidates au tuning harness, pas des promesses.**
- Vitesse de fuite herbivore : `maxSpeed × fleeBoost × (0.7 + 0.3 × energy)`
  → 5.6 m/s à pleine énergie, ~3.9 m/s affamé (sprint carnivore : 7 m/s).

### 2. Agent — `packages/sim/src/agent.ts`

- `species: "herbivore" | "carnivore"` (le type existe, élargi).
- Nouveaux champs : `stamina: number` (0..1, les herbivores l'ignorent),
  `nextHuntAgeSeconds: number` (cooldown digestion/abandon),
  `hasThreat: boolean; threatX: number; threatZ: number` (perception écrite
  par tickAgent AVANT decide — decide reste pure).
- `createCarnivore(id, x, z, rng)` — même facture que `createHerbivore`
  (ordre des tirages rng figé), factorisation d'un builder commun interne.
- Nouveaux états : `AgentState` gagne `"Flee"` et `"Hunt"`.

### 3. Décision — `packages/sim/src/decide.ts`

- `decideHerbivore(a, p)` = l'actuel `decide()` + en toute première
  priorité : `hasThreat` → `Flee` (cause « prédateur ! ») ; en `Flee`,
  quand la menace disparaît (hystérésis gérée par la perception) →
  `Wander` (cause « danger écarté »).
- `decideCarnivore(a, p)` : soif critique > chasse (si
  `energy < huntBelow` ET `age ≥ nextHuntAgeSeconds`, cause « faim » ou
  « faim critique ») > fin de Drink (hystérésis) > soif ordinaire >
  reproduction (mêmes règles d'éligibilité) > errance. Un carnivore en
  `Hunt` n'est interrompu que par la soif critique.
- `isMateEligible` : inchangé, ne s'apparie qu'entre congénères (le filtre
  d'espèce est dans la recherche de partenaire, pas dans l'éligibilité).

### 4. Comportements — `packages/sim/src/agentTick.ts`

- **Perception menace (herbivores, chaque tick)** : carnivore le plus
  proche via la grille ; s'il est à < `fleeTriggerRadius` → menace ; si
  l'agent fuyait déjà, la menace ne s'éteint qu'au-delà de
  `fleeSafeRadius`. Écrit `hasThreat`/`threatX`/`threatZ`.
- **`Flee` (herbivore)** : seek dans la direction opposée à la menace, à
  la vitesse de fuite ci-dessus ; pas de boids (la panique prime), l'eau
  profonde reste infranchissable (le mur d'eau peut piéger — assumé, c'est
  une berge de chasse réaliste).
- **`Hunt` (carnivore)** : proie = herbivore vivant le plus proche
  (grille, r = perception). Aucune proie → abandon (cooldown retry,
  retour Wander « aucune proie »). Poursuite : seek à `sprintSpeed`,
  `stamina -= staminaDrainPerSec × dt` ; à 0 → abandon (« épuisé », retour
  Wander, cooldown retry). Contact < `killDistance` → la proie meurt
  (`applyTransition(proie, "Dead", "prédation")`), le carnivore gagne
  `killEnergyGain`, cooldown digestion, retour Wander (« proie tuée »).
- **Stamina** : se recharge (`staminaRegenPerSec`) dans tout état sauf Hunt.
- **Boids** : les carnivores n'ont PAS de boids (chasseurs solitaires) —
  la séparation ne s'applique qu'entre herbivores (le gather boids filtre
  par espèce). Un herbivore ne considère que ses congénères ; un carnivore
  proche est une menace, pas un voisin de troupeau.
- **SeekMate** : la recherche de partenaire filtre par espèce.
- Le reste (SeekWater/Drink, vieillesse, mort de faim/soif, despawn)
  est partagé tel quel entre espèces via `paramsOf(agent)`.

### 5. Monde — `packages/sim/src/world.ts`

- `WorldConfig.initialCarnivores` (défaut 4). Spawn : cellules d'herbe
  suivantes de `findSpawnCells` (après celles des herbivores), adultes,
  premiers essais chasse/reproduction étalés.
- `makeSnapshot` : `AgentSnapshot` gagne `species`.

### 6. Client

- `agentsMesh.ts` → un `InstancedMesh` PAR espèce : herbivore inchangé
  (capacité 1024), carnivore (capacité 256) plus grand (~×1.5) et élancé
  (scale géométrie ~(0.8, 0.8, 1.6)), museau marqué. Couleur = état,
  ajouts : `Hunt` 0xef5350 (rouge), `Flee` 0xba68c8 (violet).
- `populationGraph.ts` : deux courbes (herbivores #aed581, carnivores
  #ef9a9a), max commun, libellé `H n · C m`.
- Overlay : `herbivores N · carnivores M`.
- Inspecteur : suit le plus vieux herbivore vivant (inchangé) — le clic
  arrive en Phase 5.

### 7. Harness headless — `packages/sim/scripts/harness.ts`

- Lancement : `pnpm harness` à la racine (script npm → `pnpm --filter
  @eco/sim harness` → `vite-node scripts/harness.ts` ; vite-node arrive
  avec Vitest — si pnpm ne l'expose pas, l'ajouter en devDependency du
  package sim : même famille d'outils, pas une « vraie » dépendance
  nouvelle, à documenter dans le commit).
- Arguments (argv simples `clé=valeur`) : `hours=2` (durée),
  `sample=30` (période d'échantillonnage en s de sim), `seed=...`, et des
  overrides de config (`initialHerbivores=40`…). Les overrides de
  PARAMÈTRES d'espèce se font en éditant species.ts (les constantes sont
  des objets exportés — le harness n'a pas à les cloner pour la V1).
- Sortie : CSV sur stdout (`t,herbivores,carnivores,biomasseMoyenne`) +
  résumé final sur stderr : verdict `EXTINCTION <espèce> à t=…` /
  `EXPLOSION (pop > plafond 2000)` / `STABLE (min/max/moyenne par espèce)`.
- Performance attendue : 2 h de sim = 144 000 ticks ≈ 2-4 min réelles.

### 8. Test de stabilité court — dans la suite Vitest

- `stability.test.ts` : 10 min de sim (12 000 ticks), monde par défaut →
  les deux espèces sont encore vivantes, population herbivore dans
  [5, 2000]. Garde-fou anti-régression, PAS le critère de sortie (qui se
  vérifie au harness sur 2 h).

## Critère de sortie de la phase

Un run harness `hours=2` avec la config par défaut rend le verdict STABLE
(aucune extinction, aucune explosion), avec des oscillations visibles des
deux populations. Les valeurs finales des paramètres tunés sont commitées
dans species.ts et reportées dans PROGRESS.md.

## Tests (Vitest)

1. decide carnivore : priorités (soif critique interrompt Hunt ; faim →
   Hunt ; cooldown bloque ; reproduction seulement repu).
2. decide herbivore : Flee prime sur tout (même soif critique) ; sortie de
   Flee quand la menace s'éteint.
3. Chasse : un carnivore rattrape une proie affamée (lente) → kill, gain
   d'énergie, digestion ; il abandonne face à une proie rapide hors de
   portée quand sa stamina s'épuise (« épuisé »), et la proie survit.
4. Perception : hystérésis trigger 20 m / safe 35 m.
5. Reproduction inter-espèces impossible (un couple mixte ne produit rien).
6. Déterminisme complet à 2 espèces (même graine → mêmes agents).
7. Stabilité 10 min (cf. §8).
8. Harness : smoke test de la fonction cœur (runHeadless(minutes courtes)
   → retourne série + verdict) — la logique du harness vit dans
   `packages/sim/src/headless.ts`, testable ; le script scripts/harness.ts
   n'est qu'un parseur d'argv + boucle d'affichage.

## Hors périmètre (rappel)

- Chasse à l'aube / influence jour-nuit sur les comportements : reporté
  (architecture §8 « à affiner en Phase 4 » — YAGNI tant que l'équilibre
  de base n'est pas atteint ; à réévaluer en Phase 5+).
- Charognards, blessures, meutes : non prévus au cadrage.
- Sélection au clic, contrôle du temps : Phase 5.
- Sweep automatisé de paramètres : seulement si le tuning manuel guidé
  par le harness échoue.
