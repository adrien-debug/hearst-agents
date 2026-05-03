# Mission : Refonte Premium du Dashboard Cockpit (Hearst OS)

**Contexte critique :**
Tu vas travailler sur la section centrale du dashboard (`app/(user)/components/cockpit/`). Actuellement, l'interface est constituée de "boîtes" grises basiques (`var(--surface-1)` avec `border-soft`). C'est fonctionnel mais très "cheap". 

**L'objectif est de créer un effet "WAOUH" absolu, un design de classe mondiale digne des plus grands GAFAM (Apple, Linear, Vercel, Palantir), tout en respectant la surface de l'application.**

---

### ⚠️ DIRECTIVES EXCEPTIONNELLES (OUTREPASSE LES RÈGLES)
Pour cette tâche spécifique, **tu es autorisé et encouragé à ignorer les règles de bridage du design system** (comme l'interdiction des animations au survol, l'interdiction des halos cyan hors focus, ou l'obligation d'utiliser uniquement les tokens stricts). 
L'utilisateur a explicitement demandé de "casser les règles" pour obtenir un design ultra-premium, dynamique et organique.

---

### 🎨 COMPRÉHENSION DE LA SURFACE (CRITIQUE)
**Attention danger :** L'application fonctionne en **Light Mode** par défaut (fond blanc/très clair). 
- **NE JAMAIS** coder en dur des textes blancs (`text-white`, `rgba(255,255,255)`) ou des fonds sombres translucides.
- **NE JAMAIS** utiliser de `backdrop-filter: blur` avec des fonds blancs opaques, cela rend le texte invisible.
- **TOUJOURS** utiliser les variables CSS dynamiques du projet pour les couleurs de base (`var(--text-l1)` pour le texte principal, `var(--text-soft)` pour le secondaire, `var(--surface-1)` pour les fonds subtils), car elles s'adaptent automatiquement au thème.

---

### 🚀 LA VISION DESIGN (Ce que tu dois implémenter)

Nous voulons une interface qui respire la haute technologie, l'IA et le temps réel.

#### 1. Typographie & Espace (L'élégance du vide)
- Supprime l'effet "boîte" (fonds gris et bordures pleines) partout où c'est possible. Laisse les éléments respirer sur le fond principal.
- Utilise une typographie architecturale : des chiffres énormes et fins pour les KPIs (`t-28` ou plus, `font-light`, `tracking-tight`), et des labels en toutes petites capitales très espacées (`uppercase tracking-widest text-[0.65rem]`).

#### 2. L'Accent Turquoise (L'énergie du système)
- Le turquoise (`var(--cykan)`) est la couleur de l'IA et de l'activité.
- Utilise-le de manière chirurgicale mais spectaculaire : un point lumineux qui pulse (`animate-pulse`), une bordure d'un pixel d'épaisseur qui s'illumine, ou un halo très subtil (`boxShadow`) uniquement sur les éléments **actifs**.

#### 3. Organisation Dynamique des Agents (`AgentsConstellation.tsx`)
C'est la pièce maîtresse. Actuellement, ce sont de tristes boutons carrés. Transforme cela en un véritable "réseau neuronal" ou "constellation" :
- **Avatars dynamiques** : Les logos des agents connectés doivent être encapsulés dans des cercles parfaits ou des formes organiques douces.
- **Lévitation & Physique** : Au survol, l'agent doit se soulever doucement (`hover:-translate-y-1`, `transition-all duration-500`) et projeter une ombre douce.
- **État Actif (Le "Waouh")** : Quand un agent est actif (en train de travailler), il doit irradier. Utilise un halo cyan pulsant en arrière-plan de l'icône, ou une bordure animée. Le status dot doit ressembler à une LED allumée.
- **Disposition** : Sors du carcan de la grille stricte si tu le peux. Pense à des tailles légèrement différentes (les agents actifs plus gros que les inactifs), ou à un layout plus fluide.

#### 4. Quick Actions & KPIs
- **Quick Actions** : Fais disparaître les grosses bordures. Remplace-les par des cartes ultra-minimalistes qui réagissent au survol (légère élévation, le texte principal qui s'illumine en cyan).
- **KPIs** : Les chiffres doivent flotter. S'il y a une sparkline (graphique), elle doit être élégante, avec un trait fin, et s'animer ou s'illuminer subtilement au passage de la souris.

---

### 🛠️ PLAN D'ACTION POUR TON INTERVENTION
1. Analyse les fichiers `KpiCard.tsx`, `QuickActionsGrid.tsx`, `AgentsConstellation.tsx` et `CockpitHeader.tsx`.
2. Nettoie les `background: var(--surface-1)` et les bordures épaisses.
3. Applique la nouvelle typographie (chiffres géants, labels uppercase espacés).
4. Implémente la "Constellation d'Agents" avec des avatars ronds, des effets de lévitation et des halos cyan pour les agents actifs.
5. **Vérifie 3 fois** que tu n'as pas mis de texte blanc en dur et que tout reste lisible sur un fond clair.

Fais de cette interface un bijou technologique.