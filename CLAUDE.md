# CLAUDE.md — Écosystème 3D avec agents autonomes

> Ce fichier est la mémoire longue du projet. Toute reprise de session (nouveau compte,
> nouvelle fenêtre, nouveau jour) commence par la lecture de ce fichier + `PROGRESS.md`.

---

## Contexte projet

Projet expérimental visant à tester les capacités de Fable (Anthropic) sur une tâche
longue, hors web-app classique : simulation d'écosystème 3D avec agents IA autonomes
(proies/prédateurs, steering, flocking, dynamique de population).

Le prompt de cadrage complet est dans `docs/prompt_initial.md` (ne pas le modifier,
c'est la référence).

Développeur : Shin, solo, full-stack Rails habituellement, débutant en 3D/gamedev.
Niveau attendu : code lisible, pas d'over-engineering, commentaires aux endroits
non-triviaux (maths, algos spatiaux).

---

## Stack & conventions

- **Langage** : TypeScript strict, monorepo (workspaces npm/pnpm — voir décision Phase 0).
- **Build** : Vite.
- **Moteur 3D** : décision figée en Phase 0, voir `docs/architecture.md` — ne pas
  remettre en cause sans une raison sérieuse et documentée.
- **Style** : pas de framework CSS/JS imposé pour l'UI overlay (vanilla).
- **Commits** : atomiques, un commit = un changement logique. Message au format
  `[Phase N] description courte`.
- **Pas de moteur ECS externe lourd** sauf justification explicite dans
  `docs/architecture.md`.

---

## Règles de fonctionnement

1. **Ne jamais coder avant que la Phase 0 (architecture) soit validée et documentée.**
2. Chaque phase se termine dans un état qui **compile et tourne** visuellement.
   Pas de "je finis tout à la fin".
3. À la fin de chaque phase : mettre à jour `PROGRESS.md` (section État actuel +
   Paramètres à tuner + Points fragiles) avant de commit.
4. Si une décision d'architecture doit changer en cours de route, documenter
   **pourquoi** dans `docs/architecture.md` (section "Révisions"), ne pas juste
   écraser silencieusement.
5. Perf : la cible d'agents à 60 FPS annoncée en Phase 0 est un engagement.
   Si elle n'est plus tenable, le dire explicitement plutôt que de laisser
   dériver le FPS sans commentaire.
6. Toujours signaler les points fragiles / hacks temporaires plutôt que de les
   présenter comme définitifs.

---

## Structure du monorepo (à ajuster en Phase 0)

```
/
├── CLAUDE.md              ← ce fichier
├── PROGRESS.md            ← état d'avancement, à tenir à jour
├── docs/
│   ├── prompt_initial.md  ← prompt de cadrage original (référence figée)
│   └── architecture.md    ← décisions Phase 0 + révisions
├── packages/
│   ├── client/            ← rendu 3D, UI, boucle de jeu
│   ├── sim/                ← logique de simulation (agents, besoins, IA)
│   └── shared/             ← types partagés
└── ...
```

---

## Comment reprendre une session

En début de session (nouveau compte / nouvelle fenêtre) :

1. Lire ce fichier.
2. Lire `PROGRESS.md` → phase en cours, dernier état connu.
3. Lire `docs/architecture.md` si des décisions structurantes sont en jeu.
4. `git log --oneline -20` pour voir les derniers commits.
5. Annoncer la reprise : *"Phase N en cours, dernier point : ..."* avant de coder.

Ne jamais repartir de zéro sur une décision déjà tranchée en Phase 0 sans relire
`docs/architecture.md` d'abord.
