/**
 * Run Event Bus.
 *
 * Central pub/sub for all Run Engine events.
 * Consumers subscribe via on(). Events are buffered for replay.
 */

import type { RunEvent } from "./types";

type EventHandler = (event: RunEvent) => void | Promise<void>;

/**
 * Distributes Omit over a union: each member gets timestamp removed individually.
 */
type OmitTimestamp<T> = T extends RunEvent ? Omit<T, "timestamp"> : never;
export type RunEventPayload = OmitTimestamp<RunEvent>;

export class RunEventBus {
  private handlers: EventHandler[] = [];
  private buffer: RunEvent[] = [];

  /**
   * Subscribe to all events. Returns an unsubscribe function.
   */
  on(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /**
   * Emit an event. Timestamp is set automatically.
   */
  emit(event: RunEventPayload): void {
    const full = {
      ...event,
      timestamp: new Date().toISOString(),
    } as RunEvent;
    this.buffer.push(full);
    for (const handler of this.handlers) {
      try {
        handler(full);
      } catch (e) {
        console.error(
          "[RunEventBus] handler error:",
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  /**
   * Get the full event history for this bus instance (useful for replay/debug).
   */
  getHistory(): RunEvent[] {
    return [...this.buffer];
  }

  /**
   * Clear all handlers and buffer.
   */
  destroy(): void {
    this.handlers = [];
    this.buffer = [];
  }
}
