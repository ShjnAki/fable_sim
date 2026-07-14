# Tuning Phase 4 — journal des itérations

## ⚠️ Bilan au 2026-07-14 (session clans + rivières)

**Cinq BUGS structurels trouvés et corrigés** (ils rendaient tout tuning vain —
c'était la vraie cause de l'effondrement des carnivores, pas les paramètres) :

1. **La moitié des carnivores spawnaient DANS L'EAU** (décalage aléatoire autour
   de tanières riveraines) : figés à vie (aucun mouvement autorisé), ils
   mouraient de soif en 120 s sans avoir jamais bougé.
2. **Agents piégés en cul-de-sac contre l'eau** : vitesse remise à zéro à chaque
   tick → immobiles jusqu'à la mort. On a vu un loup mourir de faim, figé, à
   30 m d'une proie. → glissement le long des berges + dégagement.
3. **Berges de rivière verticales** : infranchissables, les agents mouraient de
   soif au bord de l'eau. → berges en pente douce (bonus : rivières
   franchissables à gué, le pont artificiel devient inutile).
4. **Chasse en un seul temps** : le loup vidait toute sa stamina en course
   d'APPROCHE et arrivait épuisé → toutes ses chasses finissaient en « épuisé ».
   → approche au trot, sprint seulement au contact (`sprintRange`).
5. **Sprint déclenché trop tard** (20 m) alors que la proie fuit dès 8 m : le
   loup poursuivait au trot (4 m/s) une proie fuyant à 6 m/s — course perdue
   d'avance, 64 % de son temps passé en chasse sans jamais conclure.
   → `sprintRange` 45 m.

**État de l'équilibre** : les cycles Lotka-Volterra sont maintenant RÉELS et
observables (proies ↗ → prédateurs ↗ avec retard → proies ↘ → prédateurs ↘),
la coexistence tient **40 à 50 minutes** de temps simulé. Mais le creux du cycle
finit par emporter les carnivores (extinction typique vers t=2500-3000 s).
Le critère « ≥ 2 h sans extinction » n'est PAS atteint.

