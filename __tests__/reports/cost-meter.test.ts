/**
 * Tests du cost meter — vérifie le budget par run + le calcul USD.
 */

import { describe, expect, it } from "vitest";
import {
  computeCostUsd,
  checkReportBudget,
  REPORT_BUDGET_USD,
  SONNET_4_6_PRICING,
} from "@/lib/reports/engine/cost-meter";

describe("computeCostUsd — pricing Sonnet 4-6", () => {
  it("calcule le coût d'un run sans cache", () => {
    // 5k input + 600 output → 5000 * 3 + 600 * 15 = 15k + 9k = 24k µUSD = $0.024
    const usd = computeCostUsd({ inputTokens: 5000, outputTokens: 600 });
    expect(usd).toBeCloseTo(0.024, 4);
  });

  it("applique le rabais cache read (90% off)", () => {
    const noCache = computeCostUsd({ inputTokens: 5000, outputTokens: 0 });
    const fullCache = computeCostUsd({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 5000,
    });
    expect(fullCache).toBeLessThan(noCache);
    // cacheRead = 0.30, input = 3.0 → ratio 0.1
    expect(fullCache / noCache).toBeCloseTo(0.1, 2);
  });

  it("renvoie 0 si pas de tokens", () => {
    expect(computeCostUsd({ inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it("expose le pricing immutable comme constante", () => {
    expect(SONNET_4_6_PRICING.input).toBe(3.0);
    expect(SONNET_4_6_PRICING.output).toBe(15.0);
    expect(SONNET_4_6_PRICING.cacheRead).toBe(0.3);
  });
});

describe("checkReportBudget — assertion <$0.20", () => {
  it("un run typique narration 5k+600 reste largement sous budget", () => {
    const r = checkReportBudget({ inputTokens: 5000, outputTokens: 600 });
    expect(r.exceeded).toBe(false);
    expect(r.warning).toBe(false);
    expect(r.usd).toBeLessThan(REPORT_BUDGET_USD);
  });

  it("dépasse la warning à >= 80% du budget", () => {
    // Construire un usage qui coûte ~$0.17 (au-dessus du seuil 0.16)
    const target = 0.17;
    const inputTokens = Math.ceil((target * 1_000_000) / SONNET_4_6_PRICING.input);
    const r = checkReportBudget({ inputTokens, outputTokens: 0 });
    expect(r.warning).toBe(true);
    expect(r.exceeded).toBe(false);
  });

  it("exceeded > $0.20", () => {
    const target = 0.25;
    const inputTokens = (target * 1_000_000) / SONNET_4_6_PRICING.input;
    const r = checkReportBudget({ inputTokens, outputTokens: 0 });
    expect(r.exceeded).toBe(true);
  });
});
