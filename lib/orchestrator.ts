/**
 * Orchestrator — minimal backend state machine for /api/chat.
 *
 * Guarantees: every request ends with either
 *   { type: "final", content: "..." }  or
 *   { type: "final", content: "Erreur. Réessayez.", error: true }
 *
 * States: CLASSIFY → FETCH_CONTEXT → DECIDE → EXECUTE | STREAM_RESULT → COMPLETE | ERROR
 *
 * DECIDE transitions:
 *   mode=chat        → STREAM_RESULT (LLM only)
 *   mode=informative → EXECUTE → STREAM_RESULT
 *   mode=action      → EXECUTE → STREAM_RESULT
 *   mode=navigation  → STREAM_RESULT (LLM describes, no auto-nav)
 *   mode=blocked     → ERROR (blockedReason sent as final, no LLM)
 */

import { getDataSnapshot, snapshotToText } from "@/lib/agent/data-functions";
import type { DataSnapshot } from "@/lib/agent/data-functions";
import { checkRequiredServices, buildBlockedMessage } from "@/lib/services/check-required-services";

export type OrchestratorState =
  | "CLASSIFY"
  | "FETCH_CONTEXT"
  | "DECIDE"
  | "EXECUTE"
  | "STREAM_RESULT"
  | "COMPLETE"
  | "ERROR";

export type OrchestratorMode = "chat" | "informative" | "action" | "navigation" | "blocked" | "managed";

export interface OrchestratorInput {
  message: string;
  surface: string;
  userId: string | null;
  connectedServices?: string[];
  selectedItem?: Record<string, unknown> | null;
}

export interface OrchestratorResult {
  mode: OrchestratorMode;
  contextBlock: string;
  finalState: OrchestratorState;
  /** Pre-executed mission result to inject into system prompt. */
  missionResult?: string;
  /** If set, skip LLM and send this as { type: "final" } immediately. */
  blockedReason?: string;
  /** Prompt to send to managed agent (only when mode=managed). */
  managedPrompt?: string;
}

/* ─── Logging ─── */

function log(state: OrchestratorState, detail?: string) {
  console.log(`[ORCH] STATE ${state}${detail ? ` — ${detail}` : ""}`);
}

/* ─── CLASSIFY ─── */

const SURFACE_LABELS: Record<string, string> = {
  inbox: "la boîte de réception",
  calendar: "l'agenda",
  files: "les fichiers",
  tasks: "les tâches",
  apps: "les applications",
};

const DATA_SURFACES = new Set(["home", "inbox", "calendar", "files"]);

/**
 * Patterns that indicate a complex/autonomous task best handled by a managed agent.
 * These tasks need a sandbox (bash, file ops, web search) rather than our data tools.
 */
const MANAGED_PATTERNS = [
  "analyse", "analyser", "recherche", "cherche sur le web", "cherche sur internet",
  "crée un script", "écris un script", "génère un rapport", "génère un fichier",
  "scanne le marché", "scan le marché", "surveille", "monitore",
  "compare", "évalue", "calcule",
  "scrape", "crawl", "télécharge",
  "résume ce document", "résume ce pdf", "résume ce lien", "résume cette page",
  "fais une recherche", "trouve des informations",
];

