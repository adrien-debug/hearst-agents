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
import Anthropic from "@anthropic-ai/sdk";
import { globalRunBus } from "@/lib/events/global-bus";
import type {
  BrowserAction,
  BrowserActionType,
} from "@/lib/events/types";
import {
  getBrowserContext,
  type PlaywrightBridge,
} from "./playwright-bridge";

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

    let bridge: PlaywrightBridge | null = null;
    const TIMEOUT_MS = 5 * 60_000; // 5 min hard cap
    const startedAt = Date.now();
    const deadline = startedAt + TIMEOUT_MS;

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
        // Plan minimal réel : connect CDP via playwright-core (si dispo),
        // navigue sur l'URL extraite, capture screenshot + HTML, observe.
        // Si playwright indispo → mode "stub-light" (pas d'action navigate
        // réelle, mais on émet quand même les events pour ne pas casser
        // les UIs qui les consomment).
        const urlMatch = opts.task.match(URL_RE);
        const target = urlMatch ? urlMatch[0] : "about:blank";

        try {
          bridge = await getBrowserContext({ sessionId });
        } catch (err) {
          console.warn(
            "[stagehand-executor] connectOverCDP failed, fallback to stub-light :",
            err instanceof Error ? err.message : err,
          );
        }

        if (bridge && urlMatch && !controller.signal.aborted) {
          // ── Real navigation
          const navStart = Date.now();
          try {
            await bridge.page.goto(target, {
              waitUntil: "domcontentloaded",
              timeout: 30_000,
            });
            await bridge.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
          } catch (err) {
            console.warn(
              "[stagehand-executor] page.goto error :",
              err instanceof Error ? err.message : err,
            );
          }
          let screenshotUrl: string | undefined;
          try {
            const buf = await bridge.page.screenshot({ type: "png" });
            // base64 inline data URL — le consumer SSE peut l'afficher direct
            // sans round-trip storage. Cap 1MB pour ne pas saturer le stream.
            if (buf.length < 1_000_000) {
              screenshotUrl = `data:image/png;base64,${buf.toString("base64")}`;
            }
          } catch {
            // ignore
          }
          safeEmit("navigate", bridge.page.url(), {
            durationMs: Date.now() - navStart,
            screenshotUrl,
          });
        } else {
          const navStart = Date.now();
          await delay(80, controller.signal).catch(() => {});
          safeEmit("navigate", target, { durationMs: Date.now() - navStart });
        }

        if (!controller.signal.aborted && Date.now() < deadline) {
          const obsStart = Date.now();
          let observeValue = opts.task.slice(0, 120);
          if (bridge) {
            try {
              const title = await bridge.page.title();
              observeValue = `${title} — ${bridge.page.url()}`;
            } catch {
              // ignore
            }
          } else {
            await delay(80, controller.signal).catch(() => {});
          }
          safeEmit("observe", "page", {
            durationMs: Date.now() - obsStart,
            value: observeValue,
          });
        }

        if (
          !controller.signal.aborted &&
          opts.extractInstruction &&
          Date.now() < deadline
        ) {
          const extStart = Date.now();
          if (bridge) {
            try {
              extractData = await extractStructured({
                page: bridge.page,
                instruction: opts.extractInstruction,
                schema: opts.extractSchema,
              });
            } catch (err) {
              console.warn(
                "[stagehand-executor] extractStructured error :",
                err instanceof Error ? err.message : err,
              );
              extractData = {
                instruction: opts.extractInstruction,
                schema: opts.extractSchema ?? null,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          } else {
            await delay(80, controller.signal).catch(() => {});
            extractData = {
              instruction: opts.extractInstruction,
              schema: opts.extractSchema ?? null,
              note: "playwright-core indisponible — extraction non réalisée",
            };
          }
          safeEmit("extract", opts.extractInstruction, {
            durationMs: Date.now() - extStart,
          });
        }

        summary = bridge
          ? urlMatch
            ? `Navigation réelle sur ${target}`
            : "Tâche exécutée (aucune URL — observation seule)"
          : urlMatch
            ? `Tâche exécutée sur ${target} (mode dégradé)`
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
      if (bridge) {
        await bridge.close().catch(() => {});
      }
      clearActiveRun(sessionId);
    }
  }
}

// ── Structured extraction ────────────────────────────────
// Appelle Claude Haiku avec le HTML cleané + le schema cible. On rogne le
// HTML à 30k chars pour rester sous les limites tokens. Pas de cheerio
// (deps additionnelle évitée) — strip simple via regex.

function cleanHtml(raw: string): string {
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30_000);
}

async function extractStructured(opts: {
  page: import("./playwright-bridge").PlaywrightPage;
  instruction: string;
  schema?: Record<string, unknown>;
}): Promise<unknown> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      instruction: opts.instruction,
      schema: opts.schema ?? null,
      error: "no_anthropic_key",
    };
  }
  const html = await opts.page.content().catch(() => "");
  const cleaned = cleanHtml(html);

  const client = new Anthropic();
  const system = [
    "Tu es un extracteur de données structurées depuis du HTML.",
    "Réponds UNIQUEMENT en JSON valide qui matche le schéma fourni.",
    "Pas de markdown fence, pas de texte autour.",
    "Si une donnée n'est pas trouvable, mets `null` plutôt que d'inventer.",
  ].join("\n");

  const user = [
    "Instruction :",
    opts.instruction,
    "",
    opts.schema
      ? `Schéma JSON cible :\n${JSON.stringify(opts.schema, null, 2)}`
      : "Schéma : pas de contrainte stricte, retourne un objet plat raisonnable.",
    "",
    "HTML nettoyé de la page :",
    cleaned,
  ].join("\n");

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) {
    return { instruction: opts.instruction, schema: opts.schema ?? null, raw: text };
  }
  try {
    return JSON.parse(m[0]);
  } catch {
    return { instruction: opts.instruction, schema: opts.schema ?? null, raw: text };
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
