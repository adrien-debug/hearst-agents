"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reduceEvent, type CanvasOp } from "./event-reducer";
import { useCanvasStore } from "./store";

interface PersistedEvent {
  type: string;
  ts: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}

type Speed = 1 | 4 | 16;

/**
 * Replay a persisted run timeline.
 *
 * Strategy: scale the original real-time deltas down by `speed`, schedule a
 * setTimeout for each event from the start of replay. The reducer applies
 * deterministic ops (node state changes, packet emits) — no async branching.
 */
export function useReplay(events: PersistedEvent[]) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const timersRef = useRef<number[]>([]);
  const startedAtRef = useRef<number>(0);

  const setNodeState = useCanvasStore((s) => s.setNodeState);
  const emitPacket = useCanvasStore((s) => s.emitPacket);
  const resetNodes = useCanvasStore((s) => s.resetNodes);
  const setLastEventAt = useCanvasStore((s) => s.setLastEventAt);

  const apply = useCallback(
    (ops: CanvasOp[]) => {
      for (const op of ops) {
        if (op.kind === "reset") resetNodes();
        else if (op.kind === "node") setNodeState(op.id, op.state);
        else if (op.kind === "packet") emitPacket(op.edgeId);
      }
    },
    [resetNodes, setNodeState, emitPacket],
  );

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setIsPlaying(false);
    setProgress(0);
    resetNodes();
  }, [clearTimers, resetNodes]);

  const play = useCallback(() => {
    if (events.length === 0) return;
    clearTimers();
    resetNodes();
    setIsPlaying(true);
    setProgress(0);

    const baseTs = events[0].ts;
    const lastTs = events[events.length - 1].ts;
    const totalSpan = Math.max(1, lastTs - baseTs);
    const speedMul = speed;
    startedAtRef.current = Date.now();

    events.forEach((event, idx) => {
      const delay = (event.ts - baseTs) / speedMul;
      const t = window.setTimeout(() => {
        const opEvent = { type: event.type, ...event.payload };
        apply(reduceEvent(opEvent));
        setLastEventAt(event.ts);
        const elapsed = (Date.now() - startedAtRef.current) * speedMul;
        setProgress(Math.min(1, elapsed / totalSpan));
        if (idx === events.length - 1) {
          setIsPlaying(false);
          setProgress(1);
        }
      }, delay);
      timersRef.current.push(t);
    });
  }, [events, speed, apply, resetNodes, clearTimers, setLastEventAt]);

  const pause = useCallback(() => {
    clearTimers();
    setIsPlaying(false);
  }, [clearTimers]);

  const playToggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const seek = useCallback(
    (newProgress: number) => {
      if (events.length === 0) return;
      clearTimers();
      resetNodes();
      const baseTs = events[0].ts;
      const lastTs = events[events.length - 1].ts;
      const targetTs = baseTs + (lastTs - baseTs) * newProgress;
      // Apply all events <= targetTs immediately, no replay.
      for (const ev of events) {
        if (ev.ts > targetTs) break;
        apply(reduceEvent({ type: ev.type, ...ev.payload }));
      }
      setProgress(newProgress);
      setIsPlaying(false);
    },
    [events, apply, resetNodes, clearTimers],
  );

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // Re-trigger when events change (new run selected)
  useEffect(() => {
    reset();
  }, [events, reset]);

  return {
    isPlaying,
    progress,
    speed,
    setSpeed,
    play,
    pause,
    playToggle,
    reset,
    seek,
  };
}
