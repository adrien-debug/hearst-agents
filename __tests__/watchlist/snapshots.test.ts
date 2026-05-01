/**
 * Watchlist anomaly detection (vague 9, action #3) — tests detectAnomaly logique pure.
 */

import { describe, it, expect } from "vitest";
import { detectAnomaly, type MetricSnapshot } from "@/lib/watchlist/snapshots";

function snap(value: number, daysAgo = 0, metricId = "mrr"): MetricSnapshot {
  return {
    id: `s-${value}-${daysAgo}`,
    userId: "u1",
    tenantId: "t1",
    metricId,
    value,
    capturedAt: Date.now() - daysAgo * 24 * 3600_000,
    metadata: {},
  };
}

describe("detectAnomaly", () => {
  it("retourne null si moins de 2 snapshots", () => {
    expect(detectAnomaly([])).toBeNull();
    expect(detectAnomaly([snap(100)])).toBeNull();
  });

  it("retourne null si baseline = 0", () => {
    const snapshots = [snap(100, 0), snap(0, 1), snap(0, 2)];
    expect(detectAnomaly(snapshots)).toBeNull();
  });

  it("retourne null sous le seuil 5%", () => {
    // Current 102 vs baseline avg 100 → +2% → sous le seuil
    const snapshots = [snap(102, 0), snap(100, 1), snap(100, 2)];
    expect(detectAnomaly(snapshots)).toBeNull();
  });

  it("détecte une variation à la hausse au-dessus du seuil", () => {
    // Current 110 vs baseline 100 → +10%
    const snapshots = [snap(110, 0), snap(100, 1), snap(100, 2), snap(100, 3)];
    const result = detectAnomaly(snapshots);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("up");
    expect(result!.changePct).toBeCloseTo(10, 1);
    expect(result!.severity).toBe("warning");
  });

  it("détecte une variation à la baisse au-dessus du seuil", () => {
    // Current 90 vs baseline 100 → -10%
    const snapshots = [snap(90, 0), snap(100, 1), snap(100, 2)];
    const result = detectAnomaly(snapshots);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("down");
    expect(result!.changePct).toBeCloseTo(-10, 1);
  });

  it("flag critical au-dessus de 15%", () => {
    const snapshots = [snap(80, 0), snap(100, 1), snap(100, 2)];
    const result = detectAnomaly(snapshots);
    expect(result!.severity).toBe("critical");
  });

  it("ignore les snapshots hors fenêtre 7j", () => {
    // Current 110, dernier 7j 100 → +10%, mais aussi un point à 30j 200 qu'on doit ignorer
    const snapshots = [
      snap(110, 0),
      snap(100, 1),
      snap(100, 5),
      snap(200, 30), // hors fenêtre — doit être ignoré
    ];
    const result = detectAnomaly(snapshots);
    expect(result).not.toBeNull();
    // baseline = (100 + 100) / 2 = 100, pas (100+100+200)/3 = 133
    expect(result!.baselineValue).toBe(100);
  });

  it("respecte windowDays custom", () => {
    const snapshots = [
      snap(110, 0),
      snap(100, 1),
      snap(100, 2),
      snap(50, 5), // dans fenêtre 7j mais hors fenêtre 3j
    ];
    const result3d = detectAnomaly(snapshots, { windowDays: 3 });
    expect(result3d!.baselineValue).toBe(100);

    const result7d = detectAnomaly(snapshots);
    // baseline = (100 + 100 + 50) / 3 = 83.33
    expect(result7d!.baselineValue).toBeCloseTo(83.33, 1);
  });
});
