# Phase 6 — Incarnation & survie : design

> Spec validée avec Shin le 2026-07-14. Le projet devient un jeu : voir la
> révision du plan de phases dans `docs/architecture.md` § Révisions.

---

## 1. Objectif

Le joueur **est** un humain de la simulation. Il se déplace, chasse, boit,
s'épuise, saigne et meurt dans l'écosystème vivant construit aux phases 1 à 5 —
un écosystème qui ne joue pas contre lui : il *vit*, et c'est ce qui le rend
dangereux.

**Critère de sortie (honnête, subjectif, assumé) :** *« Je joue dix minutes et
j'ai peur des loups. »* Cette phase ne cherche pas la richesse — elle cherche à
répondre à la seule question qui compte avant d'investir dans le craft (Phase 7),
la lignée (Phase 8) et le réseau (Phase 9) : **est-ce que c'est bon ?**

**Solo, local, aucun serveur.** On ne construit pas de netcode autour d'un jeu
dont personne n'a vérifié qu'il est amusant.

---

## 2. Le joueur est un `Agent` comme les autres

C'est le pivot du design, et il tombe directement de l'architecture Phase 0 :

> Le joueur est un `Agent` d'espèce `human` dont le `decide()` est remplacé par
> les touches. Le reste de la simulation ignore jusqu'à son existence.

Concrètement, dans `tickAgent()` :

```
âge → besoins → mort de faim/soif      ← partagé (inchangé)
        ↓
   a.controlled ?
     ├─ oui → intention du joueur (déplacement, frappe, interaction)
     └─ non → perception → decide() → machine à états      (inchangé)
        ↓
mouvement : cap de vitesse, glissement le long des berges,
            bornes du monde, orientation                    ← partagé (inchangé)
```

Le bloc de mouvement final de `tickAgent` (le glissement le long des rives, le
dégagement des culs-de-sac, les bornes) est **réutilisé tel quel** : le joueur
hérite gratuitement de toute la physique de terrain déjà déboguée.

**Bénéfices qui tombent sans effort :**
- Le joueur a faim, soif, vieillit et meurt comme n'importe quel agent.
- Les herbivores le fuient déjà (`considerThreat` inclut `human` depuis la Phase 5).
- Il apparaît dans l'inspecteur, dans le graphe de population, dans les snapshots.
- **Quand il lâche les commandes, la FSM reprend la main** (`controlled = false`)
  et son humain continue de vivre en IA. C'est la maquette du comportement de
  déconnexion de la Phase 9, obtenue pour rien.

---

## 3. Contrôles & caméra

**Deux modes**, bascule par `Tab` :