function classify(
  message: string,
  surface: string,
  connectedServices?: string[],
): { mode: OrchestratorMode; blockedReason?: string } {
  const lower = message.toLowerCase();
  const cs = (connectedServices ?? []).map((s) => s.toLowerCase());

  // Navigation — explicit keywords only (spec: never auto-navigate)
  const NAV_KW = ["va dans", "va sur", "ouvre", "navigue vers", "aller sur", "aller dans"];
  if (NAV_KW.some((k) => lower.includes(k))) return { mode: "navigation" };

  // Managed agent — complex/autonomous tasks
  if (MANAGED_PATTERNS.some((p) => lower.includes(p))) {
    return { mode: "managed" };
  }

  // Email / Gmail actions
  const EMAIL_KW = [
    "email", "emails", "mail", "mails", "message", "messages",
    "inbox", "boîte", "non lus", "urgents", "courrier",
    "résume", "résumer", "lis mes",
  ];
  const hasGoogle = cs.includes("google") || cs.includes("gmail");
  const hasSlack = cs.includes("slack");

  if (EMAIL_KW.some((k) => lower.includes(k))) {
    if (!hasGoogle) {
      return {
        mode: "blocked",
        blockedReason: "Gmail n'est pas connecté. Connecte-le dans Applications pour voir tes emails.",
      };
    }
    return { mode: "action" };
  }

  // Slack actions
  if (lower.includes("slack")) {
    if (!hasSlack) {
      return {
        mode: "blocked",
        blockedReason: "Slack n'est pas connecté. Connecte-le dans Applications.",
      };
    }
    return { mode: "action" };
  }

  // Calendar actions
  const CAL_KW = ["agenda", "réunion", "rendez-vous", "événement", "calendrier", "planning"];
  if (CAL_KW.some((k) => lower.includes(k))) {
    if (!hasGoogle) {
      return {
        mode: "blocked",
        blockedReason: "Google Calendar n'est pas connecté. Connecte-le dans Applications.",
      };
    }
    return { mode: "action" };
  }

  // Files actions
  const FILE_KW = ["fichier", "fichiers", "document", "documents", "drive"];
  if (FILE_KW.some((k) => lower.includes(k))) {
    if (!hasGoogle) {
      return {
        mode: "blocked",
        blockedReason: "Google Drive n'est pas connecté. Connecte-le dans Applications.",
      };
    }
    return { mode: "action" };
  }

  // Informative on data surfaces (user is on a surface with data)
  if (DATA_SURFACES.has(surface)) return { mode: "informative" };

  return { mode: "chat" };
}

/* ─── Intent inference ─── */

/**
 * Maps the current request to a named intent used by checkRequiredServices.
 * Returns null for chat/navigation (no required services).
 * Returns null for home surface (multi-service, graceful degradation).
 */
function inferIntent(message: string, surface: string, mode: OrchestratorMode): string | null {
  if (mode === "chat" || mode === "navigation") return null;

  const lower = message.toLowerCase();

  // Keyword-driven intents (action mode)
  const EMAIL_KW = ["email", "emails", "mail", "mails", "message", "messages",
    "inbox", "boîte", "non lus", "urgents", "courrier", "résume", "résumer", "lis mes"];
  if (EMAIL_KW.some((k) => lower.includes(k))) return "summarize_emails";

  if (lower.includes("slack")) return "slack_messages";

  const CAL_KW = ["agenda", "réunion", "rendez-vous", "événement", "calendrier", "planning"];
  if (CAL_KW.some((k) => lower.includes(k))) return "calendar_events";

  const FILE_KW = ["fichier", "fichiers", "document", "documents", "drive"];
  if (FILE_KW.some((k) => lower.includes(k))) return "drive_files";

  // Surface-driven intents (informative mode, no home — home is multi-service)
  if (mode === "informative") {
    if (surface === "inbox")    return "inbox_summary";
    if (surface === "calendar") return "calendar_summary";
    if (surface === "files")    return "drive_summary";
  }

  return null;
}

/* ─── EXECUTE ─── */

async function executeMission(snapshot: DataSnapshot, message: string): Promise<string | null> {
  const lower = message.toLowerCase();

  // Email mission
  const wantsEmail = ["email", "mail", "message", "inbox", "résume", "urgents", "non lus", "courrier", "boîte"].some(
    (k) => lower.includes(k),
  );
  if (snapshot.messages && wantsEmail) {
    const { items, stats } = snapshot.messages;
    if (items.length === 0) return "Aucun message récent.";
    const lines = items.map((m) => {
      const tag = m.priority === "urgent" ? " ⚠️ URGENT" : "";
      return `- [${m.source}] ${m.from} — ${m.subject}${tag} (${m.date})`;
    });
    return [
      `${stats.urgent} urgent(s) · ${stats.unread} non lu(s) · ${stats.total} au total`,
      "",
      ...lines,
    ].join("\n");
  }

  // Calendar mission
  const wantsCal = ["agenda", "réunion", "rendez-vous", "événement", "calendrier", "planning"].some((k) =>
    lower.includes(k),
  );
  if (snapshot.events && wantsCal) {
    const { items, total } = snapshot.events;
    if (items.length === 0) return "Aucun événement à venir cette semaine.";
    const lines = items.map(
      (e) => `- ${e.day} ${e.time} : ${e.title}${e.location ? ` (${e.location})` : ""}`,
    );
    return [`${total} événement(s) à venir :`, "", ...lines].join("\n");
  }

  // Files mission
  const wantsFiles = ["fichier", "document", "drive"].some((k) => lower.includes(k));
  if (snapshot.files && wantsFiles) {
    const { items, total } = snapshot.files;
    if (items.length === 0) return "Aucun fichier récent.";
    const lines = items.map(
      (f) => `- ${f.name}${f.shared ? " [partagé]" : ""} (${f.modified})`,
    );
    return [`${total} fichier(s) récent(s) :`, "", ...lines].join("\n");
  }

  return null;
}

