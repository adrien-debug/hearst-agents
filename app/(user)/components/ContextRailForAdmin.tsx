"use client";

/**
 * Sub-rails ContextRail pour les pages admin (hors Stage central).
 *
 * Chaque page standalone (`/runs`, `/missions`, `/apps`, `/reports`) a son
 * propre sub-rail contextuel — promesse pivot 2026-04-29 « structure fixe
 * PAR STAGE » étendue aux pages admin.
 *
 * Avant : ces pages affichaient le `GeneralDashboard` du Cockpit (KPIs +
 * Missions actives + Assets récents) qui n'avait aucune valeur ajoutée
 * sur ces écrans. Maintenant : raccourcis, filtres, templates pertinents
 * à chaque domaine.
 *
 * Tous les composants utilisent `<RailSection>` + `<Action>` du DS pour
 * garantir la cohérence éditoriale (voix calme, pas de mono caps, gold
 * pour les liens d'apprentissage, brand pour les actions principales).
 */

import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RailSection, Action } from "./ui";

// ── Icons (stroke 1.5, 14×14, cohérent avec TimelineRail) ──────

const CategoryIcons: Record<string, ReactNode> = {
  communication: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  productivity: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  crm: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="14 7 21 7 21 14" />
    </svg>
  ),
  "developer-tools": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  design: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <circle cx="6" cy="6" r="1.5" />
    </svg>
  ),
  scheduling: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  ai: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  ),
  analytics: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
};

const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// ── Local primitives ───────────────────────────────────────────

/**
 * Section "Raccourcis" toggleable — même logique que Récents dans
 * TimelineRail. Header cliquable, ChevronDown qui pivote -90° quand fermé.
 * Default expanded.
 */
function CollapsibleRailSection({
  label,
  defaultExpanded = true,
  children,
}: {
  label: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <section className="px-5 py-5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-baseline justify-between gap-3 group pr-6"
        style={{ marginBottom: expanded ? "var(--space-4)" : 0 }}
      >
        <span className="t-13 font-medium text-[var(--text-l1)] truncate text-left">
          {label}
        </span>
        <span
          className="inline-flex items-center justify-center transition-transform duration-emphasis ease-out-soft text-[var(--text-faint)] group-hover:text-[var(--text-soft)] shrink-0"
          style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
          aria-hidden
        >
          <ChevronDownIcon />
        </span>
      </button>
      {expanded && children}
    </section>
  );
}

/**
 * Wrapper d'<Action> pour les Raccourcis : ajoute un dot cykan 8px à
 * gauche, même couleur que le H du logo et que les dots des threads dans
 * TimelineRail. Halo serré shadow-neon-cykan, opacity 0.7 par défaut.
 */
function ShortcutAction({
  href,
  variant = "ghost",
  tone = "neutral",
  children,
}: {
  href: string;
  variant?: "ghost" | "primary" | "secondary";
  tone?: "neutral" | "brand";
  children: ReactNode;
}) {
  return (
    <span className="flex items-center" style={{ gap: "var(--space-3)" }}>
      <span
        className="rounded-pill shrink-0"
        style={{
          width: "var(--space-2)",
          height: "var(--space-2)",
          background: "var(--cykan)",
          boxShadow: "var(--shadow-neon-cykan)",
          opacity: 0.7,
        }}
        aria-hidden
      />
      <Action variant={variant} tone={tone} size="sm" href={href}>
        {children}
      </Action>
    </span>
  );
}

// ── Runs ──────────────────────────────────────────────────────

export function ContextRailForRuns() {
  const router = useRouter();
  return (
    <div className="h-full overflow-y-auto">
      <RailSection label="Filtres">
        <ul className="flex flex-col" style={{ gap: "var(--space-1)" }}>
          {(
            [
              { label: "Tous les runs", q: "" },
              { label: "Réussis", q: "?status=success" },
              { label: "En échec", q: "?status=failed" },
              { label: "En cours", q: "?status=running" },
              { label: "En attente d'approbation", q: "?status=awaiting_approval" },
            ] as const
          ).map((f) => (
            <li key={f.label}>
              <button
                type="button"
                onClick={() => router.push(`/runs${f.q}`)}
                className="t-13 font-light text-[var(--text-soft)] hover:text-[var(--cykan)] transition-colors duration-base text-left w-full"
              >
                {f.label}
              </button>
            </li>
          ))}
        </ul>
      </RailSection>

      <CollapsibleRailSection label="Raccourcis">
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <ShortcutAction variant="secondary" tone="brand" href="/missions">
            Voir les missions
          </ShortcutAction>
          <ShortcutAction href="/assets">Voir les assets</ShortcutAction>
        </div>
      </CollapsibleRailSection>

      <RailSection label="Aide">
        <p className="t-11 font-light text-[var(--text-faint)]">
          Chaque run garde sa trace complète : prompt, modèle, coût, latence,
          assets produits. Re-run un run conserve le contexte.
        </p>
      </RailSection>
    </div>
  );
}

