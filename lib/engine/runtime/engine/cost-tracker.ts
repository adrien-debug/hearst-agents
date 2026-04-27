/**
 * Cost Tracker — Atomic cost tracking for Runs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunCost, UsageMetrics } from "./types";

const EMPTY_COST: RunCost = {
  llm_input_tokens: 0,
  llm_output_tokens: 0,
  tool_calls: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

export class CostTracker {
  private accumulated: RunCost = { ...EMPTY_COST };

  constructor(
    private db: SupabaseClient,
    private runId: string,
  ) {}

  async track(usage: UsageMetrics): Promise<void> {
    this.accumulated.llm_input_tokens += usage.input_tokens;
    this.accumulated.llm_output_tokens += usage.output_tokens;
    this.accumulated.tool_calls += usage.tool_calls;
    if (usage.cache_creation_input_tokens) {
      this.accumulated.cache_creation_input_tokens =
        (this.accumulated.cache_creation_input_tokens ?? 0) + usage.cache_creation_input_tokens;
    }
    if (usage.cache_read_input_tokens) {
      this.accumulated.cache_read_input_tokens =
        (this.accumulated.cache_read_input_tokens ?? 0) + usage.cache_read_input_tokens;
    }
    await this.flush();
  }

  async trackToolCall(): Promise<void> {
    this.accumulated.tool_calls += 1;
    await this.flush();
  }

  getCurrent(): RunCost {
    return { ...this.accumulated };
  }

  private async flush(): Promise<void> {
    const { error } = await this.db
      .from("runs")
      .update({
        cost: this.accumulated as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", this.runId);

    if (error) {
      console.error("[CostTracker] flush error:", error.message);
    }
  }
}
