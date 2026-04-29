"use client";

/**
 * ContextRail — Rail droit polymorphe (post-pivot 2026-04-29).
 *
 * Remplace RightPanelContent comme entrée. Dispatch selon
 * `useStageStore.current.mode`. Pour les modes chat/cockpit, on délègue
 * au RightPanelContent existant (compat totale). Pour les nouveaux modes
 * (asset/browser/meeting/kg/voice), on rend des sub-rails spécialisés.
 *
 * Règle « structure fixe par Stage » : chaque sub-rail rend SES sections
 * inconditionnellement, avec empty state interne. Pas de
 * `{section.length > 0 && ...}` autour d'un bloc complet.
 */

import { useStageStore } from "@/stores/stage";
import { RightPanelContent } from "./RightPanelContent";

interface ContextRailProps {
  onClose?: () => void;
}

export function ContextRail({ onClose }: ContextRailProps) {
  const mode = useStageStore((s) => s.current.mode);

  switch (mode) {
    case "cockpit":
    case "chat":
      // V1 — cockpit et chat partagent le même context rail (focal +
      // missions + assets + pulse). En V2, cockpit aura son propre layout
      // configurable via useCockpitStore.
      return <RightPanelContent onClose={onClose} />;
    case "asset":
      return <ContextRailShell onClose={onClose}><ContextRailForAsset /></ContextRailShell>;
    case "browser":
      return <ContextRailShell onClose={onClose}><ContextRailForBrowser /></ContextRailShell>;
    case "meeting":
      return <ContextRailShell onClose={onClose}><ContextRailForMeeting /></ContextRailShell>;
    case "kg":
      return <ContextRailShell onClose={onClose}><ContextRailForKnowledge /></ContextRailShell>;
    case "voice":
      return <ContextRailShell onClose={onClose}><ContextRailForVoice /></ContextRailShell>;
    case "simulation":
      return <ContextRailShell onClose={onClose}><ContextRailForSimulation /></ContextRailShell>;
    default:
      return null;
  }
}

function ContextRailShell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <aside
      className="h-full flex flex-col z-20 relative border-l border-[var(--border-shell)]"
      style={{ width: "var(--width-context)", background: "var(--bg-rail)" }}
    >
      {onClose && (
        <div
          className="flex items-center justify-between border-b border-[var(--border-shell)]"
          style={{ padding: "var(--space-4)" }}
        >
          <p className="t-13 font-medium">Contexte</p>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)]"
          >
            ✕
          </button>
        </div>
      )}
      {children}
    </aside>
  );
}

// ── Section primitive (stable structure across sub-rails) ─

function Section({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--surface-2)] py-6 px-6">
      <header className="flex items-center justify-between mb-4">
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">{label}</span>
        {typeof count === "number" && (
          <span className="t-9 font-mono tracking-display text-[var(--text-ghost)]">
            {count.toString().padStart(2, "0")}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-11 font-mono tracking-display uppercase text-[var(--text-ghost)]">
      {children}
    </p>
  );
}

// ── Sub-rails par Stage (Phase A skeletons) ────────────────

function ContextRailForAsset() {
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Variants" count={1}>
        <p className="t-13 font-light text-[var(--text-muted)]">
          Texte (par défaut). Génère <span className="text-[var(--cykan)]">audio</span>, <span className="text-[var(--cykan)]">vidéo</span>, <span className="text-[var(--cykan)]">slides</span> ou <span className="text-[var(--cykan)]">site</span> à la demande.
        </p>
      </Section>
      <Section label="Provenance">
        <EmptyHint>Données provenance bientôt visibles ici</EmptyHint>
      </Section>
      <Section label="Knowledge Graph">
        <EmptyHint>{"Entités liées en cours d'extraction"}</EmptyHint>
      </Section>
    </div>
  );
}

function ContextRailForBrowser() {
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Action Log" count={0}>
        <EmptyHint>Aucune action enregistrée</EmptyHint>
      </Section>
      <Section label="Sources" count={0}>
        <EmptyHint>Pas encore de sources collectées</EmptyHint>
      </Section>
      <Section label="Co-pilote">
        <p className="t-13 font-light text-[var(--text-muted)]">
          L{"'"}agent navigue. <span className="text-[var(--cykan)]">Take Over</span> à tout moment.
        </p>
      </Section>
    </div>
  );
}

function ContextRailForMeeting() {
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Action Items" count={0}>
        <EmptyHint>Aucun action item détecté</EmptyHint>
      </Section>
      <Section label="Speakers" count={0}>
        <EmptyHint>Aucun speaker identifié</EmptyHint>
      </Section>
      <Section label="Templates Mission">
        <p className="t-13 font-light text-[var(--text-muted)]">
          Approve all → exécution Composio (Slack, Linear, Notion, Gmail).
        </p>
      </Section>
    </div>
  );
}

function ContextRailForKnowledge() {
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Entité focus">
        <EmptyHint>Sélectionne une entité dans le graphe</EmptyHint>
      </Section>
      <Section label="Requêtes récentes" count={0}>
        <EmptyHint>Aucune requête mémorisée</EmptyHint>
      </Section>
      <Section label="Suggested explorations">
        <p className="t-13 font-light text-[var(--text-muted)]">
          {"L'agent peut suggérer des chemins d'exploration depuis ton historique."}
        </p>
      </Section>
    </div>
  );
}

function ContextRailForVoice() {
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Transcript live">
        <EmptyHint>Active le mode voix pour démarrer</EmptyHint>
      </Section>
      <Section label="Tools disponibles" count={0}>
        <EmptyHint>Composio · KG · Missions</EmptyHint>
      </Section>
      <Section label="Voice settings">
        <p className="t-13 font-light text-[var(--text-muted)]">
          Modèle <span className="text-[var(--cykan)]">openai-realtime</span>, latence cible &lt; 500&nbsp;ms.
        </p>
      </Section>
    </div>
  );
}

function ContextRailForSimulation() {
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Variables">
        <EmptyHint>Définis les inputs dans le formulaire</EmptyHint>
      </Section>
      <Section label="Sources" count={0}>
        <EmptyHint>Phase B suivante : Exa + Perplexity benchmarks</EmptyHint>
      </Section>
      <Section label="Validation">
        <p className="t-13 font-light text-[var(--text-muted)]">
          Phase B suivante : E2B vérifiera les calculs.
        </p>
      </Section>
    </div>
  );
}
