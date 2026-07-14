# Phase 4 (suite) — Rythme nocturne & survie des prédateurs : plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Sommeil groupé nocturne des herbivores (proies vulnérables la nuit →
chasse nocturne efficace), réserve d'énergie carnivore, valeur nutritive de la
proie selon l'âge + carcasse partagée. Carnivore = cône (visuel temporaire).

**Architecture:** Spec `docs/superpowers/specs/2026-07-14-phase-4-rythme-nocturne-design.md`.
Nuit et entourage écrits sur l'agent AVANT `decide` (comme `hasThreat`/`rare`) ;
`decideHerbivore` reste pure. Nouvel état `Sleep`, priorité la plus basse.

**Tech Stack:** identique. Aucune dépendance nouvelle.

## Global Constraints

- TS strict ; `sim`/`shared` sans DOM/Three ; tout tirage via `world.rng` ;
  zéro alloc dans la boucle de tick. Commits `[Phase 4] …`. Tick ≤ 3 ms.
- Déterminisme conservé (même graine → mêmes agents).

---

### Task 1 : Shared — état Sleep, paramètres, fenêtre nuit

**Files:** `packages/shared/src/protocol.ts`, `species.ts`, `config.ts`

- [ ] `protocol.ts` : `AgentState` gagne `"Sleep"` :
```ts
export type AgentState =
  "Wander" | "SeekWater" | "Drink" | "SeekFood" | "Eat"
  | "SeekMate" | "Flee" | "Hunt" | "Scavenge" | "Sleep" | "Dead";
```
- [ ] `species.ts` : `HerbivoreParams` gagne :
```ts
  sleepHerdMin: number;       // congénères mini autour pour oser dormir
  sleepHerdRadius: number;    // m
  sleepMetabolism: number;    // multiplicateur de décroissance faim/soif en dormant
  sleepWakeRadius: number;    // m — un prédateur plus proche réveille (≪ fleeTrigger)
```
et à `HERBIVORE` : `sleepHerdMin: 4, sleepHerdRadius: 10, sleepMetabolism: 0.5, sleepWakeRadius: 8,`
- [ ] `config.ts` : `WorldConfig` gagne `nightStart: number; nightEnd: number;`
  et dans `DEFAULT_WORLD_CONFIG` : `nightStart: 0.80, nightEnd: 0.22,`
  (nuit = `timeOfDay > nightStart || timeOfDay < nightEnd`).
- [ ] Vert : `pnpm typecheck` (Sleep non géré → OK, exhaustivité non requise).
  Commit `[Phase 4] État Sleep, paramètres de sommeil, fenêtre nuit`.

---

### Task 2 : Agent + World — champs nuit/entourage, drapeau nuit par tick

**Files:** `packages/sim/src/agent.ts`, `world.ts`

- [ ] `agent.ts` : `Agent` gagne (après `rare`) :
```ts
  /** Nuit + entouré : conditions de sommeil, écrites avant decide (herbivores). */
  night: boolean;
  sheltered: boolean;
```
et dans les deux factories (via `createAgent`) : `night: false, sheltered: false,`
- [ ] `world.ts` : `World` gagne `isNight: boolean;` (init `false`). Dans
  `tickWorld`, après le comptage des effectifs :
```ts
  const tod = timeOfDay(world);
  world.isNight = tod > world.config.nightStart || tod < world.config.nightEnd;
```
- [ ] Vert : `pnpm --filter @eco/sim test && pnpm typecheck`.
  Commit `[Phase 4] Champs nuit/entourage sur l'agent, drapeau isNight par tick`.

---

### Task 3 : decide — proposer Sleep et se réveiller

**Files:** `packages/sim/src/decide.ts` + test

- [ ] Test (`decide.test.ts`, nouveau describe) :
```ts
describe("decideHerbivore — sommeil groupé", () => {
  const night = () => { const a = mk(); a.night = true; a.sheltered = true;
    a.energy = 0.9; a.hydration = 0.9; a.state = "Wander"; return a; };
  it("dort la nuit, entouré et repu", () => {
    expect(decideHerbivore(night(), HERBIVORE)?.state).toBe("Sleep");
  });
  it("seul la nuit : reste vigilant (pas de sommeil)", () => {
    const a = night(); a.sheltered = false;
    expect(decideHerbivore(a, HERBIVORE)).toBeNull();
  });
  it("le jour : ne dort pas", () => {
    const a = night(); a.night = false;
    expect(decideHerbivore(a, HERBIVORE)).toBeNull();
  });
  it("une menace réveille l'endormi", () => {
    const a = night(); a.state = "Sleep"; a.hasThreat = true;
    expect(decideHerbivore(a, HERBIVORE)?.state).toBe("Flee");
  });
  it("l'aube réveille l'endormi", () => {
    const a = night(); a.state = "Sleep"; a.night = false;
    expect(decideHerbivore(a, HERBIVORE)).toEqual({ state: "Wander", cause: "réveil" });
  });
  it("un besoin réveille l'endormi", () => {
    const a = night(); a.state = "Sleep"; a.hydration = 0.3;
    expect(decideHerbivore(a, HERBIVORE)?.state).toBe("SeekWater");
  });
});
```
- [ ] Implémenter dans `decideHerbivore`. Le bloc Flee (menace) est déjà en tête
  → il réveille naturellement un endormi menacé. Ajouter, APRÈS le bloc
  `a.state === "Flee"` et AVANT la soif critique, la gestion du réveil, puis en
  toute fin (avant `return null`) la proposition de sommeil :
