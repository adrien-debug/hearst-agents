/**
 * Halo State Model — Runtime perception state for the Orchestration Halo.
 *
 * Pure reducer + types + semantic flow mapper. No React dependencies.
 * Consumed by use-halo.ts which wires SSE events.
 */

// ── Config ──────────────────────────────────────────────────

export const HALO_CONFIG = {
  smoothingWindowMs: 800,
  providerLingerMs: 2500,
  successHoldMs: 2500,
  degradedHoldMs: 4000,
  idleReturnMs: 800,
  artifactEmergingMs: 1200,
  artifactHandoffMs: 2000,
  artifactSettledMs: 3500,
  maxVisibleProviders: 3,
  backgroundIntensityScale: 0.5,
} as const;

// ── Types ───────────────────────────────────────────────────

export type HaloCoreState =
  | "idle"
  | "thinking"
  | "executing"
  | "waiting_approval"
  | "degraded"
  | "success";

export type HaloIntensity = "foreground" | "background";

export type HaloFlowLabel =
  | "LISTENING"
  | "GATHERING"
  | "SYNTHESIZING"
  | "PREPARING"
  | "AWAITING APPROVAL"
  | "FINALIZING"
  | "CHECKING"
  | "MONITORING"
  | "UNABLE TO RESOLVE"
  | null;

export interface HaloProviderNode {
  providerId: string;
  status: "idle" | "active" | "fading";
  enteredAt: number;
  lastActiveAt: number;
}

export type HaloArtifactKind = "report" | "draft" | "file" | "task" | "event" | "other";
export type HaloArtifactStatus = "emerging" | "handoff" | "settled";

export interface HaloArtifactSignal {
  artifactId?: string;
  kind: HaloArtifactKind;
  status: HaloArtifactStatus;
  createdAt: number;
}

export interface HaloState {
  coreState: HaloCoreState;
  intensity: HaloIntensity;
  flowLabel: HaloFlowLabel;
  activeProviders: HaloProviderNode[];
  emergingArtifact: HaloArtifactSignal | null;
  lastTransitionAt: number;
  /** Internal: tracks tool activity for semantic flow derivation. */
  _toolCount: number;
  _hasDataTool: boolean;
  _hasGenerateTool: boolean;
}

// ── Motion flags (derived, not stored) ──────────────────────

export interface HaloMotionFlags {
  shouldPulseCore: boolean;
  shouldIgniteCore: boolean;
  shouldShowProviderOrbit: boolean;
  shouldShowNeuralStreak: boolean;
  shouldShowArtifactHandoff: boolean;
  shouldShowFlowLabel: boolean;
}

export function deriveMotionFlags(state: HaloState): HaloMotionFlags {
  const isBg = state.intensity === "background";
  const isIdle = state.coreState === "idle";
  const isActive = state.coreState === "executing" || state.coreState === "thinking";
  const hasProviders = state.activeProviders.some((p) => p.status === "active");

  return {
    shouldPulseCore: state.coreState === "thinking" || state.coreState === "waiting_approval",
    shouldIgniteCore: state.coreState === "executing" && !isBg,
    shouldShowProviderOrbit: hasProviders || state.activeProviders.length > 0,
    shouldShowNeuralStreak: isActive && !isBg,
    shouldShowArtifactHandoff: state.emergingArtifact !== null,
    shouldShowFlowLabel: !isIdle && state.flowLabel !== null,
  };
}

// ── Actions ─────────────────────────────────────────────────

export type HaloAction =
  | { type: "run_started"; at: number; intensity?: HaloIntensity }
  | { type: "run_completed"; at: number; artifactKind?: HaloArtifactKind; artifactId?: string }
  | { type: "run_failed"; at: number }
  | { type: "run_suspended"; at: number; reason: string }
  | { type: "run_resumed"; at: number }
  | { type: "tool_call_started"; at: number; tool: string; providerId?: string; providerLabel?: string }
  | { type: "tool_call_completed"; at: number; tool: string; providerId?: string }
  | { type: "step_failed"; at: number; stepId: string; error: string }
  | { type: "asset_generated"; at: number; assetId: string; assetType: string; name: string }
  | { type: "approval_requested"; at: number }
  | { type: "fade_provider"; providerId: string }
  | { type: "artifact_handoff" }
  | { type: "artifact_settled" }
  | { type: "clear_artifact" }
  | { type: "reset_idle"; at: number };

// ── Initial state ───────────────────────────────────────────

