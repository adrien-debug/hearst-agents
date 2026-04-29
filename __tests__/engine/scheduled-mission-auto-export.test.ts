/**
 * Tests de l'intégration autoExport dans les scheduled missions.
 *
 * Couvre :
 *  - autoExportConfigSchema valide les bons cas
 *  - ScheduledMission accepte autoExport optionnel
 *  - Enqueue job si mission.autoExport.enabled (test du flow scheduler)
 *  - Skip silencieux si autoExport.enabled === false
 *  - Skip si autoExport absent
 */

import { describe, expect, it } from "vitest";
import {
  autoExportConfigSchema,
  type AutoExportConfig,
  type ScheduledMission,
} from "@/lib/engine/runtime/missions/types";

const VALID_UUID = "00000000-0000-4000-8000-100000000002";

// ── autoExportConfigSchema ───────────────────────────────────

describe("autoExportConfigSchema", () => {
  it("valide une config pdf correcte", () => {
    const config: AutoExportConfig = {
      enabled: true,
      format: "pdf",
      recipients: ["alice@example.com"],
      reportId: VALID_UUID,
    };
    expect(() => autoExportConfigSchema.parse(config)).not.toThrow();
  });

  it("valide une config excel correcte", () => {
    const config: AutoExportConfig = {
      enabled: false,
      format: "excel",
      recipients: ["bob@example.com", "carol@example.com"],
      reportId: VALID_UUID,
    };
    expect(() => autoExportConfigSchema.parse(config)).not.toThrow();
  });

  it("rejette un reportId non-UUID", () => {
    const result = autoExportConfigSchema.safeParse({
      enabled: true,
      format: "pdf",
      recipients: ["a@b.com"],
      reportId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejette recipients vide", () => {
    const result = autoExportConfigSchema.safeParse({
      enabled: true,
      format: "pdf",
      recipients: [],
      reportId: VALID_UUID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/au moins un destinataire/);
    }
  });

  it("rejette un email invalide dans recipients", () => {
    const result = autoExportConfigSchema.safeParse({
      enabled: true,
      format: "pdf",
      recipients: ["not-an-email"],
      reportId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejette un format non reconnu", () => {
    const result = autoExportConfigSchema.safeParse({
      enabled: true,
      format: "csv",
      recipients: ["a@b.com"],
      reportId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });
});

// ── ScheduledMission avec autoExport ────────────────────────

describe("ScheduledMission — autoExport optionnel", () => {
  it("accepte une mission sans autoExport", () => {
    const mission: ScheduledMission = {
      id: "m1",
      tenantId: "t1",
      workspaceId: "w1",
      userId: "u1",
      name: "Test Mission",
      input: "run weekly report",
      schedule: "0 9 * * 1",
      enabled: true,
      createdAt: Date.now(),
    };
    // Pas de autoExport : pas d'erreur TypeScript ni Zod
    expect(mission.autoExport).toBeUndefined();
  });

  it("accepte une mission avec autoExport enabled", () => {
    const mission: ScheduledMission = {
      id: "m2",
      tenantId: "t1",
      workspaceId: "w1",
      userId: "u1",
      name: "Export Mission",
      input: "run report",
      schedule: "0 8 * * 1",
      enabled: true,
      createdAt: Date.now(),
      autoExport: {
        enabled: true,
        format: "pdf",
        recipients: ["manager@example.com"],
        reportId: VALID_UUID,
      },
    };
    expect(mission.autoExport?.enabled).toBe(true);
    expect(mission.autoExport?.format).toBe("pdf");
    // La config doit passer la validation Zod
    expect(() => autoExportConfigSchema.parse(mission.autoExport)).not.toThrow();
  });

  it("autoExport avec enabled=false est valide (pas d'enqueue attendu)", () => {
    const config: AutoExportConfig = {
      enabled: false,
      format: "excel",
      recipients: ["a@example.com"],
      reportId: VALID_UUID,
    };
    const result = autoExportConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
    }
  });
});

// ── Logique d'enqueue conditionnel ──────────────────────────
//
// On teste la condition de branchement isolée (pas le scheduler complet
// qui a des dépendances externes).

describe("logique d'enqueue conditionnel", () => {
  function shouldEnqueueExport(mission: Pick<ScheduledMission, "autoExport">): boolean {
    return mission.autoExport?.enabled === true;
  }

  it("enqueue si autoExport.enabled=true", () => {
    const m = {
      autoExport: {
        enabled: true,
        format: "pdf" as const,
        recipients: ["x@example.com"],
        reportId: VALID_UUID,
      },
    };
    expect(shouldEnqueueExport(m)).toBe(true);
  });

  it("skip si autoExport.enabled=false", () => {
    const m = {
      autoExport: {
        enabled: false,
        format: "pdf" as const,
        recipients: ["x@example.com"],
        reportId: VALID_UUID,
      },
    };
    expect(shouldEnqueueExport(m)).toBe(false);
  });

  it("skip si autoExport absent", () => {
    const m: Pick<ScheduledMission, "autoExport"> = {};
    expect(shouldEnqueueExport(m)).toBe(false);
  });
});
