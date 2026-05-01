/**
 * Watchlist narrate (vague 9, action #3) — prompt structure + fallback.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ANOMALY_NARRATOR_SYSTEM_PROMPT,
  narrateAnomaly,
  _resetNarrateCache,
} from "@/lib/watchlist/narrate";
import type { MetricAnomaly } from "@/lib/watchlist/snapshots";

const MRR_ANOMALY: MetricAnomaly = {
  metricId: "mrr",
  currentValue: 114000,
  baselineValue: 124000,
  changePct: -8.06,
  direction: "down",
  windowDays: 7,
  severity: "warning",
};

describe("ANOMALY_NARRATOR_SYSTEM_PROMPT", () => {
  it("contient les marqueurs structurels", () => {
    expect(ANOMALY_NARRATOR_SYSTEM_PROMPT).toContain("analyste");
    expect(ANOMALY_NARRATOR_SYSTEM_PROMPT).toContain("UNE phrase");
    expect(ANOMALY_NARRATOR_SYSTEM_PROMPT).toContain("140 caractères");
    expect(ANOMALY_NARRATOR_SYSTEM_PROMPT).toContain("EXEMPLES");
  });

  it("contient au moins 2 exemples", () => {
    const matches = ANOMALY_NARRATOR_SYSTEM_PROMPT.match(/<example>/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("interdit l'invention de drivers", () => {
    expect(ANOMALY_NARRATOR_SYSTEM_PROMPT).toContain("N'invente jamais un driver");
  });
});

describe("narrateAnomaly fallback", () => {
  beforeEach(() => {
    _resetNarrateCache();
  });

  it("retourne fallback déterministe sans clé Anthropic", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const result = await narrateAnomaly({ anomaly: MRR_ANOMALY });
      expect(result).toBeTruthy();
      expect(result).toContain("MRR");
      expect(result).toContain("-8.1%");
      expect(result).toContain("7");
    } finally {
      if (original) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("fallback formate le sign correctement pour direction up", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const result = await narrateAnomaly({
        anomaly: { ...MRR_ANOMALY, changePct: 12.5, direction: "up" },
      });
      expect(result).toContain("+12.5%");
    } finally {
      if (original) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("fallback utilise label canonique pour les métriques connues", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const arr = await narrateAnomaly({
        anomaly: { ...MRR_ANOMALY, metricId: "arr" },
      });
      expect(arr).toContain("ARR");

      const pipeline = await narrateAnomaly({
        anomaly: { ...MRR_ANOMALY, metricId: "pipeline" },
      });
      expect(pipeline).toContain("Pipeline");
    } finally {
      if (original) process.env.ANTHROPIC_API_KEY = original;
    }
  });
});
