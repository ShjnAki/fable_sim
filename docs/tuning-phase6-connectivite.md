# La vraie cause des extinctions : l'île était coupée en quatre

> Découverte du 2026-07-14, **en jouant** (Shin, Phase 6) : *« Ah ben en jouant on
> comprend pourquoi il y a des extinctions. Les agents ne peuvent pas traverser
> l'eau / nager. »*
>
> C'est le document le plus important du projet sur l'équilibre. Il explique
> pourquoi la Phase 4 a coûté ~30 itérations de tuning pour un résultat
> seulement métastable.

---

## Le diagnostic

Le prédicat de déplacement des agents était :

```ts
sampleHeight(...) >= config.waterLevel - 0.2   // on ne mouille pas ses pattes
```

Or les rivières en croix ont `riverDepth: 4` — **4 mètres de fond**. Aucun agent ne
pouvait donc les franchir, **nulle part**. Le script `scripts/connectivity.ts`
calcule les composantes connexes de la terre praticable :

```
Terre praticable : 115 538 m²
Composantes connexes : 9

  #6 : 32 204 m²  (27,9 %)
  #2 : 29 209 m²  (25,3 %)
  #7 : 27 572 m²  (23,9 %)
  #0 : 26 184 m²  (22,7 %)
  (+ 5 miettes)

Population initiale par composante :
  #6 (27,9 %) : 38 herbivores, 3 carnivores
  #7 (23,9 %) : 37 herbivores, 2 carnivores
  #2 (25,3 %) : 37 herbivores, 0 carnivore   ← SANCTUAIRE SANS PRÉDATEUR
  #0 (22,7 %) : 35 herbivores, 2 carnivores
```

**L'île n'était pas une île : c'étaient quatre îles.** Et le quartier #2 — un quart
du monde — n'avait aucun prédateur.

## Ce que ça produisait

- Dans le quartier sans loup, les proies se multipliaient jusqu'à **raser l'herbe
  et crever de faim en masse**. Signature dans le harness : **404 morts de faim
  contre 200 prédations** — deux fois plus de proies mouraient de faim que
  dévorées. Une chaîne trophique saine fait l'inverse.
- Dans les autres quartiers, 2 ou 3 loups étaient enfermés avec ~37 proies. Une
  population aussi maigre ne survit pas au premier creux : **carnivores [1..28]**,
  le plancher à 1 individu.
- Aucune recolonisation n'était possible : un quartier vidé restait vide.

**Tous les amortisseurs de la Phase 4** — refuge de rareté, cadavres persistants,
grande réserve d'énergie des loups, territorialité — **compensaient en réalité
cette fragmentation.** Ils traitaient le symptôme. Aucun réglage de paramètre ne
pouvait corriger une topologie cassée.

## Le correctif : nager

`scripts/swimdepth.ts` mesure la reconnexion en fonction de la profondeur
franchissable :

| Profondeur | Composantes | Surface accessible |
|---|---|---|
| 0,2 m (**avant**) | **6** | 115 538 m² |
| 1 → 3,5 m | 4 | 130–160 000 m² |
| **4 m** | **1** | 174 576 m² |
| 4,5 m | 1 | 184 253 m² |
| 5 m | 1 | **262 144 m² = le monde entier** (océan ouvert) |

La fenêtre est étroite : il faut franchir les 4 m des rivières sans ouvrir les 5 m
qui lâcheraient les agents en pleine mer. **`swimMaxDepth: 4.5`.**

Nager coûte cher, et **le coût dépend de l'espèce** (`SpeciesParams.swimSpeedFactor`) :

| Espèce | Facteur | Pourquoi |
|---|---|---|
| Herbivore | **0,62** | le cerf nage bien — l'eau est SA porte de sortie |
| Carnivore | **0,30** | le loup nage mal — s'y engager, c'est perdre la course |
| Humain | 0,45 | entre les deux |

L'eau cesse d'être un mur : elle devient un **passage lent, et un refuge pour les
proies**. Le refuge n'est pas une règle écrite (« les loups n'attrapent pas dans
l'eau ») — il émerge d'un écart de vitesse.

## Résultat immédiat (graine `fable-1`, 2 h)

| | Avant (île coupée) | Après (nage) |
|---|---|---|
| Herbivores | [143..**326**] | [140..**185**] |
| Carnivores | [**1**..28] | [**8**..36] |
| Morts par prédation | 200 | **1 644** |
| Loups morts de faim | **73** | **2** |

Les proies **ne débordent plus** (le sanctuaire a disparu), les loups **ne frôlent
plus l'extinction** et **ne meurent plus de faim** : ils suivent enfin le gibier.
La **prédation devient la première cause de mortalité**, devant la vieillesse —
c'est la signature d'une chaîne trophique qui fonctionne.

## Le travail qui reste (honnêteté)

**Les paramètres de la Phase 4 avaient été tunés pour une carte cassée.** Sur la
carte recollée, les loups atteignent toutes les proies : ils culminent à **34-37**
(contre 28 avant) et la pression de prédation est bien plus forte. Sur 4 graines
testées, **2 s'éteignent** (surexploitation des proies) : le système est passé
d'une fragilité à une autre.

Ce n'est **pas** une régression — c'est la première fois que la dynamique est
*réelle*. Mais il faut re-tuner la pression prédatrice sur la carte correcte.
Balayage en cours : `scripts/sweep.ts` (variantes × graines × 2 h, mesure d'un
**taux** de survie — un run isolé ne prouve rien sur un système chaotique).
