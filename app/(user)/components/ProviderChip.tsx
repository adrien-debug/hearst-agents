"use client";

/**
 * ProviderChip — Pastille d'attribution provider pour un tool call.
 *
 * Affiche d'un coup d'œil quel provider sert un tool, avec un dot statut
 * (pending/success/error) et un tooltip détail (latence + coût) au hover.
 *
 * Tokens design system uniquement (cf. CLAUDE.md règles UI). Aucun magic
 * number, aucune couleur en dur — tout passe par var(--…) ou utilities
 * Tailwind v4 mappées sur --space-N.
 */

import { useState } from "react";

export type ProviderStatus = "pending" | "success" | "error";

export interface ProviderChipProps {
  providerId: string;
  label?: string;
  status?: ProviderStatus;
  latencyMs?: number;
  costUSD?: number;
}

/**
 * Glyphe court (1-2 chars) lisible sur 16px. La pastille reste agnostique
 * du logo provider — on n'embarque pas de raster ici. Si besoin d'un logo,
 * un futur ProviderLogo dédié.
 */
function glyphFor(providerId: string): string {
  const id = providerId.toLowerCase();
  // Quelques providers ont une lettre/symbole iconique. Pour le reste, on
  // dérive la 1re lettre du label / id.
  const map: Record<string, string> = {
    gmail: "G",
    googlecalendar: "C",
    googledrive: "D",
    googlesheets: "S",
    slack: "#",
    notion: "N",
    github: "G",
    gitlab: "L",
    bitbucket: "B",
    linear: "L",
    asana: "A",
    trello: "T",
    jira: "J",
    clickup: "U",
    monday: "M",
    airtable: "A",
    hubspot: "H",
    salesforce: "S",
    pipedrive: "P",
    zoho: "Z",
    zendesk: "Z",
    intercom: "I",
    freshdesk: "F",
    helpscout: "H",
    stripe: "$",
    quickbooks: "Q",
    xero: "X",
    shopify: "S",
    woocommerce: "W",
    whatsapp: "W",
    twilio: "T",
    vonage: "V",
    discord: "D",
    microsoftteams: "T",
    sendgrid: "S",
    mailchimp: "M",
    figma: "F",
    canva: "C",
    amplitude: "A",
    mixpanel: "M",
    segment: "S",
    fal_ai: "ƒ",
    anthropic: "A",
    e2b: "E",
    llama_parse: "L",
    hearst: "H",
    composio: "·",
  };
  return map[id] ?? id.charAt(0).toUpperCase();
}

function formatLatency(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatCost(usd?: number): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd < 0.01) return `< $0.01`;
  return `$${usd.toFixed(2)}`;
}

export function ProviderChip({
  providerId,
  label,
  status = "success",
  latencyMs,
  costUSD,
}: ProviderChipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const displayLabel = label ?? providerId;

  // Mapping statut → couleur (dot uniquement).
  // success : cykan (data flow ok)
  // pending : text-faint (in-flight)
  // error   : danger (échec visible)
  const dotClass =
    status === "error"
      ? "bg-[var(--danger)]"
      : status === "pending"
        ? "bg-[var(--text-faint)] animate-pulse"
        : "bg-[var(--cykan)]";

  return (
    <span
      className="relative inline-flex items-center rounded-pill border border-[var(--border-shell)] bg-[var(--surface-1)] px-2 py-0.5 t-9 font-mono text-[var(--text-muted)] transition-colors hover:border-[var(--cykan-border)] hover:text-[var(--text)]"
      style={{ gap: "var(--space-1)" }}
      data-provider={providerId}
      data-status={status}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      tabIndex={0}
      aria-label={`Provider ${displayLabel}, statut ${status}`}
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center rounded-pill bg-[var(--surface-2)] text-[var(--text)] t-9 font-bold"
        style={{ width: "var(--space-3)", height: "var(--space-3)" }}
      >
        {glyphFor(providerId)}
      </span>
      <span className="truncate max-w-20">{displayLabel}</span>
      <span
        aria-hidden
        className={`inline-block rounded-pill ${dotClass}`}
        style={{ width: "var(--space-1)", height: "var(--space-1)" }}
      />

      {showTooltip && (latencyMs != null || costUSD != null) && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border-shell)] bg-[var(--bg-rail)] px-2 py-1 t-9 font-mono text-[var(--text-muted)] shadow-[var(--shadow-card)]"
        >
          <span className="text-[var(--text)]">{displayLabel}</span>
          <span className="ml-2">⌛ {formatLatency(latencyMs)}</span>
          <span className="ml-2">{formatCost(costUSD)}</span>
        </span>
      )}
    </span>
  );
}
