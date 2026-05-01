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

import { useRouter } from "next/navigation";
import { RailSection, Action } from "./ui";

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

      <RailSection label="Raccourcis">
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <Action variant="secondary" tone="brand" size="sm" href="/missions">
            Voir les missions
          </Action>
          <Action variant="ghost" tone="neutral" size="sm" href="/assets">
            Voir les assets
          </Action>
        </div>
      </RailSection>

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

      <RailSection label="Raccourcis">
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <Action variant="primary" tone="brand" size="sm" href="/missions/builder">
            Builder visuel
          </Action>
          <Action variant="secondary" tone="brand" size="sm" href="/marketplace">
            Templates marketplace
          </Action>
        </div>
      </RailSection>

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
              <a
                href={`/apps#${c.slug}`}
                className="t-13 font-light text-[var(--text-soft)] hover:text-[var(--cykan)] transition-colors duration-base"
              >
                {c.label}
              </a>
            </li>
          ))}
        </ul>
      </RailSection>

      <RailSection label="Raccourcis">
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <Action variant="ghost" tone="neutral" size="sm" href="/reports">
            Voir les rapports
          </Action>
          <Action variant="ghost" tone="neutral" size="sm" href="/missions">
            Voir les missions
          </Action>
        </div>
      </RailSection>

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

      <RailSection label="Raccourcis">
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <Action variant="primary" tone="brand" size="sm" href="/reports/studio">
            Créer un rapport
          </Action>
          <Action variant="secondary" tone="brand" size="sm" href="/runs">
            Historique des runs
          </Action>
        </div>
      </RailSection>

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
