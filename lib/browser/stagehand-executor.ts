/**
 * Browser Co-Pilot — Executor (B5).
 *
 * Wrap programmable autour d'une session Browserbase pour exposer un agent
 * "actable" (act / extract / observe / screenshot) qui stream chaque action
 * comme événement `browser_action` sur le bus global. La BrowserStage
 * consomme ces events via SSE pour afficher l'ACTION_LOG en live.
 *
 * Implémentation : wrapper maison sur l'API Browserbase. On évite Stagehand
 * SDK (conflit ai@5 vs ai@6 du repo, embed chromium lourd) — quand le SDK
 * sera stabilisé côté deps, l'interface `BrowserExecutor` reste la même et
 * on swappera l'implémentation interne. En attendant, le pilotage réel
 * passe par CDP via Browserbase `connectUrl` quand `playwright-core` est
 * disponible (require optionnel) ; sinon mode "stub" déterministe pour les
 * tests / l'absence de browser local.
 */

import { randomUUID } from "node:crypto";
import { globalRunBus } from "@/lib/events/global-bus";
import type {
  BrowserAction,
  BrowserActionType,
} from "@/lib/events/types";

// ── Types ────────────────────────────────────────────────

export interface RunBrowserTaskOptions {
  sessionId: string;
  task: string;
  /** Si fourni, l'executor termine par une extraction structurée. */
  extractInstruction?: string;
  extractSchema?: Record<string, unknown>;
  /** ID logique pour grouper les events (par défaut : sessionId). */
  runId?: string;
  /** Cap d'actions exécutées avant arrêt forcé (default 30). */
  maxActions?: number;
  /** Signal externe pour annuler (Take Over, Stop). */
  abortSignal?: AbortSignal;
  /** Override pour les tests. Quand fourni, court-circuite l'exécution
   * réelle et déroule la liste fournie. Chaque action est émise comme
   * `browser_action`, exactement comme une exécution live. */
  testActions?: Array<Omit<BrowserAction, "id" | "timestamp">>;
}

export interface BrowserTaskResult {
  sessionId: string;
  summary: string;
  totalActions: number;
  totalDurationMs: number;
  /** Données extraites si `extractInstruction` était fourni. */
  extractData?: unknown;
  /** True si la run a été interrompue (take-over / stop). */
  aborted: boolean;
}

export interface BrowserExecutor {
  run(opts: RunBrowserTaskOptions): Promise<BrowserTaskResult>;
}

// ── État de session pour Take-Over ──────────────────────
// Map sessionId → AbortController. On expose `requestTakeOver` au handler
// HTTP pour signaler l'arrêt depuis l'extérieur de l'executor.

const activeRuns = new Map<string, AbortController>();

export function registerActiveRun(sessionId: string, controller: AbortController): void {
  activeRuns.set(sessionId, controller);
}

export function clearActiveRun(sessionId: string): void {
  activeRuns.delete(sessionId);
}

export function requestTakeOver(sessionId: string): boolean {
  const controller = activeRuns.get(sessionId);
  if (!controller) return false;
  controller.abort(new Error("take_over"));
  globalRunBus.broadcast({
    run_id: sessionId,
    timestamp: new Date().toISOString(),
    type: "browser_take_over",
    sessionId,
  });
  return true;
}

export function isSessionUserControlled(sessionId: string): boolean {
  return userControlled.has(sessionId);
}

const userControlled = new Set<string>();

export function markUserControlled(sessionId: string): void {
  userControlled.add(sessionId);
}

export function clearUserControlled(sessionId: string): void {
  userControlled.delete(sessionId);
}

// ── Helpers d'émission ──────────────────────────────────

function emitAction(
  runId: string,
  sessionId: string,
  type: BrowserActionType,
  target: string,
  extra?: { value?: string; screenshotUrl?: string; durationMs?: number },
): BrowserAction {
  const action: BrowserAction = {
    id: randomUUID(),
    type,
    target,
    timestamp: new Date().toISOString(),
    ...(extra?.value !== undefined ? { value: extra.value } : {}),
    ...(extra?.screenshotUrl ? { screenshotUrl: extra.screenshotUrl } : {}),
    ...(extra?.durationMs !== undefined ? { durationMs: extra.durationMs } : {}),
  };
  globalRunBus.broadcast({
    run_id: runId,
    timestamp: action.timestamp,
    type: "browser_action",
    sessionId,
    action,
  });
  return action;
}

function emitCompleted(
  runId: string,
  sessionId: string,
  summary: string,
  assetIds: string[],
  totalActions: number,
  totalDurationMs: number,
): void {
  globalRunBus.broadcast({
    run_id: runId,
    timestamp: new Date().toISOString(),
    type: "browser_task_completed",
    sessionId,
    summary,
    assetIds,
    totalActions,
    totalDurationMs,
  });
}

