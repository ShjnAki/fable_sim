# Phase 5 — Interaction & observation : plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Contrôle du temps (pause/vitesses), inspection au clic (surlignage +
inspecteur épinglé), outils de perturbation (pinceau d'ajout, sécheresse/
abondance), nouvelle espèce Humain (apex non-reproducteur).

**Architecture:** Spec `docs/superpowers/specs/2026-07-14-phase-5-interaction-design.md`.
Le sim gagne `spawnAgent`/`applyEnvironment`/`getSpeed` sur `SimHost` ; l'humain
réutilise la machinerie de chasse. Le client fait le picking (raycast
InstancedMesh) et l'UI.

**Tech Stack:** identique. Aucune dépendance nouvelle.

## Global Constraints

- TS strict ; `sim`/`shared` sans DOM/Three ; tout tirage via `world.rng` ;
  zéro alloc dans la boucle de tick. Commits `[Phase 5] …`. Tick ≤ 3 ms.
- Déterminisme conservé quand aucun humain n'est spawné.

---

### Task 1 : Shared — espèce human, params HUMAN, interface SimHost, config

**Files:** `packages/shared/src/protocol.ts`, `species.ts`, `config.ts`

- [ ] `protocol.ts` : `AgentSnapshot.species` et l'union deviennent
  `"herbivore" | "carnivore" | "human"`. `SimHost` gagne :
```ts
  getSpeed(): number;
  spawnAgent(species: "herbivore" | "carnivore" | "human", x: number, z: number): void;
  applyEnvironment(kind: "drought" | "abundance"): void;
```
- [ ] `species.ts` : `HumanParams` = même forme que `CarnivoreParams` (il chasse).
  `export interface HumanParams extends SpeciesParams { … champs de chasse … }`
  et `export const HUMAN: HumanParams` — apex : `maxSpeed` élevé (5), `sprintSpeed`
  14, grande réserve (`energyDecayPerSec` 1/900), chasse efficace
  (`huntCommitRadius` 70, `sprintRange` 50, `killEnergyGain` 1, `killDistance` 2.5),
  `huntBelow` 0.85, pas de repro (valeurs mate ignorées mais présentes),
  `maxAgeSeconds` 1600. Reprendre la structure de `CARNIVORE` et adapter.
- [ ] `config.ts` : `WorldConfig.initialHumans: number` défaut `0`.
- [ ] Vert : `pnpm typecheck` (le client cassera sur l'union species → géré T4/T5 ;
  vérifier au moins shared/sim). Commit `[Phase 5] Espèce human, params HUMAN, commandes SimHost`.

---

### Task 2 : Sim — createHuman, decideHuman, chasse humaine, fuite étendue

**Files:** `packages/sim/src/agent.ts`, `decide.ts`, `agentTick.ts`, `world.ts` + tests

- [ ] `agent.ts` : `species` union élargie ; `createHuman(id,x,z,rng)` via
  `createAgent("human", HUMAN, …)` ; `paramsOf` → `human ? HUMAN : …`.
  Importer `HUMAN`.
- [ ] `decide.ts` : `decideHuman(a, p: HumanParams)` — soif critique > faim
  critique (Hunt) > fin de Drink > soif ordinaire > chasse (faim) > errance.
  Copier `decideCarnivore` en retirant la reproduction (pas de SeekMate).
- [ ] `agentTick.ts` :
  - `considerPrey` : cible selon le chasseur — `if (preySeeker.species === "human")
    { if (n.species === "human") return; } else { if (n.species !== "herbivore") return; }`
  - `considerThreat` (herbivores) : menace = carnivore OU humain :
    `if (n.species !== "carnivore" && n.species !== "human") return;`
  - dispatch dans `tickAgent` : `else if (a.species === "human") d = decideHuman(a, HUMAN)`
    (branche après carnivore) ; l'humain réutilise les cases Hunt/SeekWater/Drink/
    Wander. Les cases spécifiques (boids, sleep, flee, mate) ne le concernent pas.
  - stamina/regen : appliquer aussi aux humains (comme carnivores) hors Hunt.
- [ ] `world.ts` : `createWorld` spawne `config.initialHumans` (défaut 0, donc
  aucun) ; ajouter une fonction exportée `spawnAgentAt(world, species, x, z)` qui
  place sur terre (cellule d'herbe la plus proche si le point est dans l'eau,
  via `cellIndexAt`/zones) et insère avec `world.nextAgentId++`.
- [ ] Tests (`agent.test.ts`, `decide.test.ts`, `agentTick.test.ts`) :
  human créé ; decideHuman chasse/boit, pas de fuite ; un humain tue herbivore
  ET carnivore ; herbivore fuit un humain, carnivore ne fuit pas ; déterminisme
  sans humains inchangé.
- [ ] Vert + commit `[Phase 5] Humain : espèce apex, chasse des deux espèces, fuite étendue`.

---

### Task 3 : Host — getSpeed, spawnAgent, applyEnvironment

**Files:** `packages/client/src/hosts/mainThreadHost.ts` + smoke test

- [ ] Implémenter :
```ts
    getSpeed: () => speed,
    spawnAgent(species, x, z) { spawnAgentAt(world, species, x, z); },
    applyEnvironment(kind) {
      const v = world.biomass.values;
      for (let i = 0; i < v.length; i++) {
        if (kind === "drought") v[i] = v[i]! * 0.25;
        else v[i] = Math.min(1, v[i]! * 2 + 0.3);
      }
    },
```
  (importer `spawnAgentAt` depuis `@eco/sim`.)