// ── Missions ──────────────────────────────────────────────────

export function ContextRailForMissionsAdmin() {
  return (
    <div className="h-full overflow-y-auto">
      <RailSection label="Cadences">
        <ul className="flex flex-col" style={{ gap: "var(--space-1)" }}>
          {[
            { label: "Quotidienne", cron: "0 9 * * *" },
            { label: "Hebdomadaire", cron: "0 9 * * 1" },
            { label: "Mensuelle", cron: "0 9 1 * *" },
            { label: "Personnalisée", cron: "custom" },
          ].map((c) => (
            <li
              key={c.label}
              className="flex items-baseline justify-between"
            >
              <span className="t-13 font-light text-[var(--text-soft)]">
                {c.label}
              </span>
              <span className="t-11 font-mono tabular-nums text-[var(--text-faint)]">
                {c.cron === "custom" ? "—" : c.cron}
              </span>
            </li>
          ))}
        </ul>
      </RailSection>

      <CollapsibleRailSection label="Raccourcis">
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <ShortcutAction variant="primary" tone="brand" href="/missions/builder">
            Builder visuel
          </ShortcutAction>
          <ShortcutAction variant="secondary" tone="brand" href="/marketplace">
            Templates marketplace
          </ShortcutAction>
        </div>
      </CollapsibleRailSection>

      <RailSection label="Aide">
        <p className="t-11 font-light text-[var(--text-faint)]">
          Les missions sont des automatisations planifiées. Elles s&apos;exécutent
          selon une cadence cron, peuvent enchaîner plusieurs étapes et
          déclencher des actions sur tes apps connectées.
        </p>
      </RailSection>
    </div>
  );
}

// ── Apps ──────────────────────────────────────────────────────

export function ContextRailForApps() {
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category");

  return (
    <div className="h-full overflow-y-auto">
      <RailSection label="Catégories">
        <ul className="flex flex-col" style={{ gap: "var(--space-1)" }}>
          {[
            { label: "Communication", slug: "communication" },
            { label: "Productivité", slug: "productivity" },
            { label: "CRM & Ventes", slug: "crm" },
            { label: "Développement", slug: "developer-tools" },
            { label: "Design", slug: "design" },
            { label: "Planification", slug: "scheduling" },
            { label: "IA & Données", slug: "ai" },
            { label: "Analytics", slug: "analytics" },
          ].map((c) => (
            <li key={c.slug}>
              <Action
                variant="ghost"
                tone={activeCategory === c.slug ? "brand" : "neutral"}
                size="sm"
                href={`/apps?category=${c.slug}`}
                iconLeft={CategoryIcons[c.slug]}
              >
                {c.label}
              </Action>
            </li>
          ))}
        </ul>
      </RailSection>

      <CollapsibleRailSection label="Raccourcis">
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <ShortcutAction href="/reports">Voir les rapports</ShortcutAction>
          <ShortcutAction href="/missions">Voir les missions</ShortcutAction>
        </div>
      </CollapsibleRailSection>

      <RailSection label="Aide">
        <p className="t-11 font-light text-[var(--text-faint)]">
          Connecte tes outils via OAuth. Une fois liés, ils alimentent
          automatiquement Hearst : emails, calendrier, fichiers, code, etc.
        </p>
      </RailSection>
    </div>
  );
}

// ── Reports ───────────────────────────────────────────────────

export function ContextRailForReports() {
  return (
    <div className="h-full overflow-y-auto">
      <RailSection label="Domaines">
        <ul className="flex flex-col" style={{ gap: "var(--space-1)" }}>
          {[
            { label: "Founder", slug: "founder" },
            { label: "Finance", slug: "finance" },
            { label: "CRM", slug: "crm" },
            { label: "Ops", slug: "ops" },
            { label: "Growth", slug: "growth" },
            { label: "People", slug: "people" },
            { label: "Marketing", slug: "marketing" },
            { label: "Support", slug: "support" },
          ].map((d) => (
            <li key={d.slug}>
              <a
                href={`/reports?domain=${d.slug}`}
                className="t-13 font-light text-[var(--text-soft)] hover:text-[var(--cykan)] transition-colors duration-base"
              >
                {d.label}
              </a>
            </li>
          ))}
        </ul>
      </RailSection>

      <CollapsibleRailSection label="Raccourcis">
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <ShortcutAction variant="primary" tone="brand" href="/reports/studio">
            Créer un rapport
          </ShortcutAction>
          <ShortcutAction variant="secondary" tone="brand" href="/runs">
            Historique des runs
          </ShortcutAction>
        </div>
      </CollapsibleRailSection>

      <RailSection label="Aide">
        <p className="t-11 font-light text-[var(--text-faint)]">
          Les rapports génèrent des analyses chiffrées à la demande ou
          planifiées (en mission). Chaque rapport peut être exporté en PDF
          ou partagé via lien signé.
        </p>
      </RailSection>
    </div>
  );
}
