/**
 * Cockpit "Today" — Orchestrateur d'agrégation pour la home Stage.
 *
 * Compose un payload unique consommé par /api/v2/cockpit/today qui alimente
 * le CockpitStage (Hero briefing + Watchlist KPIs + Missions running +
 * Suggestions + Reports favoris + Agenda).
 *
 * Fail-soft : chaque source est isolée. Une erreur sur l'une ne casse pas
 * les autres — la section apparaîtra simplement vide (ou en empty state).
 *
 * Sources actuelles :
 *  - Briefing : conversation-summary (sans appel LLM ici, on lit juste le
 *    cache existant pour éviter le coût d'un Anthropic call sur chaque
 *    chargement de la home).
 *  - Missions running : ops-store + state adapter.
 *  - Reports favoris : top du catalogue (pas de signal d'usage encore
 *    persisté → on retourne les premiers du CATALOG comme proxy pour MVP).
 *  - Suggestions : applicable reports calculées via connections + catalog.
 *  - Watchlist & Agenda : MOCK pour MVP (sources live = phase B).
 */

import { CATALOG, getApplicableReports } from "@/lib/reports/catalog";
import { getAllMissionOps } from "@/lib/engine/runtime/missions/ops-store";
import { getScheduledMissions } from "@/lib/engine/runtime/state/adapter";
import { getAllMissions as getMemoryMissions } from "@/lib/engine/runtime/missions/store";
import { getConnectionsByScope } from "@/lib/connectors/control-plane/store";
import { getAllServiceIds, getProviderIdForService } from "@/lib/integrations/service-map";
import { getSummary } from "@/lib/memory/conversation-summary";
import { loadLatestInboxBrief } from "@/lib/inbox/store";
import type { InboxBrief } from "@/lib/inbox/inbox-brief";
import { getTenantIndustry, type TenantIndustry } from "@/lib/verticals/hospitality";
import {
  getMockKpiSnapshot,
  getMockArrivals,
  getMockServiceRequests,
} from "@/lib/verticals/hospitality/mock-data";
import { getLiveWatchlist } from "./watchlist-live";
import { getLiveAgenda } from "./agenda-live";

export interface CockpitScope {
  userId: string;
  tenantId: string;
  workspaceId: string;
}

export interface CockpitBriefing {
  headline: string;
  body: string | null;
  generatedAt: number | null;
  /** True quand on n'a aucun signal user → on affiche un empty state CTA. */
  empty: boolean;
}

export interface CockpitWatchlistItem {
  id: string;
  label: string;
  value: string;
  delta: string | null;
  /** Variation sur 7 derniers points (sparkline). */
  trend: number[];
  source: "mock" | "live";
}

export interface CockpitMission {
  id: string;
  name: string;
  status: "idle" | "running" | "success" | "failed" | "blocked";
  runningSince: number | null;
  lastRunAt: number | null;
  lastError: string | null;
}

export interface CockpitSuggestion {
  id: string;
  title: string;
  description: string;
  status: "ready" | "partial";
  requiredApps: ReadonlyArray<string>;
  missingApps: ReadonlyArray<string>;
}

export interface CockpitFavoriteReport {
  id: string;
  title: string;
  domain: string;
}

export interface CockpitAgendaItem {
  id: string;
  title: string;
  startsAt: number;
  source: "mock" | "live";
}

export interface CockpitInboxSection {
  brief: InboxBrief | null;
  /** True quand le brief est plus vieux que 1h ou inexistant → propose Refresh. */
  stale: boolean;
  /** True quand l'utilisateur n'a connecté ni Gmail ni Slack → CTA /apps. */
  needsConnection: boolean;
}

export interface CockpitHospitalityVipArrival {
  guestName: string;
  room: string;
  eta: string;
  specialRequest: string | null;
}

export interface CockpitHospitalityServiceRequest {
  id: string;
  guestName: string;
  room: string;
  type: string;
  priority: "low" | "normal" | "urgent";
  text: string;
}

export interface CockpitHospitalitySection {
  occupancy: number;
  occupancyYesterday: number;
  occupancyForecast: number;
  adr: number;
  revpar: number;
  arrivalsCount: number;
  vipCount: number;
  pendingServiceRequests: number;
  vipArrivals: CockpitHospitalityVipArrival[];
  urgentRequests: CockpitHospitalityServiceRequest[];
  /** "demo" tant qu'aucun PMS connecté — UI peut afficher un badge. */
  source: "demo" | "live";
}