- [ ] Test host (`mainThreadHost.test.ts`, nouveau) : après `spawnAgent`, un tick,
  le snapshot contient un agent de plus ; `applyEnvironment("drought")` baisse la
  biomasse moyenne. (Vitest jsdom pas nécessaire — le host est pur TS.)
- [ ] Vert + commit `[Phase 5] Host : getSpeed, spawnAgent, applyEnvironment`.

---

### Task 4 : Client render — mesh humain, picking, surlignage

**Files:** `packages/client/src/render/agentsMesh.ts`, `selectionMarker.ts` (nouveau)

- [ ] `agentsMesh.ts` : 3ᵉ InstancedMesh `human` (CylinderGeometry élancé,
  ~2.6 haut, r 0.5, capacité 64), couleur par état (ajouter `human` au dispatch
  d'espèce dans `update`). Ajouter à `STATE_COLORS` rien de neuf (états réutilisés).
- [ ] `update(prev, latest, alpha, selectedId?)` : mémoriser par mesh
  `instanceAgentId[k] = agent.id` ; si `agent.id === selectedId`, stocker sa
  position monde (`selectedPos`). Exposer :
  - `pick(raycaster): number | null` — teste les 3 meshes, retourne
    `instanceAgentId[intersect.instanceId]` du plus proche hit, sinon null.
  - `getSelectedPos(): THREE.Vector3 | null`.
- [ ] `selectionMarker.ts` : un `TorusGeometry` fin horizontal (MeshBasicMaterial
  jaune), `createSelectionMarker(scene)` → `{ update(pos: Vector3|null) }`
  (visible seulement si pos, placé au-dessus de l'agent, animation de rotation).
- [ ] Vert : `pnpm --filter @eco/client typecheck`. Commit
  `[Phase 5] Rendu : mesh humain, picking d'agent, marqueur de sélection`.

---

### Task 5 : Client UI — barre de temps, palette, gestion du clic

**Files:** `packages/client/src/ui/controls.ts` (nouveau), `main.ts`, `index.html`

- [ ] `index.html` : conteneurs `#timebar` (bas centre) et `#tools` (haut droite),
  styles cohérents avec l'overlay existant.
- [ ] `controls.ts` : `createControls(host, { onTool })` construit la barre de
  temps (Pause + 0.5/1/2/4/8×, boutons + état actif) branchée sur `host.setSpeed`,
  et la palette d'outils (radio : Inspecter/+Herbivore/+Carnivore/+Humain, +
  boutons Sécheresse/Abondance branchés sur `host.applyEnvironment`). Expose
  `activeTool()` et gère les raccourcis clavier (Espace, 1-5).
- [ ] `main.ts` :
  - instancier `controls` et `selectionMarker` ; `let selectedId: number | null`.
  - Gestion du clic canvas : raycast. Si outil = Inspecter → `pick` → `selectedId`
    (ou null si sol). Si outil = pinceau → raycast **terrain** (plan/mesh sol) →
    `host.spawnAgent(species, x, z)`. Un helper raycast terrain via le mesh de
    terrain ou un plan à y≈waterLevel.
  - passer `selectedId` à `agentsMesh.update` ; `selectionMarker.update(agentsMesh.getSelectedPos())`.
  - inspecteur : `const watched = selectedId != null ? selectedId :
    snapshot.agents.find(h)?.id` ; `inspector.update(host.getAgentDetail(watched))`.
  - overlay : ligne vitesse (`host.getSpeed()`), ligne humains si > 0.
- [ ] `inspector.ts` : afficher l'espèce (`d.species`) dans l'en-tête.
- [ ] Vérif navigateur (un seul serveur) : pause/vitesses, clic sélectionne +
  anneau, pinceaux spawnent, sécheresse/abondance, humain qui chasse tout.
  Commit `[Phase 5] UI : barre de temps, palette de perturbation, clic (inspect/spawn)`.

---

### Task 6 : Clôture

- [ ] `pnpm test && pnpm typecheck` ; perf inchangée.
- [ ] PROGRESS.md : Phase 5 livrée ; noter l'humain apex (repro/omnivore = plus tard).
  Screenshots. Commit `[Phase 5] Clôture` + push.

## Self-review

- Couverture spec : temps §1 ✓ (T3 getSpeed, T5 barre), inspection §2 ✓ (T4 pick+
  marqueur, T5 clic+inspecteur), perturbations §3 ✓ (T3 host, T5 palette), humain
  §4 ✓ (T1/T2/T4). Tests spec 1-6 ✓ (T2, T3).
- Types inter-tâches : `spawnAgentAt(world, species, x, z)` T2→T3 ;
  `HUMAN` T1→T2 ; `agentsMesh.pick/getSelectedPos` T4→T5 ; `host.getSpeed/
  spawnAgent/applyEnvironment` T1/T3→T5.
- Déterminisme : `initialHumans=0` par défaut → runs harness/tests inchangés.
- Risque : le raycast terrain pour le spawn — fallback plan horizontal à
  `waterLevel` si le mesh de terrain n'est pas simple à intersecter.
