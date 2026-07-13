# Prompt — Écosystème 3D avec agents autonomes

> Prompt de démarrage destiné à Fable (session longue / Claude Code).
> Objectif : construire une simulation d'écosystème 3D crédible avec agents IA autonomes,
> capable de tourner en continu et de rester équilibrée dans le temps.

---

## Rôle & posture attendue

Tu es l'architecte et le développeur principal de ce projet. Tu ne pars pas coder immédiatement : tu commences par **poser une architecture défendable**, puis tu construis par phases. À chaque décision technique structurante (moteur de rendu, structure spatiale, modèle d'agent), tu **exposes les options, tu tranches, et tu justifies** en 3-4 lignes. Si un choix est réversible, tu le dis ; s'il est coûteux à changer, tu le signales explicitement.

Stack de base imposée : **TypeScript**, monorepo, Vite. Le reste (moteur 3D, WebGPU vs WebGL/Three.js, ECS ou non) est **ta décision** — mais elle doit être motivée par la cible de simulation (nombre d'agents visé, cf. Phase 0).

Contraintes non négociables :
- Pas de framework de gameplay clé en main (pas de moteur ECS externe lourd type BabylonJS scene graph complet imposé) sauf si tu justifies solidement le gain.
- Le code doit rester **lisible et commenté aux endroits non triviaux** (maths, algos spatiaux, boucles de simulation). Pas d'over-engineering : je suis à l'aise mais pas expert 3D.
- Tout doit tourner dans le navigateur, déployable sur un VPS Docker + Caddy.

---

## Vision du projet

Un monde 3D vivant, observable, où des espèces coexistent sans intervention. Le joueur/observateur regarde un écosystème fonctionner : il peut se déplacer dans la scène (caméra libre), accélérer/ralentir le temps, cliquer sur un agent pour inspecter son état interne, et éventuellement perturber le système (ajouter de la nourriture, retirer une population) pour voir comment il réagit.

Le cœur du projet n'est **pas** le graphisme, c'est **l'émergence** : des comportements collectifs crédibles qui naissent de règles individuelles simples. Le succès se mesure à une seule chose — **est-ce que la simulation reste vivante et non-triviale sur la durée ?** Un écosystème qui s'effondre en 30 secondes (tout le monde meurt) ou qui explose (croissance infinie) est un échec.

---

## Ce que le projet doit contenir (cible)

### Le monde
- Terrain 3D avec relief (au moins hauteur variable + zones : eau, herbe, roche).
- Ressources qui se régénèrent (végétation qui repousse, points d'eau).
- Cycle temporel (jour/nuit a minima ; saisons en bonus) influençant le comportement.

### Les agents
Au moins **trois niveaux trophiques** : ressource (plantes) → herbivores → carnivores.

Chaque agent animal possède un **état interne** : énergie/faim, soif, âge, statut reproductif, et une petite mémoire spatiale (dernière source de nourriture/eau connue).

Comportements individuels à implémenter :
- **Steering behaviors** : seek, flee, wander, arrive, obstacle avoidance.
- **Flocking** (boids) pour les espèces grégaires : séparation, alignement, cohésion.
- **Prise de décision** : machine à états finis ou behavior tree — tu choisis, tu justifies. Priorisation des besoins (fuir un prédateur > manger > boire > se reproduire).
- **Pathfinding** sur le terrain (au moins évitement d'obstacles ; A* sur grille de navigation en bonus).

### La dynamique de population
- Reproduction avec coût énergétique, mort par faim/soif/vieillesse/prédation.
- L'objectif est un **équilibre dynamique** de type Lotka-Volterra (oscillations proies/prédateurs), pas un état stable plat.
- **Bonus fort** : héritage génétique. Les descendants héritent (avec mutation) de traits — vitesse, vision, métabolisme — et la sélection naturelle fait dériver les populations dans le temps.

### La performance (c'est ici que ça se joue)
- Structure spatiale pour les requêtes de voisinage (spatial hashing / grid / octree). Une boucle O(n²) naïve est disqualifiante au-delà de quelques dizaines d'agents.
- Rendu instancié pour les agents (instanced meshes).
- Si tu vises >quelques milliers d'agents : envisager le calcul sur GPU (compute shaders WebGPU). C'est un axe majeur de ta décision Phase 0.
- Cible affichée : indique dès le départ combien d'agents tu veux tenir à 60 FPS, et tiens cet engagement.

---

## Découpage en phases (tâche longue)

Tu avances phase par phase. À la fin de chaque phase : ça doit **compiler, tourner, et être visuellement vérifiable**. Pas de "grand bang" à la fin.

**Phase 0 — Décisions d'architecture** (livrable : un `.md`)
Choix du moteur de rendu + justification chiffrée (WebGPU vs Three.js selon la cible d'agents). Structure du monorepo. Modèle de données des agents. Boucle de simulation (fixed timestep ? découplage sim/rendu ?). Structure spatiale retenue. Rien de codé encore — juste l'ossature défendue.

**Phase 1 — Monde statique**
Terrain 3D, caméra libre, cycle jour/nuit, ressources qui repoussent. Aucun agent. On doit pouvoir se balader et voir un monde crédible.

**Phase 2 — Un agent qui vit**
Une seule espèce d'herbivore. Steering + besoins (faim/soif) + FSM. Il cherche à manger, boit, meurt s'il ne trouve rien. Debug overlay pour voir son état interne.

**Phase 3 — Population & voisinage**
Passage à N herbivores. Structure spatiale. Flocking. Reproduction/mort. On observe une première dynamique de population (avec un graphe temps réel du nombre d'individus).

**Phase 4 — Chaîne trophique**
Ajout des carnivores. Prédation. Recherche de l'équilibre Lotka-Volterra. C'est la phase la plus dure : réglage des paramètres pour que ça n'explose ni ne s'effondre.

**Phase 5 — Interaction & observation**
Contrôle du temps, inspection d'agent au clic, outils de perturbation, graphes de populations.

**Phase 6 (bonus) — Évolution**
Génétique + mutation + sélection. Visualisation de la dérive des traits dans le temps.

À chaque phase, tu me dis : ce qui est fait, ce qui reste, et **les paramètres à régler à la main** (parce que l'équilibre d'un écosystème se tune, il ne se code pas parfaitement du premier coup).

---

## Ce que je surveillerai (critères de qualité)

- **Cohérence sur la durée** : est-ce que l'archi de Phase 0 tient encore en Phase 5, ou est-ce que tout part en spaghetti ?
- **Honnêteté technique** : est-ce que tu signales les compromis et les points fragiles, ou tu prétends que tout est parfait ?
- **Performance réelle** : est-ce que la cible d'agents annoncée est tenue, mesures FPS à l'appui ?
- **Émergence** : est-ce que la simulation produit des comportements que je n'avais pas explicitement demandés ?
- **Débuggabilité** : est-ce que je peux comprendre pourquoi un agent fait ce qu'il fait ?

---

## Pour démarrer

Commence par la **Phase 0** uniquement. Pose-moi les questions de cadrage qui te manquent (style visuel, cible d'agents si tu veux mon avis, contraintes de déploiement), puis livre-moi le document d'architecture. On ne code pas tant que l'ossature n'est pas validée.