export interface CockpitTodayPayload {
  briefing: CockpitBriefing;
  agenda: CockpitAgendaItem[];
  missionsRunning: CockpitMission[];
  watchlist: CockpitWatchlistItem[];
  suggestions: CockpitSuggestion[];
  favoriteReports: CockpitFavoriteReport[];
  inbox: CockpitInboxSection;
  /** Industry du tenant — drive l'affichage de sections verticales. */
  industry: TenantIndustry;
  /** Présent uniquement si industry === "hospitality". */
  hospitality: CockpitHospitalitySection | null;
  /** Sections qui sont en mock (UI peut afficher un badge "demo data"). */
  mockSections: ReadonlyArray<"watchlist" | "agenda" | "hospitality">;
  generatedAt: number;
}

const MAX_MISSIONS_RUNNING = 4;
const MAX_SUGGESTIONS = 3;
const MAX_FAVORITE_REPORTS = 3;
const MAX_AGENDA_ITEMS = 4;

/**
 * Fail-soft wrapper : exécute le getter, retourne fallback si throw.
 * Centralisé pour cohérence + log unique.
 */
async function safe<T>(label: string, fn: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[cockpit/today] source "${label}" en erreur, fallback appliqué:`, err);
    return fallback;
  }
}

async function buildBriefing(scope: CockpitScope): Promise<CockpitBriefing> {
  const summary = await safe("briefing.summary", () => getSummary(scope.userId), "");

  if (!summary || summary.trim().length === 0) {
    return {
      headline: "Bienvenue",
      body: null,
      generatedAt: null,
      empty: true,
    };
  }

  // getSummary peut retourner soit un vrai briefing structuré (LLM-généré
  // avec doubles newlines), soit la concaténation brute des messages d'une
  // conversation. On extrait headline + premier paragraphe utile et on cap
  // à 360 chars max pour garder le cockpit lisible (le briefing complet
  // reste accessible via Voice ou /assets briefings).
  const trimmed = summary.trim();
  const split = trimmed.split(/\n{2,}/);
  const firstNonEmpty = split.find((p) => p.trim().length > 0) ?? trimmed;
  const headline = firstNonEmpty.trim().slice(0, 160);
  const remainder = split
    .slice(1)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join("\n\n");
  const bodyRaw = remainder.length > 0 ? remainder : "";
  const body = bodyRaw.length > 360 ? `${bodyRaw.slice(0, 360).trim()}…` : bodyRaw || null;

  return {
    headline,
    body,
    generatedAt: Date.now(),
    empty: false,
  };
}

async function buildMissionsRunning(scope: CockpitScope): Promise<CockpitMission[]> {
  const opsMap = getAllMissionOps();

  // Pour résoudre nom + scope d'une op (la map ne stocke que l'état runtime),
  // on join sur les missions persistées + en mémoire.
  let missions = await safe(
    "missions.scheduled",
    () =>
      getScheduledMissions({
        userId: scope.userId,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      }),
    [] as Awaited<ReturnType<typeof getScheduledMissions>>,
  );

  if (missions.length === 0) {
    missions = getMemoryMissions()
      .filter(
        (m) =>
          m.userId === scope.userId &&
          m.tenantId === scope.tenantId &&
          m.workspaceId === scope.workspaceId,
      )
      .map((m) => ({
        id: m.id,
        tenantId: m.tenantId,
        workspaceId: m.workspaceId,
        userId: m.userId,
        name: m.name,
        input: m.input,
        schedule: m.schedule,
        enabled: m.enabled,
        createdAt: m.createdAt,
        lastRunAt: m.lastRunAt,
        lastRunId: m.lastRunId,
      }));
  }

  const knownIds = new Set<string>();
  const enriched: CockpitMission[] = missions.map((m) => {
    knownIds.add(m.id);
    const live = opsMap.get(m.id);
    return {
      id: m.id,
      name: m.name,
      status: (live?.status ?? m.lastRunStatus ?? "idle") as CockpitMission["status"],
      runningSince: live?.runningSince ?? null,
      lastRunAt: live?.lastRunAt ?? m.lastRunAt ?? null,
      lastError: live?.lastError ?? m.lastError ?? null,
    };
  });

  // Inclure aussi les ops orphelines (mission absente du store persisté
  // mais présente dans la map runtime — ex: mission lancée puis le scheduler
  // a redémarré et perdu sa référence). On évite ainsi un cockpit "vide"
  // alors que des jobs tournent vraiment.
  for (const [missionId, op] of opsMap.entries()) {
    if (knownIds.has(missionId)) continue;
    enriched.push({
      id: missionId,
      name: missionId,
      status: op.status,
      runningSince: op.runningSince ?? null,
      lastRunAt: op.lastRunAt ?? null,
      lastError: op.lastError ?? null,
    });
  }

  // Tri : running first, puis par lastRunAt desc.
  enriched.sort((a, b) => {
    if (a.status === "running" && b.status !== "running") return -1;
    if (b.status === "running" && a.status !== "running") return 1;
    return (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0);
  });

  return enriched
    .filter((m) => m.status === "running" || m.lastRunAt)
    .slice(0, MAX_MISSIONS_RUNNING);
}

async function buildSuggestions(scope: CockpitScope): Promise<CockpitSuggestion[]> {
  const conns = await safe(
    "suggestions.connections",
    () =>
      getConnectionsByScope({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        userId: scope.userId,
      }),
    [] as Awaited<ReturnType<typeof getConnectionsByScope>>,
  );

  const connectedProviders = conns
    .filter((c) => c.status === "connected")
    .map((c) => c.provider);

  if (connectedProviders.length === 0) return [];

  const providerSet = new Set(connectedProviders);
  const connectedServiceIds = getAllServiceIds().filter((sid) => {
    const pid = getProviderIdForService(sid);
    return pid !== undefined && providerSet.has(pid);
  });

  const applicable = getApplicableReports([
    ...connectedProviders,
    ...connectedServiceIds,
  ]);

  return applicable
    .filter(
      (r): r is typeof r & { status: "ready" | "partial" } =>
        r.status === "ready" || r.status === "partial",
    )
    .slice(0, MAX_SUGGESTIONS)
    .map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      requiredApps: r.requiredApps,
      missingApps: r.missingApps,
    }));
}

function buildFavoriteReports(): CockpitFavoriteReport[] {
  // MVP : on prend les 3 premiers du catalog comme "favoris par défaut".
  // Phase B : ranking par usage utilisateur (table report_runs).
  return CATALOG.slice(0, MAX_FAVORITE_REPORTS).map((c) => ({
    id: c.id,
    title: c.title,
    domain: String(c.domain),
  }));
}

// Watchlist mock retiré 2026-05-01 (Phase B3) — getLiveWatchlist gère
// déjà tout. Si Stripe/HubSpot ne sont pas connectés via Composio, la
// watchlist remonte vide ; l'UI affiche un empty state honnête avec CTA
// vers /apps. Plus de fake KPI à "—" qui camouflait la vraie cause.

// Agenda mock retiré — l'agenda live (lib/cockpit/agenda-live.ts) gère
// déjà le fallback vide quand Calendar n'est pas connecté.

const INBOX_STALE_MS = 60 * 60_000; // 1h

async function buildInbox(scope: CockpitScope): Promise<CockpitInboxSection> {
  const conns = await safe(
    "inbox.connections",
    () =>
      getConnectionsByScope({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        userId: scope.userId,
      }),
    [] as Awaited<ReturnType<typeof getConnectionsByScope>>,
  );

  const connectedProviders = new Set(
    conns.filter((c) => c.status === "connected").map((c) => c.provider),
  );
  const hasGmail = connectedProviders.has("google") || connectedProviders.has("gmail");
  const hasSlack = connectedProviders.has("slack");
  const needsConnection = !hasGmail && !hasSlack;

  const brief = await safe<InboxBrief | null>(
    "inbox.latest",
    () => loadLatestInboxBrief(scope.userId),
    null,
  );

  const ageMs = brief ? Date.now() - brief.generatedAt : Infinity;
  const stale = !brief || ageMs > INBOX_STALE_MS;

  // Filtre les snoozed jusqu'à demain
  const filteredItems = brief
    ? brief.items.filter((it) => !it.snoozedUntil || it.snoozedUntil <= Date.now())
    : [];

  return {
    brief: brief ? { ...brief, items: filteredItems } : null,
    stale,
    needsConnection,
  };
}

function buildHospitalitySection(): CockpitHospitalitySection {
  const snap = getMockKpiSnapshot();
  const arrivals = getMockArrivals();
  const requests = getMockServiceRequests();
  return {
    occupancy: snap.occupancy,
    occupancyYesterday: snap.occupancyYesterday,
    occupancyForecast: snap.occupancyForecast,
    adr: snap.adr,
    revpar: snap.revpar,
    arrivalsCount: snap.arrivalsCount,
    vipCount: snap.vipCount,
    pendingServiceRequests: snap.pendingServiceRequests,
    vipArrivals: arrivals
      .filter((a) => a.vip)
      .map((a) => ({
        guestName: a.guestName,
        room: a.room,
        eta: a.eta,
        specialRequest: a.specialRequest,
      })),
    urgentRequests: requests
      .filter((r) => r.priority === "urgent")
      .map((r) => ({
        id: r.id,
        guestName: r.guestName,
        room: r.room,
        type: r.type,
        priority: r.priority,
        text: r.text,
      })),
    source: "demo",
  };
}

export async function getCockpitToday(scope: CockpitScope): Promise<CockpitTodayPayload> {
  const [briefing, missionsRunning, suggestions, inbox, industry] = await Promise.all([
    safe("briefing", () => buildBriefing(scope), {
      headline: "Bienvenue",
      body: null,
      generatedAt: null,
      empty: true,
    } satisfies CockpitBriefing),
    safe("missionsRunning", () => buildMissionsRunning(scope), [] as CockpitMission[]),
    safe("suggestions", () => buildSuggestions(scope), [] as CockpitSuggestion[]),
    safe(
      "inbox",
      () => buildInbox(scope),
      { brief: null, stale: true, needsConnection: false } satisfies CockpitInboxSection,
    ),
    safe<TenantIndustry>("industry", () => getTenantIndustry(scope.tenantId), "general"),
  ]);

  const favoriteReports = buildFavoriteReports();

  // Watchlist live (Stripe + HubSpot via Composio) — fail-soft : si throw
  // global, on retourne `[]` plutôt qu'un mock à 4 cards "—". L'UI rend
  // alors un empty state honnête ("Connecte Stripe + HubSpot pour activer
  // ta watchlist") plutôt que de camoufler la cause derrière des fake KPI.
  const liveWatchlist = await safe(
    "watchlist.live",
    () => getLiveWatchlist({ userId: scope.userId, tenantId: scope.tenantId }),
    [] as CockpitWatchlistItem[],
  );
  const watchlist = liveWatchlist;

  // Agenda live (Google Calendar via Composio) — fallback empty si throw.
  const liveAgenda = await safe(
    "agenda.live",
    () => getLiveAgenda({ userId: scope.userId, tenantId: scope.tenantId }),
    [] as CockpitAgendaItem[],
  );
  const agenda = liveAgenda.slice(0, MAX_AGENDA_ITEMS);

  const isHospitality = industry === "hospitality";
  const hospitality = isHospitality
    ? safeSync("hospitality", () => buildHospitalitySection(), null)
    : null;

  // Watchlist vide = pas de connecteur Stripe/HubSpot ou throw global.
  // L'UI affiche un empty state CTA → /apps. Plus de mock fallback.
  const watchlistIsLive = liveWatchlist.length > 0;
  const agendaIsLive = liveAgenda.length > 0;
  const mockSections: Array<"watchlist" | "agenda" | "hospitality"> = [];
  if (!watchlistIsLive) mockSections.push("watchlist");
  if (!agendaIsLive) mockSections.push("agenda");
  if (hospitality) mockSections.push("hospitality");

  return {
    briefing,
    agenda,
    missionsRunning,
    watchlist,
    suggestions,
    favoriteReports,
    inbox,
    industry,
    hospitality,
    mockSections,
    generatedAt: Date.now(),
  };
}

function safeSync<T>(label: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    console.warn(`[cockpit/today] sync source "${label}" en erreur, fallback:`, err);
    return fallback;
  }
}
