# Tuning Phase 4 — journal des itérations

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
