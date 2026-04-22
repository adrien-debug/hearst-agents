"use client";

/**
 * useMomentum — Discrete live view of active missions / runs / focal work.
 *
 * Data is ultimately fed by `/api/v2/right-panel` polling inside `useRightPanel()`.
 * This hook also subscribes to the same **RunStream** SSE bus (`RunStreamProvider`)
 * as `use-right-panel.ts`, so the UI re-renders as soon as events arrive (before
 * the next poll), keeping momentum in sync with orchestration.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRightPanel } from "@/app/hooks/use-right-panel";
import { useFocalObject } from "@/app/hooks/use-focal-object";
import { useRunStreamOptional, type StreamEvent } from "@/app/lib/run-stream-context";
import { buildMomentumItems, type MomentumItem } from "@/app/lib/momentum-model";

export interface MomentumState {
  items: MomentumItem[];
  /** True when at least one run, mission, or focal row is considered active */
  hasActive: boolean;
  /** SSE / run stream socket or proxy connected (from RunStreamProvider) */
  streamConnected: boolean;
  /** Timestamp of the last stream event observed (ms), or null if none */
  lastStreamEventAt: number | null;
  /** Last event type (debug / UI hints) */
  lastStreamEventType: string | null;
}

export function useMomentum(): MomentumState {
  const { data } = useRightPanel();
  const { focal } = useFocalObject();
  const stream = useRunStreamOptional();

  const [streamTick, setStreamTick] = useState(0);
  const [lastStreamEventAt, setLastStreamEventAt] = useState<number | null>(null);
  const [lastStreamEventType, setLastStreamEventType] = useState<string | null>(null);

  const onStream = useCallback((event: StreamEvent) => {
    setLastStreamEventAt(event.timestamp ?? Date.now());
    setLastStreamEventType(event.type);
    setStreamTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!stream) return;
    return stream.subscribe(onStream);
  }, [stream, onStream]);

  const items = useMemo(() => {
    void streamTick;
    return buildMomentumItems(data, focal);
  }, [data, focal, streamTick]);

  return {
    items,
    hasActive: items.length > 0,
    streamConnected: stream?.connected ?? false,
    lastStreamEventAt,
    lastStreamEventType,
  };
}

export { buildMomentumItems } from "@/app/lib/momentum-model";
export type { MomentumItem, MomentumKind } from "@/app/lib/momentum-model";
