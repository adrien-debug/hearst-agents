# Plan Reconstruction UI — HEARST OS

## Objectif
Reconstruction complète et propre de l'UI, sans dette technique.

## Phases

### Phase 0 — Foundation CSS/Tokens
- [ ] Supprimer `globals.css` legacy
- [ ] Créer nouveau système de tokens CSS
- [ ] Définir toutes les classes utilitaires (.ghost-*, .action-button, .tag)
- [ ] Standardiser les z-index
- [ ] Migrer les hardcoded colors vers tokens

### Phase 1 — State Architecture (Zustand)
- [ ] Installer Zustand
- [ ] Créer `stores/shell.ts` — état global UI
- [ ] Créer `stores/runtime.ts` — SSE/events
- [ ] Créer `stores/navigation.ts` — sidebar/surface
- [ ] Supprimer tous les Contexts legacy

### Phase 2 — Layout Clean
- [ ] Créer `app/(user)/layout.tsx` — 3 colonnes max
- [ ] Créer `components/layout/AppNav.tsx` — rail gauche
- [ ] Créer `components/layout/RightPanel.tsx` — rail droit
- [ ] Créer `components/layout/CenterStage.tsx` — zone centrale
- [ ] Créer `components/layout/ChatContainer.tsx` — input

### Phase 3 — Composants UI Core
- [ ] Créer `components/ui/GlobalChat.tsx` — input unique
- [ ] Créer `components/ui/ManifestationStage.tsx` — zone centrale
- [ ] Créer `components/ui/FocalObject.tsx` — rendu objets
- [ ] Créer `components/ui/TopBar.tsx` — barre supérieure

### Phase 4 — Pipeline Données
- [ ] Filtrer erreurs techniques dans delegate/api.ts
- [ ] Valider objets focaux dans useFocalObject
- [ ] Nettoyer manifestation.ts

### Phase 5 — Test & Validation
- [ ] Tests visuels
- [ ] Tests interactions
- [ ] Build OK

## Principes

1. **Pas de Context Hell** — Max 2 niveaux de providers
2. **Pas de classes manquantes** — Tout défini dans globals.css
3. **Pas de messages d'erreur en UI** — Filtrage strict
4. **Pas de hardcoded colors** — Tout via tokens
5. **Atomic commits** — Une phase = un commit

## Fichiers à Supprimer (legacy)

### Contexts (remplacés par Zustand)
- `app/lib/chat-context.tsx`
- `app/lib/chat-activity.tsx`
- `app/lib/run-stream-context.tsx`
- `app/lib/halo-runtime-context.tsx`

### Hooks (remplacés)
- `app/hooks/use-sidebar.tsx`
- `app/hooks/use-surface.tsx`
- `app/hooks/use-thread-switch.ts`

### Composants (recréés propres)
- `app/components/GlobalChat.tsx`
- `app/components/right-panel/RightPanel.tsx`
- `app/components/system/ManifestationStage.tsx`

## Structure Cible

```
app/
├── (user)/
│   ├── layout.tsx          # Layout clean 3-col
│   └── page.tsx            # Home
├── components/
│   ├── layout/             # Structure
│   │   ├── AppNav.tsx
│   │   ├── CenterStage.tsx
│   │   ├── RightPanel.tsx
│   │   └── ChatContainer.tsx
│   └── ui/                 # Composants
│       ├── GlobalChat.tsx
│       ├── ManifestationStage.tsx
│       └── FocalObject.tsx
├── stores/                 # Zustand
│   ├── shell.ts
│   ├── runtime.ts
│   └── navigation.ts
└── styles/
    └── globals.css         # Tokens complets
```