export function createInitialHaloState(): HaloState {
  return {
    coreState: "idle",
    intensity: "foreground",
    flowLabel: null,
    activeProviders: [],
    emergingArtifact: null,
    lastTransitionAt: Date.now(),
    _toolCount: 0,
    _hasDataTool: false,
    _hasGenerateTool: false,
  };
}

// ── Reducer ─────────────────────────────────────────────────

export function haloReducer(state: HaloState, action: HaloAction): HaloState {
  switch (action.type) {
    case "run_started":
      return {
        ...state,
        coreState: "thinking",
        intensity: action.intensity ?? "foreground",
        flowLabel: action.intensity === "background" ? "MONITORING" : "LISTENING",
        activeProviders: [],
        emergingArtifact: null,
        lastTransitionAt: action.at,
        _toolCount: 0,
        _hasDataTool: false,
        _hasGenerateTool: false,
      };

    case "tool_call_started": {
      const pid = action.providerId || "system";
      const providers = upsertProvider(state.activeProviders, pid, "active", action.at);
      const toolCount = state._toolCount + 1;
      const hasData = state._hasDataTool || isDataTool(action.tool);
      const hasGen = state._hasGenerateTool || isGenerateTool(action.tool);
      const flowLabel = deriveFlowLabel(state.coreState, state.intensity, toolCount, hasData, hasGen);

      return {
        ...state,
        coreState: "executing",
        activeProviders: providers,
        flowLabel,
        lastTransitionAt: action.at,
        _toolCount: toolCount,
        _hasDataTool: hasData,
        _hasGenerateTool: hasGen,
      };
    }

    case "tool_call_completed": {
      const pid = action.providerId || "system";
      const providers = upsertProvider(state.activeProviders, pid, "fading", action.at);

      return {
        ...state,
        activeProviders: providers,
        lastTransitionAt: action.at,
      };
    }

    case "step_failed":
      return {
        ...state,
        lastTransitionAt: action.at,
      };

    case "run_completed": {
      const artifact: HaloArtifactSignal | null = action.artifactKind
        ? { artifactId: action.artifactId, kind: action.artifactKind, status: "emerging", createdAt: action.at }
        : null;

      return {
        ...state,
        coreState: "success",
        flowLabel: "FINALIZING",
        emergingArtifact: artifact ?? state.emergingArtifact,
        lastTransitionAt: action.at,
      };
    }

    case "run_failed":
      return {
        ...state,
        coreState: "degraded",
        flowLabel: "UNABLE TO RESOLVE",
        lastTransitionAt: action.at,
      };

    case "run_suspended":
      return {
        ...state,
        coreState: action.reason === "awaiting_approval" ? "waiting_approval" : "thinking",
        flowLabel: action.reason === "awaiting_approval" ? "AWAITING APPROVAL" : "LISTENING",
        lastTransitionAt: action.at,
      };

    case "run_resumed":
      return {
        ...state,
        coreState: "executing",
        flowLabel: deriveFlowLabel("executing", state.intensity, state._toolCount, state._hasDataTool, state._hasGenerateTool),
        lastTransitionAt: action.at,
      };

    case "asset_generated": {
      const kind = inferArtifactKind(action.assetType, action.name);
      return {
        ...state,
        emergingArtifact: {
          artifactId: action.assetId,
          kind,
          status: "emerging",
          createdAt: action.at,
        },
        lastTransitionAt: action.at,
      };
    }

    case "approval_requested":
      return {
        ...state,
        coreState: "waiting_approval",
        flowLabel: "AWAITING APPROVAL",
        lastTransitionAt: action.at,
      };

    case "fade_provider": {
      const providers = state.activeProviders.map((p) =>
        p.providerId === action.providerId && p.status === "fading"
          ? { ...p, status: "idle" as const }
          : p,
      );
      return { ...state, activeProviders: providers };
    }

    case "artifact_handoff":
      if (!state.emergingArtifact) return state;
      return {
        ...state,
        emergingArtifact: { ...state.emergingArtifact, status: "handoff" },
      };

    case "artifact_settled":
      if (!state.emergingArtifact) return state;
      return {
        ...state,
        emergingArtifact: { ...state.emergingArtifact, status: "settled" },
      };

    case "clear_artifact":
      return { ...state, emergingArtifact: null };

    case "reset_idle":
      return {
        ...state,
        coreState: "idle",
        flowLabel: null,
        activeProviders: state.activeProviders.map((p) => ({ ...p, status: "idle" as const })),
        lastTransitionAt: action.at,
        _toolCount: 0,
        _hasDataTool: false,
        _hasGenerateTool: false,
      };

    default:
      return state;
  }
}