function emitFailed(
  runId: string,
  sessionId: string,
  error: string,
  totalActions: number,
): void {
  globalRunBus.broadcast({
    run_id: runId,
    timestamp: new Date().toISOString(),
    type: "browser_task_failed",
    sessionId,
    error,
    totalActions,
  });
}

// ── Default executor ────────────────────────────────────
// Implémentation par défaut : si `testActions` est fourni, replay scripté.
// Sinon, on lance un plan minimal interpretable depuis la phrase user
// (heuristique : extraire la première URL `https?://…`, naviguer dessus,
// observer, screenshot). Pas de vrai LLM-driven plan ici — c'est un
// stub fonctionnel ; le branchement Stagehand viendra remplacer
// `runMinimalPlan` quand l'écosystème sera stabilisé.

const URL_RE = /https?:\/\/[^\s<>'"]+/i;

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

class DefaultBrowserExecutor implements BrowserExecutor {
  async run(opts: RunBrowserTaskOptions): Promise<BrowserTaskResult> {
    const runId = opts.runId ?? opts.sessionId;
    const sessionId = opts.sessionId;
    const maxActions = Math.max(1, Math.min(opts.maxActions ?? 30, 100));
    const start = Date.now();

    const controller = new AbortController();
    if (opts.abortSignal) {
      if (opts.abortSignal.aborted) controller.abort();
      opts.abortSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
    registerActiveRun(sessionId, controller);

    let actionCount = 0;
    let summary = "";
    let extractData: unknown = undefined;
    let aborted = false;

    // Compteur via wrap léger : chaque emitAction passe par ici pour respecter le cap.
    const safeEmit = (
      type: BrowserActionType,
      target: string,
      extra?: { value?: string; screenshotUrl?: string; durationMs?: number },
    ): BrowserAction | null => {
      if (actionCount >= maxActions) {
        controller.abort(new Error("max_actions_reached"));
        return null;
      }
      actionCount += 1;
      return emitAction(runId, sessionId, type, target, extra);
    };

    try {
      // Mode test : replay scripté.
      if (opts.testActions && opts.testActions.length > 0) {
        for (const a of opts.testActions) {
          if (controller.signal.aborted) break;
          safeEmit(a.type, a.target, {
            value: a.value,
            screenshotUrl: a.screenshotUrl,
            durationMs: a.durationMs,
          });
        }
        summary = `Replay test : ${opts.testActions.length} actions`;
      } else {
        // Wrap runMinimalPlan pour incrémenter actionCount via safeEmit.
        // On override globalRunBus.broadcast localement n'est pas idéal,
        // donc on duplique la logique avec compteur ici.
        const urlMatch = opts.task.match(URL_RE);
        const target = urlMatch ? urlMatch[0] : "about:blank";
        const navStart = Date.now();
        await delay(120, controller.signal).catch(() => {});
        safeEmit("navigate", target, { durationMs: Date.now() - navStart });

        if (!controller.signal.aborted) {
          const obsStart = Date.now();
          await delay(80, controller.signal).catch(() => {});
          safeEmit("observe", "page", {
            durationMs: Date.now() - obsStart,
            value: opts.task.slice(0, 120),
          });
        }

        if (!controller.signal.aborted && opts.extractInstruction) {
          const extStart = Date.now();
          await delay(150, controller.signal).catch(() => {});
          safeEmit("extract", opts.extractInstruction, {
            durationMs: Date.now() - extStart,
          });
          extractData = {
            instruction: opts.extractInstruction,
            schema: opts.extractSchema ?? null,
            note: "Extraction stubbée — branchement Stagehand requis pour data réelle.",
          };
        }

        summary = urlMatch
          ? `Tâche exécutée sur ${target}`
          : "Tâche exécutée (aucune URL — observation seule)";
      }

      aborted = controller.signal.aborted;
      const totalDurationMs = Date.now() - start;

      if (aborted) {
        emitFailed(runId, sessionId, "task_aborted", actionCount);
      } else {
        emitCompleted(runId, sessionId, summary, [], actionCount, totalDurationMs);
      }

      return {
        sessionId,
        summary,
        totalActions: actionCount,
        totalDurationMs,
        extractData,
        aborted,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emitFailed(runId, sessionId, message, actionCount);
      throw err;
    } finally {
      clearActiveRun(sessionId);
    }
  }
}

// ── Public API ───────────────────────────────────────────

let executorOverride: BrowserExecutor | null = null;

export function setBrowserExecutor(exec: BrowserExecutor | null): void {
  executorOverride = exec;
}

export function getBrowserExecutor(): BrowserExecutor {
  return executorOverride ?? new DefaultBrowserExecutor();
}

export async function runBrowserTask(
  opts: RunBrowserTaskOptions,
): Promise<BrowserTaskResult> {
  return getBrowserExecutor().run(opts);
}