```ts
  // Réveil : fin de nuit, plus d'entourage, ou un besoin va se déclencher plus bas.
  if (a.state === "Sleep") {
    if (!a.night || !a.sheltered) return { state: "Wander", cause: "réveil" };
    // sinon on laisse les blocs de besoin ci-dessous interrompre le sommeil
  }
```
et à la fin du bloc `if (a.state === "Wander") { … }`, après la reproduction :
```ts
    if (a.night && a.sheltered) return { state: "Sleep", cause: "sommeil" };
```
  ATTENTION exhaustivité : quand `a.state === "Sleep"` et qu'un besoin ordinaire
  existe, les blocs `Wander`/besoins ne s'appliquent pas (ils testent `Wander`).
  Ajouter donc, dans le bloc réveil, la délégation explicite :
```ts
  if (a.state === "Sleep") {
    if (!a.night || !a.sheltered) return { state: "Wander", cause: "réveil" };
    if (a.hydration < p.seekWaterBelow) return { state: "SeekWater", cause: "soif" };
    if (a.energy < p.seekFoodBelow) return { state: "SeekFood", cause: "faim" };
    return null; // continue de dormir
  }
```
- [ ] Vert + commit `[Phase 4] decideHerbivore : sommeil groupé et réveil`.

---

### Task 4 : agentTick — perception nuit/entourage, comportement Sleep, valeur proie

**Files:** `packages/sim/src/agentTick.ts` + test (`agentTick.test.ts`)

- [ ] Tests (ajouts) :
```ts
describe("sommeil nocturne", () => {
  it("un herbivore entouré la nuit dort et bouge à peine", () => {
    const w = createWorld({ initialHerbivores: 8, initialCarnivores: 0 });
    // regrouper le troupeau la nuit
    for (const h of w.agents) { h.x = 5 * (h.id % 3); h.z = 5 * ((h.id / 3) | 0); }
    w.simTimeSeconds = 0.9 * w.config.dayLengthSeconds; // nuit
    for (let t = 0; t < 60; t++) tickWorld(w);
    expect(w.agents.some((a) => a.state === "Sleep")).toBe(true);
  });

  it("une proie adulte nourrit plus qu'un juvénile", () => {
    const w = createWorld({ initialHerbivores: 2, initialCarnivores: 1,
      carnivoreClans: 1, riverWidth: 0, waterLevel: -100 });
    const wolf = w.agents.find((a) => a.species === "carnivore")!;
    const adult = w.agents.find((a) => a.species === "herbivore")!;
    adult.ageSeconds = HERBIVORE.adultAgeSeconds * 2;
    const gainAdult = preyEnergyValue(adult);
    const juv = { ...adult, ageSeconds: 1 } as typeof adult;
    expect(gainAdult).toBeGreaterThan(preyEnergyValue(juv));
  });
});
```
  (exporter `preyEnergyValue` depuis agentTick.)

- [ ] Perception nuit/entourage (état module, comme isCrowded) :
```ts
let shelterSeeker: Agent;
let shelterCount = 0;
function countHerdShelter(n: Agent): void {
  if (n.id !== shelterSeeker.id && n.species === "herbivore" && n.state !== "Dead") shelterCount++;
}
function isSheltered(world: World, a: Agent): boolean {
  shelterSeeker = a; shelterCount = 0;
  forEachNeighbor(world.grid, a.x, a.z, HERBIVORE.sleepHerdRadius, countHerdShelter);
  return shelterCount >= HERBIVORE.sleepHerdMin;
}

/** Valeur nutritive d'une proie/charogne selon l'âge (juvénile < adulte). */
export function preyEnergyValue(prey: Agent): number {
  const frac = 0.4 + 0.6 * Math.min(1, prey.ageSeconds / paramsOf(prey).adultAgeSeconds);
  return frac;
}
```
- [ ] Dans `tickAgent`, herbivore : écrire nuit/entourage avant decide, et
  ralentir le métabolisme en dormant. Remplacer le bloc décroissance (l.214-215)
  pour tenir compte du sommeil :