- **Mode jeu** — caméra 3ᵉ personne (orbite derrière l'épaule), pointer lock.
- **Mode spectateur** — la caméra libre actuelle et *tous les outils Phase 5*
  (inspection au clic, pinceaux de spawn, sécheresse/abondance, vitesse du
  temps). **Aucune régression** : le mode contemplatif construit aux phases 1-5
  reste intact.

| Entrée | Action |
|---|---|
| `ZQSD` / `WASD` | déplacement **relatif à la caméra** |
| `Shift` (maintenu) | sprint — vide l'endurance |
| Souris | orientation de la caméra (pointer lock) |
| Molette | distance de la caméra |
| Clic gauche | **frapper** (portée `strikeRange`) |
| `E` | **interagir** : boire au bord de l'eau, dévorer une carcasse à portée |
| `Tab` | basculer jeu ↔ spectateur |
| `Échap` | relâcher le pointer lock |

La conversion touches → direction monde se fait **côté client** (il a la caméra) ;
la sim ne reçoit qu'un vecteur de direction normalisé. `packages/sim` reste sans
DOM, sans Three — le contrat de la Phase 0 tient.

---

## 4. Vitalité & combat — le garde-fou de la Phase 4

La sim ne connaît pas les points de vie : la prédation tue au contact
(`killDistance`). Une morsure de loup qui tuerait le joueur net serait injouable.

**Règle non négociable (Shin, 2026-07-14) — la vitalité ne concerne QUE le duel
loup ↔ humain :**

| Interaction | Traitement |
|---|---|
| Loup → **herbivore** | **Mise à mort instantanée — INCHANGÉE (Phase 4)** |
| Loup → humain | Morsure : retire `biteDamage` de la vitalité, cooldown par loup |
| Humain → loup | Frappe : retire `strikeDamage` de la vitalité du loup |
| Humain → herbivore | Mise à mort instantanée (le cerf ne se bat pas) |

L'équilibre Lotka-Volterra tuné en Phase 4 (≈30 itérations, `docs/tuning-phase4.md`)
**ne bouge pas d'un cheveu** : le chemin loup → herbivore n'est pas touché. Un
**test de non-régression** le vérifie (§10, test 5), et un test de déterminisme
garantit qu'une graine fixe sans joueur produit exactement la même partie qu'avant.

**Vitalité** (`health`, 0..1) : portée par tous les agents, mais **lue et écrite
uniquement** sur ces deux chemins. Elle cicatrise lentement après
`healthRegenDelaySeconds` sans blessure — donc jamais pendant un combat.

**Mort par les blessures** : `health ≤ 0` → `kill(world, a, "dévoré")` (loup) ou
`"abattu"` (humain), avec la même machinerie de cadavre que le reste.

---

## 5. La menace : quand les loups osent

Aujourd'hui les carnivores **ignorent l'humain** (`considerPrey` ne cible que les
herbivores). Sans danger, pas de jeu. On le construit **sans rien scripter** :

> **Un loup seul n'ose pas.** Il faut `humanHuntPackMin` congénères dans un rayon
> de `humanHuntPackRadius` pour qu'une meute considère l'humain comme une proie.
> **La nuit, le seuil tombe** (`humanHuntPackMinNight`) : ils sont plus hardis.

La tension devient donc **démographique et émergente** :
- Peu de loups → l'île est sûre, tu chasses tranquille.
- Les loups prolifèrent (parce que tu as trop chassé leurs proies, ou que tu les
  as laissés se reproduire) → **l'île devient invivable pour toi.**
- Tu abats les loups → les herbivores explosent, épuisent l'herbe, s'effondrent →
  **tu meurs de faim de ta propre main.**

**Ton score et l'écosystème sont le même objet.** Le jeu punit le pillage sans
qu'aucune règle ne l'interdise. C'est la plus belle idée disponible ici, et elle
est gratuite : c'est la dynamique de la Phase 4, simplement rendue habitable.

**Coût perf : nul par défaut.** Le comptage de meute (une requête de grille de
plus par carnivore) n'est calculé **que si un humain existe dans le monde**
(`world.humanCount > 0`). Comme `initialHumans = 0`, les runs de harness et le
test de charge à 600 agents ne paient rien.

---

## 6. La boucle de survie

**Chasser → tuer → manger** (et non « tuer = manger ») :

1. Tu approches un herbivore. Il te fuit (déjà codé).
2. Tu sprintes, tu le rattrapes, tu frappes → **il meurt et devient une carcasse.**
   Tu ne gagnes **rien** sur le coup.
3. Tu t'accroupis sur la carcasse (`E`) → tu manges, ton énergie remonte
   progressivement (comme `Drink` remonte l'hydratation).

Cette séparation est délibérée : **la carcasse est visible par les loups**
(le charognage existe depuis la Phase 4, `scavengeRadius` = 150 m). Ta proie
fraîche attire la meute. Tu dois choisir entre finir ton repas et déguerpir —
une tension entièrement émergente, dont je n'ai pas écrit une ligne.

**Boire** : `E` au bord de l'eau (la mécanique `Drink` existe).

**L'endurance est la ressource centrale.** Le sprint la vide ; épuisé, tu es à
pied devant une meute. Une chasse ratée coûte cher.

---

## 7. Mort & renaissance

À `health ≤ 0`, ou de faim, ou de soif : écran de mort avec le bilan (temps
survécu, proies abattues, loups abattus), puis **« Renaître »** → un nouvel humain
adulte apparaît sur une cellule d'herbe éloignée des carnivores.

*Le monde, lui, ne s'est pas arrêté* : les populations ont continué d'évoluer
pendant ta partie. C'est ce qui rendra la Phase 8 (lignée) naturelle — la
renaissance deviendra alors « tu reprends la main sur un descendant ».

---

## 8. Contrat : protocole & `SimHost`

`packages/shared/src/protocol.ts` :

```ts
/** Intention du joueur pour le tick courant (envoyée à chaque frame). */
export interface PlayerIntent {
  /** Direction de déplacement en repère MONDE, normalisée (0,0 = immobile). */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  /** Impulsions : la sim les consomme (remet à false) — pas de double frappe. */
  strike: boolean;
  interact: boolean;
}

/** Tout ce dont le HUD a besoin, à chaque tick. */
export interface PlayerStatus {
  id: number;
  alive: boolean;
  energy: number;      // faim
  hydration: number;   // soif
  health: number;      // vitalité
  stamina: number;     // endurance
  survivedSeconds: number;
  preyKilled: number;
  wolvesKilled: number;
  /** Loups qui te traquent en ce moment — la jauge de tension du HUD. */
  hunters: number;
}
```

- `AgentSnapshot` gagne `health: number` — pour dessiner la vitalité d'un loup
  qu'on est en train de frapper (sans ce retour, cogner un loup ne « fait » rien).
- `TickSnapshot` gagne `player: PlayerStatus | null`.
- `SimHost` gagne :

```ts
  setPlayerIntent(intent: PlayerIntent): void;
  /** Fait naître (ou renaître) l'humain du joueur, et en prend les commandes. */
  spawnPlayer(): void;
  /**
   * Prend ou lâche les commandes de l'humain courant (`Tab`). Lâché, il n'est
   * PAS supprimé : la FSM reprend la main et il continue de vivre en IA.
   */
  setPlayerControl(controlled: boolean): void;
```

Deux commandes distinctes, sans recouvrement : `spawnPlayer()` crée un corps
(première entrée en jeu, ou renaissance après la mort) ; `setPlayerControl()` ne
fait que saisir ou lâcher le volant d'un corps existant.

**Les impulsions (`strike`, `interact`) sont consommées par la sim.** Le client
tourne à 60 FPS et la sim à 20 Hz : un clic qui ne serait pas « collant » serait
perdu (ou compté deux fois). Le client lève le drapeau, la sim le baisse.

---

## 9. Client

| Fichier | Rôle |
|---|---|
| `input/playerInput.ts` (nouveau) | clavier/souris → `PlayerIntent` (direction convertie en repère monde via la caméra) |
| `render/playerCamera.ts` (nouveau) | caméra 3ᵉ personne : orbite autour du joueur, pointer lock, molette |
| `ui/hud.ts` (nouveau) | 4 jauges (vitalité, faim, soif, endurance), invite contextuelle (« E : boire »), écran de mort |
| `main.ts` | bascule jeu/spectateur, envoi de l'intention à chaque frame |

Le joueur est rendu par l'`InstancedMesh` humain existant. Le marqueur de
sélection (Phase 5) sert de repère au sol sous le joueur.

---

## 10. Tests

**Sim** (`vitest`, aucun DOM) :

1. Un loup **seul** n'attaque pas l'humain (il ne le prend jamais pour cible).
2. Trois loups groupés **le chassent** ; la nuit, deux suffisent.
3. Une morsure **retire de la vitalité et ne tue pas** ; le loup respecte son
   cooldown de morsure.
4. Trois morsures tuent (`Dead`, cause `dévoré`).
5. **NON-RÉGRESSION PHASE 4** : loup → herbivore reste une **mise à mort
   instantanée** ; et un run à graine fixe **sans joueur** produit exactement les
   mêmes snapshots qu'avant la phase (déterminisme et équilibre préservés).
6. L'intention déplace l'agent joueur ; la FSM ne décide **pas** pour lui.
7. La frappe tue un herbivore → **cadavre, aucune énergie immédiate**.
8. Manger une carcasse remonte l'énergie ; boire à la rive remonte l'hydratation.
9. La vitalité cicatrise **après** le délai, jamais pendant les blessures.
10. `releasePlayer()` → l'humain repasse sous contrôle de la FSM.
11. Le joueur meurt de faim et de soif comme les autres agents.

**Perf** : le test de charge à 600 agents doit rester ≤ 3 ms (budget §11 de
l'architecture) — le comptage de meute est désactivé quand aucun humain n'existe.

---

## 11. Paramètres à tuner (valeurs initiales, PAS des vérités)

Un écosystème se tune ; un jeu encore plus. Ces valeurs sont des **points de
départ défendables**, à corriger à l'usage — c'est explicitement le travail de la
phase.

**`PLAYER` (nouveau bloc, `species.ts`)** — l'humain IA (`HUMAN`) garde ses
valeurs actuelles : il reste l'outil de perturbation de la Phase 5.

| Param | Valeur | Raison |
|---|---|---|
| `maxSpeed` | 5 | marche/trot |
| `sprintSpeed` | **11** | **le loup sprinte à 12 : il te rattrape.** Tu ne fuis pas par la vitesse, tu fuis par le souffle |
| `staminaDrainPerSec` | 1/30 | 30 s de sprint — **contre 25 s pour le loup** : tu peux *juste* l'épuiser |
| `staminaRegenPerSec` | 1/12 | |
| `maxHealth` | 1 | |
| `healthRegenPerSec` | 0.02 | ~50 s pour cicatriser entièrement |
| `healthRegenDelaySeconds` | 8 | pas de régénération en plein combat |
| `strikeRange` | 2.5 m | |
| `strikeCooldownSeconds` | 0.8 | |
| `strikeDamageCarnivore` | 0.25 | **4 coups à mains nues pour abattre un loup** |
| `eatCorpsePerSec` | 0.25 | ~4 s pour un bon repas |

**Combat carnivore → humain (`CARNIVORE`)**

| Param | Valeur | Raison |
|---|---|---|
| `humanHuntPackMin` | 2 | un loup seul n'ose pas t'approcher |
| `humanHuntPackMinNight` | 1 | **la nuit, même un solitaire tente sa chance** |
| `humanHuntPackRadius` | 35 m | ce qu'est « une meute » |
| `biteDamage` | 0.34 | **trois morsures et tu meurs** |
| `biteCooldownSeconds` | 1.5 | une meute de trois te dévore en ~5 s |

**L'équation de la fuite, explicitement :** un loup te gagne 1 m/s (12 contre 11).
Depuis ses 45 m de portée de sprint, il met ~45 s à te toucher — mais son souffle
ne dure que 25 s : **il abandonne avant.** Tu survis *si* tu as ton endurance et
de l'avance. Surpris à 10 m, tu es mordu en 10 s. C'est ça, la peur.

---

## 12. Compromis assumés & points fragiles

- **Vitalité asymétrique.** Les loups ont des points de vie face à toi, mais tuent
  toujours les cerfs d'un coup. C'est incohérent « en fiction », et parfaitement
  délibéré : c'est le prix à payer pour ne pas retuner l'équilibre de la Phase 4.
  Signalé plutôt que caché.
- **L'humain IA et le joueur ne mangent pas pareil.** L'humain IA de la Phase 5
  tue et gagne son énergie dans le même geste (`killEnergyGain`) ; le joueur, lui,
  tue puis doit **dévorer la carcasse**. C'est une incohérence de fiction, assumée
  pour deux raisons : le comportement Phase 5 reste intact (aucune régression sur
  l'outil de perturbation), et la séparation tuer/manger est précisément ce qui
  fabrique la tension de la carcasse convoitée (§6).
- **Frappe sans visée fine** : la frappe touche la cible la plus proche dans
  `strikeRange`, sans cône de visée. Suffisant à cette portée ; à raffiner si ça
  paraît mou.
- **Pas d'animation de personnage** (pas de skinning — architecture §9). Le joueur
  est la même capsule toon que l'humain IA. L'incarnation passe par la caméra et
  le HUD, pas par la belle animation.
- **Le sprint du joueur (11 m/s) reste irréaliste** pour un humain (~40 km/h).
  C'est un choix de *game feel* : à vitesse réelle, aucune fuite n'est possible et
  aucune chasse ne conclut. Assumé.
- **`?pop=600` + joueur** : le comptage de meute par carnivore s'active. Coût
  mesuré au test de charge ; s'il dérive, on ne le calculera que pour les loups
  affamés.

---

## 13. Hors périmètre (explicitement)

- **Craft** (arbres, épieu, feu, hutte) → **Phase 7**. À mains nues, tu ne peux
  qu'affronter un loup isolé et fuir les meutes : c'est *voulu*, c'est ce qui
  donnera du prix à l'épieu.
- **Lignée & hérédité** (reproduction humaine, traits *Rogue Legacy* : gros,
  maigre, asthmatique, myope ; dérive génétique des animaux) → **Phase 8**.
  `HUMAN` est stérile aujourd'hui (`mateEnergyMin: 2`, jamais éligible).
- **Serveur, multi, clans rivaux** → **Phase 9**.
- Pas de son, pas d'inventaire, pas de météo.
