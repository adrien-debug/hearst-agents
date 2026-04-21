"use client";

/**
 * useHalo — Wires SSE stream events into HaloState via the smoother + reducer.
 *
 * Returns HaloState + derived motion flags + memoized provider UI accessor.
 * All timing constants come from HALO_CONFIG.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useRunStreamOptional, type StreamEvent } from "@/app/lib/run-stream-context";
import { getProviderForTool, getProviderUi } from "@/lib/providers/registry";
import {
  haloReducer,
  createInitialHaloState,
  HaloEventSmoother,
  deriveMotionFlags,
  HALO_CONFIG,
  type HaloAction,
  type HaloState,
  type HaloIntensity,
  type HaloMotionFlags,
} from "@/app/lib/halo-state";

// ── Provider UI cache ───────────────────────────────────────

export interface HaloProviderUi {
  initial: string;
  color: string;
}

const uiCache = new Map<string, HaloProviderUi>();

export function getCachedProviderUi(providerId: string): HaloProviderUi {
  let cached = uiCache.get(providerId);
  if (!cached) {
    cached = getProviderUi(providerId);
    uiCache.set(providerId, cached);
  }
  return cached;
}

// ── Hook return type ────────────────────────────────────────

export interface UseHaloResult {
  state: HaloState;
  motion: HaloMotionFlags;
  restoreState: (s: HaloState) => void;
}

// ── Background detection heuristic ──────────────────────────

const BACKGROUND_PATTERNS = [
  /cron/i, /scheduled/i, /mission/i, /daily[_-]?report/i,
  /market[_-]?watch/i, /market[_-]?alert/i,
];

function detectIntensity(event: StreamEvent): HaloIntensity {
  const source = String(event.source ?? event.triggered_by ?? "");
  if (BACKGROUND_PATTERNS.some((p) => p.test(source))) return "background";
  if (event.intensity === "background") return "background";
  return "foreground";
}

// ── Hook ────────────────────────────────────────────────────

export function useHalo(): UseHaloResult {
  const stream = useRunStreamOptional();
  const [state, dispatch] = useReducer(haloReducer, undefined, createInitialHaloState);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const smootherRef = useRef<HaloEventSmoother | null>(null);

  const handleBatch = useCallback((actions: HaloAction[]) => {
    for (const action of actions) {
      if (action.type === "run_started") {
        timersRef.current.forEach(clearTimeout);
        timersRef.current.clear();
      }

      dispatch(action);

      if (action.type === "tool_call_completed") {
        const pid = action.providerId || "system";
        safeTimeout(
          () => dispatch({ type: "fade_provider", providerId: pid }),
          HALO_CONFIG.providerLingerMs,
        );
      }

      if (action.type === "run_completed") {
        safeTimeout(
          () => dispatch({ type: "reset_idle", at: Date.now() }),
          HALO_CONFIG.successHoldMs,
        );
        // Artifact lifecycle: emerging → handoff → settled → clear
        if (action.artifactKind) {
          safeTimeout(
            () => dispatch({ type: "artifact_handoff" }),
            HALO_CONFIG.artifactEmergingMs,
          );
          safeTimeout(
            () => dispatch({ type: "artifact_settled" }),
            HALO_CONFIG.artifactHandoffMs,
          );
          safeTimeout(
            () => dispatch({ type: "clear_artifact" }),
            HALO_CONFIG.artifactSettledMs,
          );
        }
      }

      if (action.type === "run_failed") {
        safeTimeout(
          () => dispatch({ type: "reset_idle", at: Date.now() }),
          HALO_CONFIG.degradedHoldMs,
        );
      }
    }
  }, [safeTimeout]);

  useEffect(() => {
    const smoother = new HaloEventSmoother(handleBatch, HALO_CONFIG.smoothingWindowMs);
    smootherRef.current = smoother;
    return () => smoother.destroy();
  }, [handleBatch]);

  useEffect(() => {
    if (!stream) return;

    const unsub = stream.subscribe((event: StreamEvent) => {
      const action = mapEventToAction(event);
      if (action) smootherRef.current?.push(action);
    });

    return () => {
      unsub();
    };
  }, [stream]);

  const restoreState = useCallback((s: HaloState) => {
    dispatch({ type: "restore_state", state: s });
  }, []);

  const motion = deriveMotionFlags(state);

  return { state, motion, restoreState };
}

// ── Event → Action mapping ──────────────────────────────────

function mapEventToAction(event: StreamEvent): HaloAction | null {
  const at = event.timestamp || Date.now();

  switch (event.type) {
    case "run_started":
      return { type: "run_started", at, intensity: detectIntensity(event) };

    case "tool_call_started": {
      const providerId =
        (event.providerId as string)
        || getProviderForTool((event.tool as string) || "")?.id
        || "system";
      return {
        type: "tool_call_started",
        at,
        tool: (event.tool as string) || "unknown",
        providerId,
        providerLabel: (event.providerLabel as string) || undefined,
      };
    }

    case "tool_call_completed": {
      const providerId =
        (event.providerId as string)
        || getProviderForTool((event.tool as string) || "")?.id
        || "system";
      return {
        type: "tool_call_completed",
        at,
        tool: (event.tool as string) || "unknown",
        providerId,
      };
    }

    case "step_failed":
      return {
        type: "step_failed",
        at,
        stepId: (event.step_id as string) || "",
        error: (event.error as string) || "",
      };

    case "run_completed":
      return { type: "run_completed", at };

    case "run_failed":
      return { type: "run_failed", at };

    case "run_suspended":
      return { type: "run_suspended", at, reason: (event.reason as string) || "" };

    case "run_resumed":
      return { type: "run_resumed", at };

    case "asset_generated":
      return {
        type: "asset_generated",
        at,
        assetId: (event.asset_id as string) || "",
        assetType: (event.asset_type as string) || "",
        name: (event.name as string) || "",
      };

    case "approval_requested":
    case "action_plan_proposed":
      return { type: "approval_requested", at };

    default:
      return null;
  }
}
