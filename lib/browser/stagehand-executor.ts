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
// Sinon, on lance le vrai agent loop LLM-driven (vague 9, action #4) :
//  - prefetch URL d'entrée si présente dans la task (heuristique inchangée)
//  - délègue à `runAgentLoop` (Sonnet + tool_use) pour la suite
//  - émet un browser_action par step exécuté
// Le mode "stub-light" (playwright-core indispo) reste : on émet juste un
// event navigate déterministe pour ne pas casser l'UI.

import { runAgentLoop, type AgentStep } from "./agent-loop";

const URL_RE = /https?:\/\/[^\s<>'"]+/i;

/** Mapping tool agent → BrowserActionType pour l'event log. */
function mapAgentToolToActionType(tool: AgentStep["tool"]): BrowserActionType | null {
  switch (tool) {
    case "navigate":
      return "navigate";
    case "click":
      return "click";
    case "fill":
      return "type";
    case "wait":
      return "wait";
    case "extract":
      return "extract";
    case "done":
      return null; // pas d'event distinct — le emitCompleted suffit
  }
}

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
        // Mode live : on essaye de connecter Playwright via Browserbase,
        // puis on délègue à `runAgentLoop` (Sonnet + tool_use) qui pilote
        // la page step-by-step. Chaque step exécuté est mappé en
        // `browser_action` event pour l'ActionLog UI.
        //
        // Si playwright-core est indispo → fallback "stub-light" : on émet
        // une action navigate déterministe à partir de la première URL de
        // la task pour ne pas casser les UIs SSE qui consomment ces events.
        const urlMatch = opts.task.match(URL_RE);
        const fallbackTarget = urlMatch ? urlMatch[0] : "about:blank";

        try {
          bridge = await getBrowserContext({ sessionId });
        } catch (err) {
          console.warn(
            "[stagehand-executor] connectOverCDP failed, fallback to stub-light :",
            err instanceof Error ? err.message : err,
          );
        }

        if (bridge && !controller.signal.aborted) {
          // Pré-chargement : si la task contient une URL, on navigue avant
          // de lancer le LLM. Ça donne à l'agent un contexte page de départ
          // au lieu de partir de about:blank (ça économe 1-2 steps).
          if (urlMatch) {
            const navStart = Date.now();
            try {
              await bridge.page.goto(fallbackTarget, {
                waitUntil: "domcontentloaded",
                timeout: 30_000,
              });
              await bridge.page
                .waitForLoadState("networkidle", { timeout: 15_000 })
                .catch(() => {});
            } catch (err) {
              console.warn(
                "[stagehand-executor] page.goto preload error :",
                err instanceof Error ? err.message : err,
              );
            }
            let screenshotUrl: string | undefined;
            try {
              const buf = await bridge.page.screenshot({ type: "png" });
              if (buf.length < 1_000_000) {
                screenshotUrl = `data:image/png;base64,${buf.toString("base64")}`;
              }
            } catch {
              /* ignore */
            }
            safeEmit("navigate", bridge.page.url(), {
              durationMs: Date.now() - navStart,
              screenshotUrl,
            });
          }

          // ── Agent loop LLM-driven ──────────────────────────────
          // Cap de steps cohérent avec le maxActions de l'executor.
          const remainingActions = Math.max(1, maxActions - actionCount);
          const agentResult = await runAgentLoop({
            task: opts.task,
            page: bridge.page,
            maxSteps: Math.min(remainingActions, 15),
            abortSignal: controller.signal,
            onStep: (step) => {
              const actionType = mapAgentToolToActionType(step.tool);
              if (!actionType) return;
              const target =
                step.tool === "navigate"
                  ? String(step.input.url ?? "")
                  : step.tool === "wait"
                    ? `${step.input.ms ?? 0}ms`
                    : String(step.input.selector ?? step.input.instruction ?? "");
              const value =
                step.tool === "fill"
                  ? String(step.input.value ?? "").slice(0, 120)
                  : step.result.ok
                    ? undefined
                    : `error: ${String(step.result.error ?? "").slice(0, 120)}`;
              safeEmit(actionType, target, {
                value,
                durationMs: step.durationMs,
              });
            },
          });

          // Si la tâche demandait explicitement une extraction et que
          // l'agent a appelé `extract` au cours du loop, on remonte les
          // données dans `extractData` (compat ancien contrat de l'executor).
          if (agentResult.extractedData !== undefined) {
            extractData = agentResult.extractedData;
          } else if (opts.extractInstruction && bridge) {
            // Fallback : l'agent n'a pas extrait → on appelle l'extracteur
            // structuré legacy. Garde l'ancien comportement pour les missions
            // qui passent un schema ad-hoc.
            const extStart = Date.now();
            try {
              extractData = await extractStructured({
                page: bridge.page,
                instruction: opts.extractInstruction,
                schema: opts.extractSchema,
              });
            } catch (err) {
              extractData = {
                instruction: opts.extractInstruction,
                schema: opts.extractSchema ?? null,
                error: err instanceof Error ? err.message : String(err),
              };
            }
            safeEmit("extract", opts.extractInstruction, {
              durationMs: Date.now() - extStart,
            });
          }

          summary = agentResult.summary || (urlMatch
            ? `Navigation sur ${fallbackTarget}`
            : "Tâche exécutée");
          if (agentResult.aborted) {
            controller.abort(new Error("agent_loop_aborted"));
          }
        } else {
          // Stub-light : pas de Playwright, on émet juste une action
          // navigate déterministe pour que l'UI ne soit pas vide.
          const navStart = Date.now();
          await delay(80, controller.signal).catch(() => {});
          safeEmit("navigate", fallbackTarget, {
            durationMs: Date.now() - navStart,
          });

          if (opts.extractInstruction) {
            extractData = {
              instruction: opts.extractInstruction,
              schema: opts.extractSchema ?? null,
              note: "playwright-core indisponible — extraction non réalisée",
            };
            safeEmit("extract", opts.extractInstruction, { durationMs: 0 });
          }

          summary = urlMatch
            ? `Tâche exécutée sur ${fallbackTarget} (mode dégradé)`
            : "Tâche exécutée (mode dégradé — playwright indisponible)";
        }
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
