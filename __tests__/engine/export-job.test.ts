/**
 * Tests du job export_scheduled_report.
 *
 * Couvre :
 *  - Happy path : mock export + mock email → ok + emailsSent=1
 *  - Payload invalide → erreur claire
 *  - recipients vide → validation Zod bloque
 *  - getSpec introuvable → erreur propre, pas de throw
 *  - runExport qui throw → erreur propre, pas de throw
 *  - notifyRecipients : email sender qui échoue → emailsSent=0, job ok quand même
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runExportScheduledReportJob,
  buildExportJobPayload,
  exportScheduledReportPayloadSchema,
} from "@/lib/engine/runtime/missions/export-job";
import { setEmailSender } from "@/lib/notifications/channels";

// ── Helpers ─────────────────────────────────────────────────

const VALID_UUID = "00000000-0000-4000-8000-100000000001";
const TENANT = "tenant-test";
const MISSION = "mission-001";

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    assetId: VALID_UUID,
    tenantId: TENANT,
    missionId: MISSION,
    format: "pdf",
    recipients: ["alice@example.com"],
    ...overrides,
  };
}

const MOCK_SPEC = {
  id: VALID_UUID,
  version: 1,
  meta: {
    title: "Test Report",
    domain: "ops",
    persona: "ops",
    cadence: "weekly",
    confidentiality: "internal",
    summary: "",
  },
} as unknown as import("@/lib/reports/spec/schema").ReportSpec;

const MOCK_EXPORT_RESULT = {
  format: "pdf" as const,
  storageKey: "report-exports/tenant/asset/ts.pdf",
  storageUrl: "https://storage.example.com/report.pdf",
  size: 1234,
  shareUrl: "https://hearst.app/share/abc",
  shareExpiresAt: "2026-05-30T00:00:00.000Z",
};

// Silence logs
let consoleSpy: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  consoleSpy = [
    vi.spyOn(console, "log").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "error").mockImplementation(() => {}),
  ];
});

afterEach(() => {
  consoleSpy.forEach((s) => s.mockRestore());
  // Restaure le stub par défaut
  setEmailSender({
    async send() {
      return { ok: false, error: "email-sender-not-configured" };
    },
  });
});

// ── Tests payload Zod ────────────────────────────────────────

describe("exportScheduledReportPayloadSchema", () => {
  it("valide un payload correct", () => {
    const result = exportScheduledReportPayloadSchema.safeParse(makePayload());
    expect(result.success).toBe(true);
  });

  it("rejette un assetId non-UUID", () => {
    const result = exportScheduledReportPayloadSchema.safeParse(
      makePayload({ assetId: "not-a-uuid" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejette recipients vide", () => {
    const result = exportScheduledReportPayloadSchema.safeParse(
      makePayload({ recipients: [] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues[0]?.message ?? "";
      expect(msg).toMatch(/au moins un destinataire/);
    }
  });

  it("rejette un format invalide", () => {
    const result = exportScheduledReportPayloadSchema.safeParse(
      makePayload({ format: "csv" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejette un recipient qui n'est pas un email", () => {
    const result = exportScheduledReportPayloadSchema.safeParse(
      makePayload({ recipients: ["not-an-email"] }),
    );
    expect(result.success).toBe(false);
  });
});

// ── Tests runExportScheduledReportJob ───────────────────────

describe("runExportScheduledReportJob — happy path", () => {
  it("retourne ok=true avec emailsSent=1 (email sender configuré)", async () => {
    setEmailSender({
      async send() {
        return { ok: true, id: "msg-001" };
      },
    });

    const result = await runExportScheduledReportJob(makePayload(), {
      getSpec: async () => MOCK_SPEC,
      runExport: async () => MOCK_EXPORT_RESULT,
    });

    expect(result.ok).toBe(true);
    expect(result.format).toBe("pdf");
    expect(result.assetId).toBe(VALID_UUID);
    expect(result.storageKey).toBe(MOCK_EXPORT_RESULT.storageKey);
    expect(result.shareUrl).toBe(MOCK_EXPORT_RESULT.shareUrl);
    expect(result.emailsSent).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("retourne emailsSent=0 si email sender échoue (job ok quand même)", async () => {
    setEmailSender({
      async send() {
        return { ok: false, error: "smtp-error" };
      },
    });

    const result = await runExportScheduledReportJob(makePayload(), {
      getSpec: async () => MOCK_SPEC,
      runExport: async () => MOCK_EXPORT_RESULT,
    });

    expect(result.ok).toBe(true);
    expect(result.emailsSent).toBe(0);
  });

  it("notifie plusieurs recipients en un seul call", async () => {
    const sendMock = vi.fn().mockResolvedValue({ ok: true });
    setEmailSender({ send: sendMock });

    await runExportScheduledReportJob(
      makePayload({ recipients: ["a@example.com", "b@example.com", "c@example.com"] }),
      {
        getSpec: async () => MOCK_SPEC,
        runExport: async () => MOCK_EXPORT_RESULT,
      },
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0] as { to: string[] };
    expect(call.to).toHaveLength(3);
  });

  it("format=excel est normalisé vers xlsx pour runExport", async () => {
    const runExportMock = vi
      .fn()
      .mockResolvedValue({ ...MOCK_EXPORT_RESULT, format: "xlsx" });

    await runExportScheduledReportJob(makePayload({ format: "excel" }), {
      getSpec: async () => MOCK_SPEC,
      runExport: runExportMock,
    });

    expect(runExportMock).toHaveBeenCalledWith(
      expect.objectContaining({ format: "xlsx" }),
    );
  });
});

describe("runExportScheduledReportJob — erreurs", () => {
  it("retourne ok=false si payload invalide (pas de throw)", async () => {
    const result = await runExportScheduledReportJob({
      assetId: "not-a-uuid",
      tenantId: TENANT,
      missionId: MISSION,
      format: "pdf",
      recipients: ["alice@example.com"],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/payload invalide/);
    expect(result.emailsSent).toBe(0);
  });

  it("retourne ok=false si getSpec renvoie null (spec introuvable)", async () => {
    const result = await runExportScheduledReportJob(makePayload(), {
      getSpec: async () => null,
      runExport: async () => MOCK_EXPORT_RESULT,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/introuvable/);
    expect(result.emailsSent).toBe(0);
  });

  it("retourne ok=false si getSpec throw (pas de re-throw)", async () => {
    const result = await runExportScheduledReportJob(makePayload(), {
      getSpec: async () => {
        throw new Error("DB connexion failed");
      },
      runExport: async () => MOCK_EXPORT_RESULT,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/DB connexion failed/);
  });

  it("retourne ok=false si runExport throw (pas de re-throw)", async () => {
    const result = await runExportScheduledReportJob(makePayload(), {
      getSpec: async () => MOCK_SPEC,
      runExport: async () => {
        throw new Error("Export module not yet initialized");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Export module not yet initialized/);
  });
});

// ── buildExportJobPayload ────────────────────────────────────

describe("buildExportJobPayload", () => {
  it("construit un payload valide depuis une AutoExportConfig", () => {
    const config = {
      enabled: true,
      format: "pdf" as const,
      recipients: ["bob@example.com"],
      reportId: VALID_UUID,
    };

    const payload = buildExportJobPayload(MISSION, TENANT, config);

    expect(payload.assetId).toBe(VALID_UUID);
    expect(payload.tenantId).toBe(TENANT);
    expect(payload.missionId).toBe(MISSION);
    expect(payload.format).toBe("pdf");
    expect(payload.recipients).toEqual(["bob@example.com"]);

    // Le payload doit passer la validation Zod
    const parsed = exportScheduledReportPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });
});
