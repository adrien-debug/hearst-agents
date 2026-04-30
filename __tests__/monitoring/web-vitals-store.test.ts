/**
 * Tests : lib/monitoring/web-vitals-store.ts
 *
 * Couvre :
 * - recordVital : enregistrement et rolling window
 * - p75 : calcul correct sur tableau trié et non trié
 * - Éviction FIFO quand la fenêtre est pleine
 * - getSnapshot : shape correcte, ratings par métrique
 * - Mapping des ratings selon les seuils Google
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  WebVitalsStore,
  p75,
  VITAL_THRESHOLDS,
  VITALS_WINDOW_SIZE,
} from "@/lib/monitoring/web-vitals-store";
import type { VitalName } from "@/lib/monitoring/web-vitals-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(name: VitalName, value: number) {
  return { name, value, rating: "good" as const, delta: value, id: `${name}-${value}` };
}

// ---------------------------------------------------------------------------
// Tests p75
// ---------------------------------------------------------------------------

describe("p75()", () => {
  it("retourne 0 sur tableau vide", () => {
    expect(p75([])).toBe(0);
  });

  it("retourne la valeur unique si tableau de taille 1", () => {
    expect(p75([42])).toBe(42);
  });

  it("calcule le percentile 75 correctement sur [1,2,3,4]", () => {
    // pos = 0.75 * 3 = 2.25, base=2, rest=0.25 → 3 + 0.25*(4-3) = 3.25
    expect(p75([1, 2, 3, 4])).toBeCloseTo(3.25);
  });

  it("trie le tableau avant calcul (entrée non triée)", () => {
    expect(p75([4, 1, 3, 2])).toBeCloseTo(3.25);
  });

  it("ne mute pas le tableau d'entrée", () => {
    const arr = [4, 1, 3, 2];
    p75(arr);
    expect(arr).toEqual([4, 1, 3, 2]);
  });
});

// ---------------------------------------------------------------------------
// Tests WebVitalsStore
// ---------------------------------------------------------------------------

describe("WebVitalsStore", () => {
  let store: WebVitalsStore;

  beforeEach(() => {
    store = new WebVitalsStore();
  });

  it("snapshot initial : toutes les métriques à 0, count 0", () => {
    const snap = store.getSnapshot();
    for (const name of ["LCP", "CLS", "INP", "TTFB", "FCP"] as VitalName[]) {
      expect(snap[name].count).toBe(0);
      expect(snap[name].p75).toBe(0);
      expect(snap[name].rating).toBe("good"); // pas de données → "good" par défaut
    }
  });

  it("enregistre une mesure LCP et la retrouve dans le snapshot", () => {
    store.recordVital(makeRecord("LCP", 1000));
    const snap = store.getSnapshot();
    expect(snap.LCP.count).toBe(1);
    expect(snap.LCP.p75).toBe(1000);
  });

  it("rolling window : éviction FIFO après VITALS_WINDOW_SIZE mesures", () => {
    // Remplit avec la valeur 9999, puis on pousse suffisamment de 1 pour
    // évincer la valeur 9999 (FIFO : premier entré, premier sorti)
    store.recordVital(makeRecord("LCP", 9999));
    // Ajoute VITALS_WINDOW_SIZE mesures à 1 → la valeur 9999 est évincée
    for (let i = 0; i < VITALS_WINDOW_SIZE; i++) {
      store.recordVital(makeRecord("LCP", 1));
    }
    const snap = store.getSnapshot();
    // Le count ne doit pas dépasser la window size
    expect(snap.LCP.count).toBe(VITALS_WINDOW_SIZE);
    // La valeur 9999 a été évincée, p75 = 1 (toutes les valeurs sont 1)
    expect(snap.LCP.p75).toBe(1);
  });

  it("métriques indépendantes les unes des autres", () => {
    store.recordVital(makeRecord("LCP", 1200));
    store.recordVital(makeRecord("FCP", 900));
    const snap = store.getSnapshot();
    expect(snap.LCP.count).toBe(1);
    expect(snap.FCP.count).toBe(1);
    expect(snap.CLS.count).toBe(0);
    expect(snap.INP.count).toBe(0);
    expect(snap.TTFB.count).toBe(0);
  });

  it("reset() vide le store", () => {
    store.recordVital(makeRecord("LCP", 1500));
    store.reset();
    const snap = store.getSnapshot();
    expect(snap.LCP.count).toBe(0);
  });

  // ── Mapping des ratings ─────────────────────────────────────────────────

  describe("rating mapping", () => {
    it("LCP : good si ≤ 2500 ms", () => {
      store.recordVital(makeRecord("LCP", VITAL_THRESHOLDS.LCP.good));
      expect(store.getSnapshot().LCP.rating).toBe("good");
    });

    it("LCP : needs-improvement si entre good et poor", () => {
      store.recordVital(makeRecord("LCP", VITAL_THRESHOLDS.LCP.good + 1));
      expect(store.getSnapshot().LCP.rating).toBe("needs-improvement");
    });

    it("LCP : poor si > 4000 ms", () => {
      store.recordVital(makeRecord("LCP", VITAL_THRESHOLDS.LCP.poor + 1));
      expect(store.getSnapshot().LCP.rating).toBe("poor");
    });

    it("CLS : good si ≤ 0.1", () => {
      store.recordVital(makeRecord("CLS", 0.05));
      expect(store.getSnapshot().CLS.rating).toBe("good");
    });

    it("CLS : poor si > 0.25", () => {
      store.recordVital(makeRecord("CLS", 0.3));
      expect(store.getSnapshot().CLS.rating).toBe("poor");
    });

    it("INP : good si ≤ 200 ms", () => {
      store.recordVital(makeRecord("INP", 150));
      expect(store.getSnapshot().INP.rating).toBe("good");
    });

    it("TTFB : good si ≤ 800 ms", () => {
      store.recordVital(makeRecord("TTFB", 400));
      expect(store.getSnapshot().TTFB.rating).toBe("good");
    });

    it("FCP : needs-improvement si entre 1800 et 3000 ms", () => {
      store.recordVital(makeRecord("FCP", 2000));
      expect(store.getSnapshot().FCP.rating).toBe("needs-improvement");
    });
  });

  // ── Shape du snapshot ───────────────────────────────────────────────────

  it("snapshot contient exactement les 5 métriques attendues", () => {
    const snap = store.getSnapshot();
    const keys = Object.keys(snap).sort();
    expect(keys).toEqual(["CLS", "FCP", "INP", "LCP", "TTFB"]);
  });

  it("chaque entrée du snapshot a les champs p75, rating, count", () => {
    store.recordVital(makeRecord("LCP", 2000));
    const snap = store.getSnapshot();
    const entry = snap.LCP;
    expect(typeof entry.p75).toBe("number");
    expect(["good", "needs-improvement", "poor"]).toContain(entry.rating);
    expect(typeof entry.count).toBe("number");
  });

  // ── p75 sur plusieurs mesures ───────────────────────────────────────────

  it("p75 correct sur 4 mesures LCP [1000, 2000, 3000, 4000]", () => {
    [1000, 2000, 3000, 4000].forEach((v) => store.recordVital(makeRecord("LCP", v)));
    // p75 de [1000,2000,3000,4000] : pos = 0.75*3=2.25 → 3000+0.25*(4000-3000) = 3250
    expect(store.getSnapshot().LCP.p75).toBeCloseTo(3250);
    // 3250 ms → needs-improvement (seuil good=2500, seuil poor=4000)
    expect(store.getSnapshot().LCP.rating).toBe("needs-improvement");
  });
});
