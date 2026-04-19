/**
 * @deprecated Legacy v1 orchestrator — will be removed after full migration to v2.
 * Use lib/orchestrator/entry.ts (orchestrateV2) for new integrations.
 *
 * Orchestrator — minimal backend state machine for /api/chat.
 *
 * Guarantees: every request ends with either
 *   { type: "final", content: "..." }  or
 *   { type: "final", content: "Erreur. Réessayez.", error: true }
 *
 * States: CLASSIFY → DECIDE → STREAM_RESULT → COMPLETE | ERROR
 *
 * The orchestrator does NOT fetch data. Data retrieval is delegated
 * to the LLM via capability-driven tools (get_messages, etc.).
 *
 * DECIDE transitions:
 *   mode=chat        → STREAM_RESULT (LLM only)
 *   mode=informative → STREAM_RESULT (LLM + tools)
 *   mode=action      → STREAM_RESULT (LLM + tools)
 *   mode=navigation  → STREAM_RESULT (LLM describes, no auto-nav)
 *   mode=blocked     → ERROR (blockedReason sent as final, no LLM)
 */

import { checkRequiredServices, buildBlockedMessage } from "@/lib/services/check-required-services";

export type OrchestratorState =
  | "CLASSIFY"
  | "DECIDE"
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

const MSG_KEYWORDS = [
  "email", "emails", "mail", "mails", "message", "messages",
  "inbox", "boîte", "non lus", "urgents", "courrier",
  "résume", "résumer", "lis mes", "slack",
];
const CAL_KEYWORDS = ["agenda", "réunion", "rendez-vous", "événement", "calendrier", "planning"];
const FILE_KEYWORDS = ["fichier", "fichiers", "document", "documents", "drive"];

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
): { mode: OrchestratorMode; blockedReason?: string } {
  const lower = message.toLowerCase();

  // Navigation — explicit keywords only (spec: never auto-navigate)
  const NAV_KW = ["va dans", "va sur", "ouvre", "navigue vers", "aller sur", "aller dans"];
  if (NAV_KW.some((k) => lower.includes(k))) return { mode: "navigation" };

  // Managed agent — complex/autonomous tasks
  if (MANAGED_PATTERNS.some((p) => lower.includes(p))) {
    return { mode: "managed" };
  }

  if (MSG_KEYWORDS.some((k) => lower.includes(k))) return { mode: "action" };
  if (CAL_KEYWORDS.some((k) => lower.includes(k))) return { mode: "action" };
  if (FILE_KEYWORDS.some((k) => lower.includes(k))) return { mode: "action" };

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

  if (MSG_KEYWORDS.some((k) => lower.includes(k))) return "inbox_summary";
  if (CAL_KEYWORDS.some((k) => lower.includes(k))) return "calendar_events";
  if (FILE_KEYWORDS.some((k) => lower.includes(k))) return "drive_files";

  // Surface-driven intents (informative mode, no home — home is multi-service)
  if (mode === "informative") {
    if (surface === "inbox")    return "inbox_summary";
    if (surface === "calendar") return "calendar_summary";
    if (surface === "files")    return "drive_summary";
  }

  return null;
}

/* ─── Main pipeline ─── */

/**
 * Run the orchestrator pipeline (pre-LLM).
 *
 * - Returns blockedReason  → caller skips LLM, sends final immediately.
 * - Otherwise returns finalState="STREAM_RESULT" → LLM handles via tools.
 */
export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  const { message, surface, userId, connectedServices, selectedItem } = input;

  // ── CLASSIFY ──
  log("CLASSIFY", `surface=${surface} services=[${(connectedServices ?? []).join(",")}] msg="${message.slice(0, 40)}"`);
  const { mode, blockedReason } = classify(message, surface);

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
      finalState: "STREAM_RESULT",
      managedPrompt: message,
    };
  }

  // ── CONTEXT (lightweight, no data fetch) ──
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

  const contextBlock = parts.length > 0 ? `\n\n## Contexte\n${parts.join("\n")}` : "";

  // ── DECIDE ──
  log("DECIDE", `mode=${mode}`);

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

  console.log(`[ORCH] NO_PREFETCH — data retrieval delegated to LLM tools`);
  log("STREAM_RESULT", `mode=${mode}`);

  return {
    mode,
    contextBlock,
    finalState: "STREAM_RESULT",
  };
}
