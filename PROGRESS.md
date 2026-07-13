# PROGRESS.md — État d'avancement

> À mettre à jour à la fin de chaque phase, avant commit.
> Format : garder l'historique des phases précédentes en dessous, ne pas écraser.

---

## État actuel

**Phase en cours :** Phase 1 — Monde statique
**Statut :** plan d'implémentation rédigé (`docs/superpowers/plans/2026-07-13-phase-1-monde-statique.md`), exécution à lancer
**Dernier commit pertinent :** validation Phase 0 + plan Phase 1

---

## Paramètres à tuner

_(se remplira surtout à partir de la Phase 3/4 — taux de reproduction, coûts
énergétiques, vitesse de régénération, etc. Identifiés dès la Phase 0 : taille du
monde (512×512 m), durée du jour, taille de cellule de la grille spatiale (~10 m),
résolution de la grille de biomasse (~128×128).)_

---

## Points fragiles connus

- Le tuning de l'équilibre Lotka-Volterra (Phase 4) est le risque majeur du
  projet — mitigation prévue : harness headless de simulation accélérée
  (voir `docs/architecture.md` §13).

---

## Décisions clés (résumé rapide — détail complet dans docs/architecture.md)

- Moteur de rendu : **Three.js / WebGL2** (compat large exigée ; WebGPU inutile à 1k agents)
- Architecture : **sim isomorphe (TS pur) consommée par snapshots** via interface
  `SimHost` (main-thread → worker → serveur distant)
- Boucle : **tick fixe 20 Hz**, rendu 60 FPS découplé, interpolation entre snapshots
- Structure spatiale : **grille uniforme 2D (XZ)**, cellule ~10 m, rebuild par tick
- Modèle de décision agent : **FSM à priorités d'interruption** + ring buffer de
  transitions pour l'inspecteur
- Modèle de données agents : **objets TS lisibles** (pas d'ECS, pas de SoA), zéro
  allocation dans la boucle de tick
- Cible de performance : **1 000 agents @ 60 FPS, tick sim ≤ 3 ms** (mesuré via
  overlay dès Phase 2)
- Style visuel : **cel-shading façon Wind Waker** (MeshToonMaterial, palette
  saturée, pas de post-processing d'outline au départ)
- Monde persistant : **serveur Node sur VPS en Phase 6** (dev en mode local
  d'abord) ; VPS 2 vCPU / 2-4 Go suffisant
- Monorepo : **pnpm workspaces** — `shared` / `sim` / `client` (+ `server` en Phase 6)
- Plan de phases : 0-5 comme le prompt initial, **6 = serveur persistant**,
  **7 = évolution génétique (bonus)**

---

## Historique des phases

### Phase 0 — Décisions d'architecture
- Statut : **VALIDÉE par Shin le 2026-07-13**
- Livrable : `docs/architecture.md`
- Questions de cadrage posées et répondues (cible agents, style visuel,
  navigateurs, persistance) — réponses consignées en §0 du document.

### Phase 1 — Monde statique
- Statut : à venir

### Phase 2 — Un agent qui vit
- Statut : à venir

### Phase 3 — Population & voisinage
- Statut : à venir

### Phase 4 — Chaîne trophique
- Statut : à venir

### Phase 5 — Interaction & observation
- Statut : à venir

### Phase 6 — Monde persistant serveur (Node + WebSocket + Docker/Caddy)
- Statut : à venir

### Phase 7 (bonus) — Évolution
- Statut : à venir
