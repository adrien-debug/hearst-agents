"use client";

/**
 * ReportCard — carte catalogue de rapport pour la page Discovery.
 *
 * Affiche : titre, domaine (badge coloré), persona, cadence, statut.
 * Trois états actionnables :
 *   ready          → bouton "Lancer" cykan
 *   partial        → bouton "Configurer" + liste apps manquantes
 *   needs-connection → bouton "Connecter" grisé
 *
 * Source "custom" → badge "Personnalisé" visible.
 * Hover → elevation via --shadow-card-hover.
 *
 * Tokens uniquement — conforme CLAUDE.md + lint:visual strict.
 */

import { useRouter } from "next/navigation";
import { useNavigationStore } from "@/stores/navigation";
import { useStageStore } from "@/stores/stage";
import { Action } from "@/app/(user)/components/ui";
import type { ApplicableReport } from "@/lib/reports/catalog";

// ── Domain colors (cykan-scale + status colors — tokens only) ──

const DOMAIN_LABELS: Record<string, string> = {
  finance:  "Finance",
  crm:      "CRM",
  ops:      "Ops",
  growth:   "Growth",
  founder:  "Founder",
  "ops-eng": "Eng",
  support:  "Support",
  mixed:    "Mixte",
  people:   "People",
  marketing: "Marketing",
};

const DOMAIN_STYLE: Record<string, { bg: string; color: string }> = {
  finance:   { bg: "var(--color-success-bg)",   color: "var(--color-success)" },
  crm:       { bg: "var(--cykan-surface)",       color: "var(--cykan)" },
  ops:       { bg: "var(--color-warning-bg)",    color: "var(--color-warning)" },
  growth:    { bg: "var(--cykan-surface)",       color: "var(--cykan)" },
  founder:   { bg: "var(--surface-2)",           color: "var(--text-soft)" },
  "ops-eng": { bg: "var(--color-info-bg)",       color: "var(--color-info)" },
  support:   { bg: "var(--color-warning-bg)",    color: "var(--color-warning)" },
  mixed:     { bg: "var(--surface-2)",           color: "var(--text-muted)" },
  people:    { bg: "var(--color-success-bg)",    color: "var(--color-success)" },
  marketing: { bg: "var(--cykan-surface)",       color: "var(--cykan)" },
};

const PERSONA_LABELS: Record<string, string> = {
  founder:     "Founder",
  csm:         "CSM",
  ops:         "Ops",
  sales:       "Sales",
  eng:         "Eng",
  engineering: "Engineering",
  marketing:   "Marketing",
  people:      "People",
  finance:     "Finance",
  product:     "Product",
  support:     "Support",
};

// ── Icons ──────────────────────────────────────────────────────

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function getCadenceLabel(domain: string): string {
  const map: Record<string, string> = {
    finance:   "Mensuel",
    crm:       "Hebdomadaire",
    ops:       "Hebdomadaire",
    growth:    "Hebdomadaire",
    founder:   "Quotidien",
    "ops-eng": "Hebdomadaire",
    support:   "Quotidien",
    mixed:     "À la demande",
    people:    "Mensuel",
    marketing: "Hebdomadaire",
  };
  return map[domain] ?? "À la demande";
}

// ── Props ────────────────────────────────────────────────────────

export interface ReportCardProps {
  report: ApplicableReport & { customAuthor?: string };
  onLaunch?: (report: ApplicableReport) => void;
}

// ── Component ───────────────────────────────────────────────────

