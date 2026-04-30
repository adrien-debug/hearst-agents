/**
 * SSE Adapter — Transforms internal RunEvents to SSE for the UI.
 *
 * Not all internal events are exposed to the client.
 * This adapter filters and maps them to a client-friendly format.
 */

import type { RunEventBus } from "../bus";
import type { RunEvent } from "../types";

// Unicode ranges covering pictographs, dingbats, transport, regional flags,
// and the variation selector that often follows them. Conservative enough
// to leave plain punctuation, accents, and Latin / CJK / RTL letters alone.
const EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{1F004}\u{1F0CF}]/gu;

function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, "").replace(/[ \t]{2,}/g, " ");
}

// ── Provider derivation ─────────────────────────────────
// Composio tool names sont préfixés par le toolkit slug en MAJUSCULES :
// GMAIL_SEND_EMAIL, SLACK_POST_MESSAGE, NOTION_CREATE_PAGE, etc. On extrait
// le préfixe et on map les tools natifs vers leur provider de référence.

const NATIVE_TOOL_TO_PROVIDER: Record<string, { id: string; label: string }> = {
  generate_image: { id: "fal_ai", label: "fal.ai" },
  generate_video: { id: "fal_ai", label: "fal.ai" },
  execute_code: { id: "e2b", label: "E2B" },
  parse_document: { id: "llama_parse", label: "LlamaParse" },
  search_web: { id: "anthropic", label: "Web" },
  generate_report: { id: "anthropic", label: "Anthropic" },
  schedule_task: { id: "hearst", label: "Hearst" },
};

const PROVIDER_LABELS: Record<string, string> = {
  composio: "Composio",
  gmail: "Gmail",
  googlecalendar: "Calendar",
  googledrive: "Drive",
  googlesheets: "Sheets",
  googledocs: "Docs",
  slack: "Slack",
  notion: "Notion",
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  linear: "Linear",
  asana: "Asana",
  trello: "Trello",
  jira: "Jira",
  clickup: "ClickUp",
  monday: "Monday",
  airtable: "Airtable",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  pipedrive: "Pipedrive",
  zoho: "Zoho",
  zendesk: "Zendesk",
  intercom: "Intercom",
  freshdesk: "Freshdesk",
  helpscout: "HelpScout",
  stripe: "Stripe",
  quickbooks: "QuickBooks",
  xero: "Xero",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  whatsapp: "WhatsApp",
  twilio: "Twilio",
  vonage: "Vonage",
  discord: "Discord",
  microsoftteams: "Teams",
  sendgrid: "SendGrid",
  mailchimp: "Mailchimp",
  figma: "Figma",
  canva: "Canva",
  amplitude: "Amplitude",
  mixpanel: "Mixpanel",
  segment: "Segment",
  fal_ai: "fal.ai",
  anthropic: "Anthropic",
  e2b: "E2B",
  llama_parse: "LlamaParse",
  hearst: "Hearst",
};

