/**
 * Global Run Bus.
 *
 * Cross-run, in-memory pub/sub. Each per-run RunEventBus fans out into this
 * singleton so admin surfaces (live canvas, monitoring) can tail all runs.
 *
 * Memory only — last RING_SIZE events are kept for late subscribers; older
 * events are dropped. No durability guarantees: persistent run history lives
 * in `run_logs` (lib/engine/runtime/timeline/persist.ts).
 */

import type { RunEvent } from "./types";

type Handler = (event: RunEvent) => void;

const RING_SIZE = 200;

class GlobalRunBus {
  private handlers = new Set<Handler>();
  private ring: RunEvent[] = [];

  broadcast(event: RunEvent): void {
    this.ring.push(event);
    if (this.ring.length > RING_SIZE) this.ring.shift();
    for (const h of this.handlers) {
      try {
        h(event);
      } catch (e) {
        console.error("[GlobalRunBus] handler error:", e instanceof Error ? e.message : e);
      }
    }
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  getRecent(): readonly RunEvent[] {
    return this.ring.slice();
  }
}

export const globalRunBus = new GlobalRunBus();
