/**
 * buildSuggestions — homepage idle-state suggestion cards.
 *
 * The empty-state surfaces only suggestions whose target service the user
 * has actually connected. Falls back to discovery prompts otherwise.
 *
 * Logic mirrored from app/(user)/page.tsx so we can unit-test without DOM.
 */

import { describe, it, expect } from "vitest";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";

const SUGGESTION_TEMPLATES: Array<{
  serviceId: string;
  title: string;
  subtitle: string;
}> = [
  { serviceId: "gmail", title: "Résumer mes emails non lus", subtitle: "Synthèse 24h · Gmail" },
  { serviceId: "calendar", title: "Mon agenda d'aujourd'hui", subtitle: "Événements & créneaux · Calendar" },
  { serviceId: "drive", title: "Mes derniers documents", subtitle: "Fichiers récents · Drive" },
  { serviceId: "slack", title: "Mes messages Slack non lus", subtitle: "Synthèse channels · Slack" },
  { serviceId: "notion", title: "Mes pages récentes", subtitle: "Workspace · Notion" },
  { serviceId: "github", title: "Mes PRs à reviewer", subtitle: "Code review · GitHub" },
  { serviceId: "linear", title: "Mes issues assignées", subtitle: "Backlog · Linear" },
  { serviceId: "jira", title: "Mes tickets en cours", subtitle: "Sprint · Jira" },
  { serviceId: "hubspot", title: "Mes leads à relancer", subtitle: "Pipeline · HubSpot" },
  { serviceId: "stripe", title: "Mon revenu de la semaine", subtitle: "Métriques · Stripe" },
];

const FALLBACK_SUGGESTIONS = [
  { serviceId: "_", title: "Connecter mes outils", subtitle: "Gmail, Slack, Notion, GitHub…" },
  { serviceId: "_", title: "Que peux-tu faire ?", subtitle: "Tour des capacités" },
  { serviceId: "_", title: "Planifier une automation", subtitle: "Brief récurrent" },
  { serviceId: "_", title: "Faire une recherche web", subtitle: "Veille · web" },
];

function buildSuggestions(
  connectedServices: ServiceWithConnectionStatus[],
): Array<{ id: string; title: string; subtitle: string }> {
  const connectedIds = new Set(connectedServices.map((s) => s.id));
  const matched = SUGGESTION_TEMPLATES.filter((t) => connectedIds.has(t.serviceId)).slice(0, 4);
  const list = matched.length > 0 ? matched : FALLBACK_SUGGESTIONS;
  return list.map((s, i) => ({
    id: String(i + 1).padStart(2, "0"),
    title: s.title,
    subtitle: s.subtitle,
  }));
}

function svc(id: string): ServiceWithConnectionStatus {
  return {
    id,
    name: id,
    icon: "🔌",
    description: "",
    category: "general",
    capabilities: [],
    connectionStatus: "connected",
  } as unknown as ServiceWithConnectionStatus;
}

describe("buildSuggestions — fallback when nothing connected", () => {
  it("returns 4 fallback prompts with no connected services", () => {
    const out = buildSuggestions([]);
    expect(out).toHaveLength(4);
    expect(out[0].title).toBe("Connecter mes outils");
    expect(out[0].id).toBe("01");
    expect(out[3].id).toBe("04");
  });
});

describe("buildSuggestions — service-specific prompts", () => {
  it("only Gmail connected → returns Gmail prompt", () => {
    const out = buildSuggestions([svc("gmail")]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Résumer mes emails non lus");
  });

  it("only Slack connected → returns Slack prompt", () => {
    const out = buildSuggestions([svc("slack")]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Mes messages Slack non lus");
  });

  it("only GitHub connected → returns GitHub prompt", () => {
    const out = buildSuggestions([svc("github")]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Mes PRs à reviewer");
  });

  it("only HubSpot connected → returns HubSpot prompt", () => {
    const out = buildSuggestions([svc("hubspot")]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Mes leads à relancer");
  });

  it("only Stripe connected → returns Stripe prompt", () => {
    const out = buildSuggestions([svc("stripe")]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Mon revenu de la semaine");
  });
});

describe("buildSuggestions — multi-service", () => {
  it("Gmail + Calendar + Drive → 3 productivity prompts", () => {
    const out = buildSuggestions([svc("gmail"), svc("calendar"), svc("drive")]);
    expect(out).toHaveLength(3);
    expect(out.map((s) => s.title)).toEqual([
      "Résumer mes emails non lus",
      "Mon agenda d'aujourd'hui",
      "Mes derniers documents",
    ]);
  });

  it("Slack + GitHub + Notion + Linear → 4 prompts (cap)", () => {
    const out = buildSuggestions([
      svc("slack"),
      svc("github"),
      svc("notion"),
      svc("linear"),
    ]);
    expect(out).toHaveLength(4);
  });

  it("caps at 4 even if 6+ services match", () => {
    const out = buildSuggestions([
      svc("gmail"),
      svc("calendar"),
      svc("drive"),
      svc("slack"),
      svc("notion"),
      svc("github"),
    ]);
    expect(out).toHaveLength(4);
  });

  it("preserves SUGGESTION_TEMPLATES order (not connectedServices order)", () => {
    const out = buildSuggestions([svc("github"), svc("gmail"), svc("slack")]);
    expect(out.map((s) => s.title)).toEqual([
      "Résumer mes emails non lus",
      "Mes messages Slack non lus",
      "Mes PRs à reviewer",
    ]);
  });

  it("ignores unknown service ids gracefully", () => {
    const out = buildSuggestions([svc("gmail"), svc("zzz_unknown")]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Résumer mes emails non lus");
  });

  it("ids are zero-padded sequentially (01..04)", () => {
    const out = buildSuggestions([
      svc("gmail"),
      svc("calendar"),
      svc("drive"),
      svc("slack"),
    ]);
    expect(out.map((s) => s.id)).toEqual(["01", "02", "03", "04"]);
  });

  it("subtitles always populated (no empty strings)", () => {
    const out = buildSuggestions([svc("gmail"), svc("github")]);
    expect(out.every((s) => s.subtitle.length > 0)).toBe(true);
  });

  it("falls back when only an unknown service is connected", () => {
    const out = buildSuggestions([svc("zzz_unknown")]);
    expect(out).toHaveLength(4);
    expect(out[0].title).toBe("Connecter mes outils");
  });
});