export function ReportCard({ report, onLaunch }: ReportCardProps) {
  const router = useRouter();
  const addThread = useNavigationStore((s) => s.addThread);
  const addMessageToThread = useNavigationStore((s) => s.addMessageToThread);
  const setStageMode = useStageStore((s) => s.setMode);

  const domainStyle = DOMAIN_STYLE[report.domain] ?? DOMAIN_STYLE.mixed;
  const domainLabel = DOMAIN_LABELS[report.domain] ?? report.domain;
  const personaLabel = PERSONA_LABELS[report.persona] ?? report.persona;
  const cadence = getCadenceLabel(report.domain);

  const isReady = report.status === "ready";
  const isPartial = report.status === "partial";
  const isBlocked = report.status !== "ready" && report.status !== "partial";

  const handleLaunch = () => {
    if (onLaunch) {
      onLaunch(report);
      return;
    }
    const threadId = addThread(`Rapport : ${report.title}`, "home");
    addMessageToThread(threadId, {
      id: `user-${Date.now()}`,
      role: "user",
      content: `Lance le rapport ${report.title}`,
    });
    setStageMode({ mode: "chat", threadId });
    router.push("/");
  };

  const handleConfigure = () => {
    router.push("/settings/connections");
  };

  const handleConnect = () => {
    router.push("/settings/connections");
  };

  return (
    <article
      data-testid={`report-card-${report.id}`}
      className="group relative flex flex-col gap-4 p-6 rounded-xl border transition-all"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-default)",
        boxShadow: "var(--shadow-card)",
        transitionDuration: "var(--duration-slow)",
        transitionTimingFunction: "var(--ease-standard)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-card-hover)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--cykan-border-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-card)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
      }}
    >
      {/* Badges top row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Domain badge */}
        <span
          className="inline-flex items-center px-2 py-1 rounded-md t-9 font-semibold tracking-wide uppercase"
          style={{
            background: domainStyle.bg,
            color: domainStyle.color,
            borderRadius: "var(--radius-xs)",
          }}
        >
          {domainLabel}
        </span>

        {/* Persona badge */}
        <span
          className="inline-flex items-center px-2 py-1 t-9 font-medium tracking-wide uppercase"
          style={{
            background: "var(--surface-1)",
            color: "var(--text-faint)",
            borderRadius: "var(--radius-xs)",
          }}
        >
          {personaLabel}
        </span>

        {/* Custom badge */}
        {report.source === "custom" && (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 t-9 font-medium tracking-wide uppercase"
            style={{
              background: "var(--cykan-surface)",
              color: "var(--cykan)",
              borderRadius: "var(--radius-xs)",
            }}
          >
            <StarIcon />
            Personnalisé
          </span>
        )}

        {/* Spacer + cadence */}
        <span className="ml-auto inline-flex items-center gap-1 t-9 font-light" style={{ color: "var(--text-ghost)" }}>
          <CalendarIcon />
          {cadence}
        </span>
      </div>

      {/* Title + description */}
      <div className="flex flex-col gap-1 flex-1">
        <h3 className="t-15 font-semibold" style={{ color: "var(--text-soft)" }}>
          {report.title}
        </h3>
        {report.description && (
          <p className="t-13 font-light line-clamp-2" style={{ color: "var(--text-faint)", lineHeight: "var(--leading-base)" }}>
            {report.description}
          </p>
        )}
      </div>

      {/* Apps manquantes (partial) */}
      {isPartial && report.missingApps.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="t-9 font-medium tracking-wide uppercase" style={{ color: "var(--color-warning)" }}>
            Apps manquantes
          </span>
          <div className="flex flex-wrap gap-1">
            {report.missingApps.slice(0, 4).map((app) => (
              <span
                key={app}
                className="inline-flex px-2 py-0.5 t-9 font-mono"
                style={{
                  background: "var(--color-warning-bg)",
                  color: "var(--color-warning)",
                  borderRadius: "var(--radius-xs)",
                  border: "1px solid var(--color-warning-border)",
                }}
              >
                {app}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="shrink-0">
        {isReady && (
          <Action
            variant="primary"
            tone="brand"
            size="sm"
            onClick={handleLaunch}
            iconLeft={<PlayIcon />}
            testId={`report-launch-${report.id}`}
          >
            Lancer
          </Action>
        )}

        {isPartial && (
          <button
            type="button"
            onClick={handleConfigure}
            data-testid={`report-configure-${report.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 t-12 font-semibold rounded-md border transition-all"
            style={{
              background: "var(--color-warning-bg)",
              color: "var(--color-warning)",
              borderColor: "var(--color-warning-border)",
              borderRadius: "var(--radius-sm)",
              transitionDuration: "var(--duration-base)",
            }}
          >
            <SettingsIcon />
            Configurer
          </button>
        )}

        {isBlocked && (
          <button
            type="button"
            onClick={handleConnect}
            data-testid={`report-connect-${report.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 t-12 font-medium rounded-md border transition-all"
            disabled
            style={{
              background: "var(--surface-1)",
              color: "var(--text-ghost)",
              borderColor: "var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              transitionDuration: "var(--duration-base)",
              cursor: "not-allowed",
            }}
          >
            <LinkIcon />
            Connecter
          </button>
        )}
      </div>
    </article>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────

export function ReportCardSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 p-6 rounded-xl border animate-pulse"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-subtle)",
        borderRadius: "var(--radius-xl)",
      }}
    >
      <div className="flex gap-2">
        <div className="h-5 w-16 rounded" style={{ background: "var(--surface-2)" }} />
        <div className="h-5 w-12 rounded" style={{ background: "var(--surface-1)" }} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-48 rounded" style={{ background: "var(--surface-2)" }} />
        <div className="h-3 w-full rounded" style={{ background: "var(--surface-1)" }} />
        <div className="h-3 w-3/4 rounded" style={{ background: "var(--surface-1)" }} />
      </div>
      <div className="h-8 w-24 rounded" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }} />
    </div>
  );
}