function prettyLabel(slug: string): string {
  return PROVIDER_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function deriveProvider(
  tool: string,
  providerId?: string,
  providerLabel?: string,
): { providerId: string; providerLabel: string } {
  // 1. Override explicite si l'orchestrator l'a posé (sauf le générique
  //    "composio" qui n'est pas assez précis pour la pastille UI).
  if (providerId && providerId !== "composio") {
    return {
      providerId,
      providerLabel: providerLabel ?? prettyLabel(providerId),
    };
  }

  // 2. Tools natifs Hearst (slug en lowercase).
  const native = NATIVE_TOOL_TO_PROVIDER[tool];
  if (native) {
    return { providerId: native.id, providerLabel: native.label };
  }

  // 3. Composio : préfixe MAJUSCULE avant le premier `_`.
  const upper = tool.toUpperCase();
  const prefix = upper.split("_")[0];
  if (prefix && prefix === upper.slice(0, prefix.length)) {
    const slug = prefix.toLowerCase();
    return { providerId: slug, providerLabel: prettyLabel(slug) };
  }

  // 4. Fallback : on garde ce qu'on a.
  return {
    providerId: providerId ?? "composio",
    providerLabel: providerLabel ?? "Composio",
  };
}

export class SSEAdapter {
  private controller: ReadableStreamDefaultController | null = null;
  private cleanup: (() => void) | null = null;
  private encoder = new TextEncoder();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private bus: RunEventBus) {
    this.cleanup = bus.on((event) => this.handleEvent(event));
  }

  pipe(controller: ReadableStreamDefaultController): void {
    this.controller = controller;
  }

  /**
   * Start sending SSE comments (`: heartbeat`) at a regular interval to keep
   * the connection alive through proxies / load balancers that close idle
   * sockets. Lines starting with `:` are SSE comments — they don't trigger
   * any client-side handler, just keep bytes flowing.
   *
   * Default 20s — under the 30s threshold most reverse proxies use.
   */
  startHeartbeat(intervalMs = 20_000): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      if (!this.controller) {
        this.stopHeartbeat();
        return;
      }
      try {
        this.controller.enqueue(this.encoder.encode(": heartbeat\n\n"));
      } catch {
        // Stream closed — stop the timer to avoid leaking it.
        this.stopHeartbeat();
      }
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  close(): void {
    this.stopHeartbeat();
    this.cleanup?.();
    try {
      this.controller?.close();
    } catch {
      // already closed
    }
    this.controller = null;
  }

  sendError(err: unknown): void {
    const msg = err instanceof Error ? err.message : "Unknown error";
    this.send({ type: "run_failed", error: msg });
  }

  private handleEvent(event: RunEvent): void {
    const sse = this.toSSE(event);
    if (sse) this.send(sse);
  }

  private send(data: Record<string, unknown>): void {
    if (!this.controller) return;
    try {
      this.controller.enqueue(
        this.encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
      );
    } catch {
      // stream closed
    }
  }

  /**
   * Filter and map internal events to client-facing SSE events.
   * Returns null for events that should not be exposed to the UI.
   *
   * Principle: every user-visible state change must produce an SSE event.
   * Internal bookkeeping (cost, retries, delegate internals) stays hidden.
   */
  private toSSE(event: RunEvent): Record<string, unknown> | null {
    switch (event.type) {
      // ── Run lifecycle (visible) ──────────────────────────
      case "run_started":
        return { type: "run_started", run_id: event.run_id };
      case "run_completed":
        return {
          type: "run_completed",
          run_id: event.run_id,
          artifacts: event.artifacts,
        };
      case "run_failed":
        return { type: "run_failed", error: event.error };
      case "run_suspended":
        return {
          type: "run_suspended",
          run_id: event.run_id,
          reason: event.reason,
        };
      case "run_resumed":
        return { type: "run_resumed", run_id: event.run_id };

      // ── Plan (visible — user sees "planning X steps") ────
      case "plan_attached":
        return {
          type: "plan_attached",
          plan_id: event.plan_id,
          step_count: event.step_count,
        };

      // ── Steps (visible — user sees timeline) ─────────────
      case "step_started":
        return {
          type: "step_started",
          step_id: event.step_id,
          agent: event.agent,
          title: event.title,
        };
      case "step_completed":
        return { type: "step_completed", step_id: event.step_id };
      case "step_failed":
        return {
          type: "step_failed",
          step_id: event.step_id,
          error: event.error,
        };

      // ── Tool calls (visible — user sees "calling X") ─────
      // On enrichit `providerId`/`providerLabel` à partir du nom du tool si
      // l'orchestrator ne les a pas posés. Pattern Composio : `GMAIL_SEND_EMAIL`
      // → "gmail" / "Gmail". Pour les tools natifs (`generate_image`, …) on
      // map vers le provider connu (fal_ai, anthropic, e2b, …).
      case "tool_call_started": {
        const { providerId, providerLabel } = deriveProvider(
          event.tool,
          event.providerId,
          event.providerLabel,
        );
        return {
          type: "tool_call_started",
          step_id: event.step_id,
          tool: event.tool,
          providerId,
          providerLabel,
        };
      }
      case "tool_call_completed": {
        const { providerId, providerLabel } = deriveProvider(
          event.tool,
          event.providerId,
        );
        return {
          type: "tool_call_completed",
          step_id: event.step_id,
          tool: event.tool,
          providerId,
          providerLabel,
          latencyMs: event.latencyMs,
          costUSD: event.costUSD,
        };
      }

      // ── Inline app connect (visible — renders connect card) ──
      case "app_connect_required":
        return {
          type: "app_connect_required",
          app: event.app,
          reason: event.reason,
        };

      // ── Text streaming ───────────────────────────────────
      // Strip emoji glyphs server-side before forwarding to the UI.
      // Rule 7 of the system prompt forbids them, but the model occasionally
      // slips (and synthetic retrieval / research paths bypass it entirely).
      // Doing the strip here covers every text_delta exit point.
      case "text_delta": {
        const cleaned = stripEmoji(event.delta);
        if (!cleaned) return null;
        return { type: "text_delta", delta: cleaned };
      }

      // ── Approvals (visible — user must act) ──────────────
      case "approval_requested":
        return {
          type: "approval_requested",
          approval_id: event.approval_id,
          step_id: event.step_id,
        };
      case "action_plan_proposed":
        return {
          type: "action_plan_proposed",
          action_plan_id: event.action_plan_id,
          summary: event.summary,
          action_count: event.action_count,
        };

      // ── Artifacts (visible — user sees document) ─────────
      case "artifact_created":
        return {
          type: "artifact_created",
          artifact_id: event.artifact_id,
          artifact_type: event.artifact_type,
          title: event.title,
        };
      case "artifact_revised":
        return {
          type: "artifact_revised",
          artifact_id: event.artifact_id,
          version: event.version,
        };

      // ── Clarification (visible — user must respond) ──────
      case "clarification_requested":
        return {
          type: "clarification_requested",
          question: event.question,
          options: event.options,
        };

      // ── Scheduled missions (visible — user sees automation) ─
      case "scheduled_mission_created":
        return {
          type: "scheduled_mission_created",
          mission_id: event.mission_id,
          name: event.name,
          schedule: event.schedule,
        };
      case "scheduled_mission_triggered":
        return {
          type: "scheduled_mission_triggered",
          mission_id: event.mission_id,
          name: event.name,
        };

      // ── Assets (visible — user sees deliverable) ──────────
      case "asset_generated":
        return {
          type: "asset_generated",
          asset_id: event.asset_id,
          asset_type: event.asset_type,
          name: event.name,
          url: event.url,
        };

      // ── Focal Object (right panel premium object) ──────────
      case "focal_object_ready":
        return {
          type: "focal_object_ready",
          focal_object: event.focal_object,
        };

      // ── Agent selection (visible — user sees which agent) ──
      case "agent_selected":
        return {
          type: "agent_selected",
          agent_id: event.agent_id,
          agent_name: event.agent_name,
          backend: event.backend,
          backend_reason: event.backend_reason,
        };

      // ── Tool surface (visible — UI renders tool palette) ──
      case "tool_surface":
        return {
          type: "tool_surface",
          context: event.context,
          tools: event.tools,
        };

      // ── Execution mode (visible — user sees routing) ─────
      case "execution_mode_selected":
        return {
          type: "execution_mode_selected",
          mode: event.mode,
          reason: event.reason,
          backend: event.backend,
        };

      // ── Orchestrator log (visible — activity feed) ───────
      case "orchestrator_log":
        return {
          type: "orchestrator_log",
          message: event.message,
        };

      // ── Capability blocked (visible — user needs to act) ──
      case "capability_blocked":
        return {
          type: "capability_blocked",
          capability: event.capability,
          requiredProviders: event.requiredProviders,
          message: event.message,
        };

      // ── Stage routing (visible — téléporte l'utilisateur) ─
      case "stage_request":
        return { type: "stage_request", stage: event.stage };

      // ── Browser co-pilot (B5) — ACTION_LOG live ──────────
      case "browser_action":
        return {
          type: "browser_action",
          sessionId: event.sessionId,
          action: event.action,
        };
      case "browser_task_completed":
        return {
          type: "browser_task_completed",
          sessionId: event.sessionId,
          summary: event.summary,
          assetIds: event.assetIds,
          totalActions: event.totalActions,
          totalDurationMs: event.totalDurationMs,
        };
      case "browser_task_failed":
        return {
          type: "browser_task_failed",
          sessionId: event.sessionId,
          error: event.error,
          totalActions: event.totalActions,
        };
      case "browser_take_over":
        return {
          type: "browser_take_over",
          sessionId: event.sessionId,
        };

      // ── Mission Control multi-step (visible — StepGraph) ─
      case "plan_preview":
        return {
          type: "plan_preview",
          plan_id: event.plan_id,
          intent: event.intent,
          steps: event.steps,
          estimatedCostUsd: event.estimatedCostUsd,
          requiredApps: event.requiredApps,
        };
      case "plan_step_started":
        return {
          type: "plan_step_started",
          plan_id: event.plan_id,
          step_id: event.step_id,
          kind: event.kind,
          label: event.label,
          plannedAt: event.plannedAt,
        };
      case "plan_step_completed":
        return {
          type: "plan_step_completed",
          plan_id: event.plan_id,
          step_id: event.step_id,
          output: event.output,
          costUSD: event.costUSD,
          latencyMs: event.latencyMs,
          providerId: event.providerId,
        };
      case "plan_step_awaiting_approval":
        return {
          type: "plan_step_awaiting_approval",
          plan_id: event.plan_id,
          step_id: event.step_id,
          preview: event.preview,
          kind: event.kind,
          providerId: event.providerId,
        };
      case "plan_step_failed":
        return {
          type: "plan_step_failed",
          plan_id: event.plan_id,
          step_id: event.step_id,
          error: event.error,
        };
      case "plan_run_complete":
        return {
          type: "plan_run_complete",
          plan_id: event.plan_id,
          assetId: event.assetId,
          totalCostUsd: event.totalCostUsd,
          totalLatencyMs: event.totalLatencyMs,
        };

      // ── Internal events NOT exposed to the UI ────────────
      case "run_created":
      case "run_cancelled":
      case "step_retrying":
      case "delegate_enqueued":
      case "delegate_completed":
      case "approval_decided":
      case "cost_updated":
      case "retrieval_mode_inferred":
      case "runtime_warning":
      case "operator_violation":
        return null;
    }
  }
}