```ts
  const metab = a.state === "Sleep" ? HERBIVORE.sleepMetabolism : 1;
  a.energy -= p.energyDecayPerSec * dt * metab;
  a.hydration -= p.hydrationDecayPerSec * dt * metab;
```
  et dans le bloc perception herbivore :
```ts
  if (a.species === "herbivore") {
    a.night = world.isNight;
    a.sheltered = world.isNight && isSheltered(world, a); // coûteux : seulement la nuit
    // Endormi : perception de menace réduite (réveil au ras du prédateur).
    perceiveThreat(world, a, HERBIVORE, a.state === "Sleep" ? HERBIVORE.sleepWakeRadius : undefined);
    d = decideHerbivore(a, HERBIVORE);
  } else { … }
```
  Modifier `perceiveThreat` pour accepter un rayon optionnel :
```ts
function perceiveThreat(world: World, a: Agent, p: HerbivoreParams, overrideR?: number): void {
  const r = overrideR ?? (a.hasThreat ? p.fleeSafeRadius : p.fleeTriggerRadius);
  …
}
```
- [ ] Case `Sleep` dans le switch (avant `case "Flee"`) : immobile.
```ts
    case "Sleep":
      a.vx = a.vz = 0; moving = false;
      break;
```
- [ ] Valeur de la proie à la mise à mort (case Hunt) et au charognage. Kill :
```ts
        a.energy = Math.min(1, a.energy + pc.killEnergyGain * preyEnergyValue(prey));
```
  Charognage (case Scavenge) :
```ts
        a.energy = Math.min(1, a.energy + pc.scavengeEnergyGain * preyEnergyValue(corpse));
```
- [ ] Vert : `pnpm --filter @eco/sim test && pnpm typecheck`.
  Commit `[Phase 4] Sommeil (métabolisme lent, réveil au ras), valeur proie par âge`.

---

### Task 5 : Client — carnivore cône + couleur Sleep

**Files:** `packages/client/src/render/agentsMesh.ts`

- [ ] Remplacer la géométrie carnivore par un cône (silhouette triangulaire,
  pointe vers +Z = cap). Actuellement `carnGeo = SphereGeometry(...).scale(...)` :
```ts
  const carnGeo = new THREE.ConeGeometry(0.8, 2.4, 4); // pyramide à 4 faces
  carnGeo.rotateX(Math.PI / 2);   // pointe vers +Z (cap), base à l'arrière
  carnGeo.translate(0, 0.2, 0);
```
- [ ] `STATE_COLORS` : ajouter `Sleep: 0x5c6bc0,` (indigo).
- [ ] Vert : `pnpm test && pnpm typecheck`. Vérif navigateur (un seul serveur) :
  carnivores en cônes, troupeaux indigo endormis la nuit.
  Commit `[Phase 4] Client : carnivore en cône, couleur Sleep`.

---

### Task 6 : Tuning au harness + clôture

**Files:** `packages/shared/src/species.ts` (valeurs), `PROGRESS.md`, `docs/tuning-phase4.md`

- [ ] `pnpm harness hours=1 seed=fable-1` : viser une coexistence prolongée.
  Leviers : `sleepWakeRadius`/`sleepHerdMin` (efficacité nocturne),
  décroissance d'énergie carnivore (réserve/résilience), part du tueur vs
  charognage (ratio 1:3-5). Documenter les itérations dans docs/tuning-phase4.md.
- [ ] Vérif ≥ 2 graines. Vérif perf : `pnpm --filter @eco/sim test perf`.
- [ ] PROGRESS.md : noter la feature nocturne. Commit de clôture + push.

## Self-review

- Couverture spec : Sleep §1 ✓ (T1/T3/T4), réserve carnivore §2 ✓ (T6 tuning),
  valeur proie §3 ✓ (T4), client §4 ✓ (T5). Tests spec 1-6 ✓ (T3, T4).
- Déterminisme : nuit/entourage dérivés de l'état monde ; `isSheltered` via
  grille (ordre stable) ; aucun tirage nouveau.
- Perf : `isSheltered` (requête grille) seulement la nuit et pour les herbivores.
- Simplification assumée : pas de `sleepWakeDelaySeconds` séparé (le rayon de
  réveil réduit suffit) — réintroduire au tuning si le boost nocturne est trop
  faible.