// ── Provider list management ────────────────────────────────

function upsertProvider(
  providers: HaloProviderNode[],
  providerId: string,
  status: HaloProviderNode["status"],
  at: number,
): HaloProviderNode[] {
  const existing = providers.find((p) => p.providerId === providerId);

  if (existing) {
    return providers.map((p) =>
      p.providerId === providerId
        ? { ...p, status, lastActiveAt: at }
        : p,
    );
  }

  const node: HaloProviderNode = { providerId, status, enteredAt: at, lastActiveAt: at };

  if (providers.length < HALO_CONFIG.maxVisibleProviders) {
    return [...providers, node];
  }

  // Evict LRU non-active provider
  const evictable = providers
    .filter((p) => p.status !== "active")
    .sort((a, b) => a.lastActiveAt - b.lastActiveAt);

  if (evictable.length === 0) {
    return [...providers.slice(1), node];
  }

  const evictId = evictable[0].providerId;
  return [...providers.filter((p) => p.providerId !== evictId), node];
}

// ── Semantic flow mapper ────────────────────────────────────

const DATA_TOOLS = new Set([
  "get_messages", "get_calendar_events", "get_files",
  "post_message", "query_database", "search_web",
]);

const GENERATE_TOOLS = new Set([
  "generate_pdf", "generate_xlsx", "generate_report",
  "export_excel", "analyze_data",
]);

function isDataTool(tool: string): boolean {
  return DATA_TOOLS.has(tool);
}

function isGenerateTool(tool: string): boolean {
  return GENERATE_TOOLS.has(tool);
}

function deriveFlowLabel(
  coreState: HaloCoreState,
  intensity: HaloIntensity,
  toolCount: number,
  hasData: boolean,
  hasGenerate: boolean,
): HaloFlowLabel {
  if (intensity === "background") {
    if (hasGenerate) return "PREPARING";
    if (hasData) return "CHECKING";
    return "MONITORING";
  }

  if (coreState === "thinking") return "LISTENING";

  if (hasGenerate) return "SYNTHESIZING";
  if (hasData && toolCount > 1) return "GATHERING";
  if (hasData) return "GATHERING";
  if (toolCount > 2) return "SYNTHESIZING";

  return "PREPARING";
}

function inferArtifactKind(assetType: string, name: string): HaloArtifactKind {
  const lower = (assetType + " " + name).toLowerCase();
  if (lower.includes("report") || lower.includes("rapport")) return "report";
  if (lower.includes("pdf") || lower.includes("xlsx") || lower.includes("csv")) return "file";
  if (lower.includes("draft") || lower.includes("brouillon")) return "draft";
  if (lower.includes("task") || lower.includes("tâche")) return "task";
  if (lower.includes("event") || lower.includes("événement")) return "event";
  return "other";
}

// ── Smoothing layer ─────────────────────────────────────────

export class HaloEventSmoother {
  private buffer: HaloAction[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private onFlush: (actions: HaloAction[]) => void;
  private windowMs: number;

  constructor(onFlush: (actions: HaloAction[]) => void, windowMs = HALO_CONFIG.smoothingWindowMs) {
    this.onFlush = onFlush;
    this.windowMs = windowMs;
  }

  push(action: HaloAction): void {
    this.buffer.push(action);

    if (
      action.type === "run_started" ||
      action.type === "run_completed" ||
      action.type === "run_failed" ||
      action.type === "approval_requested"
    ) {
      this.flush();
      return;
    }

    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), this.windowMs);
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length === 0) return;

    const batch = deduplicateBatch(this.buffer);
    this.buffer = [];
    this.onFlush(batch);
  }

  destroy(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.buffer = [];
  }
}

function deduplicateBatch(actions: HaloAction[]): HaloAction[] {
  const seen = new Set<string>();
  const result: HaloAction[] = [];

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];

    if (a.type === "tool_call_started") {
      const key = `${a.providerId ?? "system"}:${a.tool}`;
      const hasCompletion = actions.slice(i + 1).some(
        (b) => b.type === "tool_call_completed" && (b.providerId ?? "system") === (a.providerId ?? "system"),
      );
      if (hasCompletion && seen.has(key)) continue;
      seen.add(key);
      result.push(a);
    } else {
      result.push(a);
    }
  }

  return result;
}