/* ─── Main pipeline ─── */

/**
 * Run the orchestrator pipeline (pre-LLM).
 *
 * - Returns blockedReason  → caller skips LLM, sends final immediately.
 * - Returns missionResult  → caller injects it into system prompt.
 * - Always returns finalState="STREAM_RESULT" or "ERROR".
 */
export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  const { message, surface, userId, connectedServices, selectedItem } = input;

  // ── CLASSIFY ──
  log("CLASSIFY", `surface=${surface} services=[${(connectedServices ?? []).join(",")}] msg="${message.slice(0, 40)}"`);
  const { mode, blockedReason } = classify(message, surface, connectedServices);

  // ── DECIDE early-exit: blocked ──
  if (mode === "blocked") {
    log("DECIDE", `mode=blocked → ERROR`);
    log("ERROR", `reason="${blockedReason}"`);
    return { mode, contextBlock: "", finalState: "ERROR", blockedReason };
  }

  // ── DECIDE early-exit: managed agent ──
  if (mode === "managed") {
    log("DECIDE", `mode=managed → delegate to managed agent`);
    return {
      mode,
      contextBlock: "",
      finalState: "EXECUTE",
      managedPrompt: message,
    };
  }

  // ── FETCH_CONTEXT ──
  log("FETCH_CONTEXT", `mode=${mode}`);

  const parts: string[] = [];

  if (surface !== "home") {
    parts.push(`Surface active : ${SURFACE_LABELS[surface] ?? surface}`);
  }

  if (selectedItem) {
    const si = selectedItem as Record<string, string>;
    let desc = `Élément sélectionné : ${si.title ?? ""}`;
    if (si.from) desc += ` (de ${si.from})`;
    if (si.preview) desc += `\nAperçu : ${si.preview.slice(0, 200)}`;
    parts.push(desc);
  }

  if (connectedServices && connectedServices.length > 0) {
    parts.push(`Services connectés : ${connectedServices.join(", ")}`);
  }

  let snapshot: DataSnapshot = {};
  if (userId) {
    try {
      snapshot = await getDataSnapshot(userId, surface);
      const dataText = snapshotToText(snapshot);
      if (dataText) parts.push(`\n${dataText}`);
    } catch (err) {
      console.error("[ORCH] Data fetch failed:", err instanceof Error ? err.message : err);
    }
  }

  const contextBlock = parts.length > 0 ? `\n\n## Contexte\n${parts.join("\n")}` : "";

  // ── DECIDE ──
  log("DECIDE", `mode=${mode} contextLen=${contextBlock.length}`);

  // Server-side service gate — authoritative check via token-store
  // (independent of frontend-reported connectedServices)
  if (userId && (mode === "action" || mode === "informative")) {
    const intent = inferIntent(message, surface, mode);
    if (intent) {
      const check = await checkRequiredServices(intent, userId);
      if (!check.ok) {
        const reason = buildBlockedMessage(check.missing);
        log("ERROR", `missing services=[${check.missing}] intent=${intent}`);
        return { mode: "blocked", contextBlock: "", finalState: "ERROR", blockedReason: reason };
      }
    }
  }

  // ── EXECUTE (action + informative with data) ──
  let missionResult: string | undefined;
  if (mode === "action" || mode === "informative") {
    log("EXECUTE", `mode=${mode}`);
    try {
      const result = await executeMission(snapshot, message);
      if (result) {
        missionResult = result;
        console.log(`[ORCH] EXECUTE done — resultLen=${result.length}`);
      }
    } catch (err) {
      console.error("[ORCH] EXECUTE failed:", err instanceof Error ? err.message : err);
    }
  }

  log("STREAM_RESULT", `mode=${mode} hasMission=${!!missionResult}`);

  return {
    mode,
    contextBlock,
    finalState: "STREAM_RESULT",
    missionResult,
  };
}