Mécanismes de stabilisation implémentés (aucun n'a suffi seul) : territorialité,
charognage (+ priorité charogne en faim critique), refuge du troupeau, refuge de
rareté (reproduction facilitée sous seuil critique), clans à tanières migrantes.

**Prochaine piste si Shin veut la stabilité stricte** : le mode d'échec restant
est que les prédateurs surexploitent une base de proies trop étroite. Une piste
propre serait une réponse fonctionnelle saturante explicite (les prédateurs
chassent moins quand les proies sont rares, au lieu de s'acharner) ou une
capacité de charge prédateur indépendante des proies (nombre fixe de sites de
reproduction par clan).


> Objectif : `pnpm harness hours=2` → STABLE (oscillations sans extinction ni
> explosion) sur ≥ 2 graines. Diagnostic : compteurs de morts par cause
> (`world.deaths`), affichés dans le verdict.

## Journal

| # | Levier (avant → après) | Verdict | Lecture |
|---|---|---|---|
| 0 | valeurs de départ du spec | EXTINCTION carnivore t=750s | Herbivores meurent de SOIF, pas de prédation : panique permanente (flee 20/35 m) les empêche de boire. |
| 1 | flee 20/35 → 12/20 | EXTINCTION carnivore t=1020s | Prédation monte (24) mais herbivores encore stressés. |
| 2 | killGain 0.55→0.75, huntCd 25→70 | EXTINCTION herbivore | Prédation trop efficace. |
| 3 | herbivore drink 0.15→0.35, hydDecay 1/100→1/130 | EXTINCTION carnivore | Herbivores résilients mais carnivores toujours fragiles. |
| 4-8 | démographie carnivore, sprint, perception, stamina | EXTINCTION (2 sens) | Bascule selon la graine — knife-edge. |
| 9 | reproduction carnivore très lente | EXPLOSION herbivore (1072) | Trop peu de prédateurs, proies explosent. |
| 10-11 | fécondités opposées | EXTINCTION / EXPLOSION | Toujours bistable. |
| 12 | fécondités équilibrées | STABLE **1 h** puis EXTINCTION carn. t=4740 | 1 h trompeuse : collapse en 2ᵉ heure. |
| 13 | découplage `huntCommitRadius` (mate-finding ≠ chasse) | mieux, mais bascule | Vraie cause identifiée : carnivores solitaires ne se **rencontrent pas** pour se reproduire (perception 45 m sur île 512 m). |
| 14-15 | flee 12/20 → 8/14 | proies CROISSENT sous prédation | Débloque la reproduction des proies (on ne se reproduit pas en fuyant). |
| 16-18 | balayage `huntCooldown` 55↔120, init 150/10 | EXTINCTION (2 sens), survie ~4100 s | Point de bascule vers huntCd≈85-90, mais **collapse quand même**. |

## Conclusion (état au 2026-07-14)

**Le système produit bien des oscillations Lotka-Volterra, mais elles
*divergent* vers un axe (extinction) au lieu de rester bornées.** C'est un
cycle instable classique : les amortisseurs présents (repousse logistique de
la biomasse, satiété, coût de reproduction, âge max, capacité de charge des
herbivores par l'eau) ne fournissent pas de **rétroaction densité-dépendante
sur le prédateur**. Résultat : dès que les carnivores prospèrent, ils
sur-dépassent (jusqu'à 50 individus observés), écrasent les proies, puis
s'effondrent — et le creux touche zéro.

Le meilleur régime trouvé (config verrouillée ci-dessous) tient une
**coexistence métastable ~1 h de sim** avant de basculer selon la graine.
C'est insuffisant pour le critère « ≥ 2 h sans extinction ».

### Config verrouillée (point d'étape — la moins instable)

- `initialHerbivores: 150`, `initialCarnivores: 10`
- Herbivore : flee 8/14, boost 1.5 ; repro adulte 40 s, cooldown 55 s ;
  drink 0.35, hydDecay 1/130.
- Carnivore : perception 90 (rencontre), `huntCommitRadius` 40 (chasse),
  sprint 8, stamina 1/12, killGain 0.72, huntCooldown 85, repro adulte 55 s,
  cooldown 100 s, énergie 1/350.

### Prochaine étape proposée (à arbitrer avec Shin)

Ajouter UN vrai stabilisateur densité-dépendant, deux candidats :

1. **Territorialité du prédateur** *(recommandé)* — un carnivore ne se
   reproduit pas si un congénère est à moins de R mètres. Cap la densité de
   prédateurs indépendamment de l'abondance de proies → tue le sur-dépassement
   qui provoque le collapse. ~10 lignes, cohérent avec « chasseurs
   solitaires » du design.
2. **Sécurité du troupeau** — un herbivore entouré de N congénères a une
   probabilité de survie à la morsure (effet de confusion du prédateur).
   Exploite le flocking existant, ecologiquement fondé, mais rend le kill
   probabiliste (casse un peu le déterminisme lisible — à isoler derrière le
   `world.rng`).

Sans ce stabilisateur, aucun jeu de paramètres testé (18 itérations) ne tient
2 h de façon robuste. Règle CLAUDE.md n°5 : je le signale explicitement plutôt
que de laisser croire à un équilibre atteint.

## Itération 19-20 : territorialité du prédateur (implémentée)

Ajout d'une rétroaction densité-dépendante : un carnivore ne passe pas en
`SeekMate` si plus de `territoryMax` congénères sont dans `territoryRadius`
(champ `crowded` calculé avant `decide`, comme `hasThreat`). Cap la densité
prédatrice indépendamment de l'abondance de proies.

Résultat : le mécanisme **cape bien le sur-dépassement** (plus de boom à 50
carnivores) et **allonge la coexistence** (collapse repoussé de ~1200 s à
~3300-3900 s selon la graine), MAIS :
- territoire serré (70 m / max 2) → carnivores trop clairsemés → ils
  s'éteignent (bust non résolu) ;
- territoire large (45 m / max 3) → herbivores finissent par s'éteindre.

**Conclusion : la territorialité seule cape le boom mais ne plancherise pas le
bust.** Un système robuste demande aussi un plancher sur le prédateur. Options
de design (décision à prendre avec Shin) :

1. **Charognage** — les carnivores mangent les cadavres (déjà présents via
   `deadForSeconds`) quand la chasse échoue → source d'énergie de secours qui
   planchérise leur population sans booster la prédation. Fondé, réutilise
   l'existant.
2. **Immigration rare** — un carnivore apparaît au bord toutes les N minutes
   si la population passe sous un seuil (« recolonisation »). Simple, garantit
   le non-extinction, mais moins « émergent ».
3. **Proie-refuge par le troupeau** — kill probabiliste selon la densité
   locale d'herbivores (confusion du prédateur), planchérise la proie.
4. **Accepter la coexistence métastable ~1 h** comme livrable de démonstration
   et documenter la dynamique comme « cycles amortis longs » plutôt que
   « équilibre permanent ».

## Itération 27+ : refuge du troupeau (choix de Shin) — bistabilité

Ajout de la « sécurité du troupeau » : quand un carnivore mord, la proie a une
probabilité d'échapper proportionnelle au nombre de congénères proches (effet
de confusion du prédateur, `preyRefugeRadius/PerNeighbor/MaxChance`, tirage
`world.rng` → déterminisme conservé). But : amortir l'amplitude des cycles en
protégeant les proies denses.

**Effet observé, décisif mais à double tranchant :**
- Le refuge *planchérise* bien les proies denses (les carnivores ne peuvent
  plus exterminer un troupeau serré) → sur plusieurs graines l'extinction des
  herbivores est repoussée près des 2 h (fable-1 : deux espèces vivantes à
  t=6120 s / 102 min ; fable-3 a même EXPLOSÉ à t=7110 s — trop de proies).
- MAIS le refuge est **densité-dépendant positif sous un seuil** : peu de
  proies → pas de troupeau dense → pas de protection → les prédateurs les
  achèvent. D'où une **bistabilité** : forte fécondité proie → explosion ;
  faible fécondité → extinction. Pas de milieu stable robuste sur toutes les
  graines.

**Conclusion finale (règle CLAUDE.md n°5).** Quatre stabilisateurs
densité-dépendants ont été implémentés et testés (territorialité = cap
prédateur ; charognage = plancher prédateur ; refuge du troupeau = plancher
proie ; capacité de charge eau/biomasse = plafond proie), plus ~30 itérations
de paramètres. Le résultat est un **écosystème aux dynamiques proie/prédateur
riches et une coexistence métastable longue** (jusqu'à ~2 h sur la graine par
défaut), mais **pas une stabilité permanente garantie sur toutes les graines** :
le système reste proche d'une bifurcation, avec des cycles de grande amplitude
qui peuvent tiper vers l'explosion OU l'extinction selon la graine, entre ~15
min et ~2 h. C'est le risque central du projet (architecture §13), fortement
atténué mais non éliminé par le tuning + les amortisseurs.

Pour aller plus loin (au-delà du périmètre raisonnable d'une phase) : un modèle
à réponse fonctionnelle saturante explicite (type III) ou une capacité de
charge prédateur indépendante des proies (territoire = nombre de sites de
reproduction fixes) donnerait un attracteur ponctuel stable. À rediscuter si
Shin veut la stabilité stricte plutôt que la démonstration métastable riche.

## Itération 21-26 : charognage (choix de Shin) + verrouillage intermédiaire

Ajout du charognage (état `Scavenge`) : un carnivore affamé sans proie à portée
se rabat sur le cadavre non consommé le plus proche (scan linéaire, cas rare),
gain d'énergie moindre qu'un kill (0.55 vs 0.72). Corpses prolongés à 30 s
(herbivore) pour laisser le temps d'y accéder.

**Effet mesuré, décisif :** le charognage *planchérise* la population de
prédateurs (collapse repoussé de ~3300 s à ~4900-6400 s selon la graine). Avec
la territorialité (cape le boom) ET le charognage (plancherise le bust), les
deux espèces coexistent longtemps.

**Résultat final (config verrouillée ci-dessous) :**
- 10 min de sim : STABLE (garde-fou de la suite, `stability.test.ts`).
- 20 min : STABLE, herbivores [60..325], carnivores [6..12] — **vraies
  oscillations proie/prédateur d'amplitude raisonnable**.
- Perf : 600 agents = 1,0 ms/tick (budget 3 ms tenu).

**Limite honnête (règle CLAUDE.md n°5) :** sur ≥ 2 h, l'issue reste
**seed-sensible** — le système est proche d'une bifurcation, sans attracteur
ponctuel stable ; selon la graine, un cycle de grande amplitude peut encore
tiper vers l'extinction d'une espèce entre ~1 h et ~2 h. ~26 itérations de
paramètres + 2 mécanismes structurels (territorialité, charognage) ont amené
une **coexistence métastable riche et visuellement démontrable** mais pas une
stabilité permanente garantie sur toutes les graines. Un durcissement futur
possible : proie-refuge par le troupeau (kill probabiliste selon la densité
locale d'herbivores) pour amortir l'amplitude des cycles — à décider si Shin
veut viser la stabilité stricte 2 h plutôt que la démonstration métastable.

### Config verrouillée (2026-07-14)

- `initialHerbivores: 60`, `initialCarnivores: 6`.
- Herbivore : flee 8/14 boost 1.5 ; repro adulte 40 s, cooldown 55 s,
  énergie min 0.7, coût 0.35 ; drink 0.35, hydDecay 1/130 ; corpse 30 s.
- Carnivore : perception 90 (rencontre), `huntCommitRadius` 40 (chasse),
  `territoryRadius` 55 / `territoryMax` 2 (densité-dépendance), sprint 8,
  stamina 1/12, killGain 0.72, `scavengeRadius` 110 / `scavengeEnergyGain`
  0.55, huntCooldown 85 ; repro adulte 55 s, cooldown 100 s, énergie 1/350,
  maxAge 900.
