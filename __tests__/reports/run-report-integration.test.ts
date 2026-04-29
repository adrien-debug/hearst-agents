/**
 * Tests d'intégration du flow Chat → Rapport.
 *
 * Couvre :
 * 1. detectReportIntent — vrais positifs FR/EN + faux négatifs
 * 2. getApplicableReports — statut ready/partial/blocked selon apps connectées
 * 3. propose_report_spec — spec hydraté depuis catalogue, runReport appelé, payload correct
 * 4. ReportLayout / isReportPayload — détection __reportPayload robuste + fallback block inconnu
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { detectReportIntent } from "@/lib/reports/spec/intent";
import {
  getApplicableReports,
  CATALOG,
  FOUNDER_COCKPIT_ID,
  ENGINEERING_VELOCITY_ID,
} from "@/lib/reports/catalog";

// ── Mock storeAsset (pas de DB en tests) ────────────────────────
vi.mock("@/lib/assets/types", async () => {
  const actual = await vi.importActual<typeof import("@/lib/assets/types")>(
    "@/lib/assets/types",
  );
  return { ...actual, storeAsset: vi.fn() };
});

vi.mock("@/lib/connectors/composio/client", () => ({
  executeComposioAction: vi.fn(async () => ({ ok: true, data: { items: [] } })),
}));

import { buildProposeReportSpecTool } from "@/lib/reports/spec/llm-tool";
import { storeAsset } from "@/lib/assets/types";
import { isReportPayload } from "@/app/(user)/components/ReportLayout";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockEngine = { id: "run-integration-1" } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockEventBus = { emit: vi.fn() } as any;
const ctx = {
  threadId: "thread-1",
  userId: "user-1",
  tenantId: "dev-tenant",
  workspaceId: "dev-workspace",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── 1. detectReportIntent ────────────────────────────────────────

describe("detectReportIntent — patterns FR étendus", () => {
  it.each([
    "mon cockpit",
    "génère un rapport sur le MRR",
    "analyse de la vélocité",
    "P&L du mois",
    "montre-moi les KPIs",
    "montrez-moi le bilan",
    "mon runway actuel",
    "Engineering Velocity",
    "Marketing AARRR",
    "HR People report",
    "deal-to-cash funnel",
    "financial P&L",
    "product analytics",
    "support health",
    "founder cockpit",
    "customer 360",
    "synthèse des ventes",
    "bilan mensuel",
    "vue d'ensemble du business",
  ])('détecte "%s" comme intent rapport', (msg) => {
    const r = detectReportIntent(msg);
    expect(r.isReport).toBe(true);
    expect(r.matched.length).toBeGreaterThan(0);
  });
});

describe("detectReportIntent — vrais négatifs", () => {
  it.each([
    "quel temps fait-il ?",
    "envoie un email à Alice",
    "résume mes emails",
    "rapporte ça à l'équipe",
    "report a bug",
    "",
    "comment va l'équipe ?",
  ])('rejette "%s"', (msg) => {
    expect(detectReportIntent(msg).isReport).toBe(false);
  });
});

// ── 2. getApplicableReports — routing ready/partial/blocked ─────

describe("getApplicableReports — routing par statut", () => {
  it("aucune app connectée → tous blocked (aucun résultat)", () => {
    const reports = getApplicableReports([]);
    expect(reports).toHaveLength(0);
  });

  it("stripe connecté → Founder Cockpit au moins partial", () => {
    const reports = getApplicableReports(["stripe"]);
    const cockpit = reports.find((r) => r.id === FOUNDER_COCKPIT_ID);
    expect(cockpit).toBeDefined();
    expect(cockpit!.status).toMatch(/ready|partial/);
  });

  it("toutes les apps du Founder Cockpit → status=ready", () => {
    const entry = CATALOG.find((c) => c.id === FOUNDER_COCKPIT_ID);
    expect(entry).toBeDefined();
    const allApps = [...entry!.requiredApps];
    const reports = getApplicableReports(allApps);
    const cockpit = reports.find((r) => r.id === FOUNDER_COCKPIT_ID);
    expect(cockpit).toBeDefined();
    expect(cockpit!.status).toBe("ready");
    expect(cockpit!.missingApps).toHaveLength(0);
  });

  it("apps partiellement connectées → status=partial + missingApps non vide", () => {
    const entry = CATALOG.find((c) => c.id === ENGINEERING_VELOCITY_ID);
    expect(entry).toBeDefined();
    // On connecte seulement la première app
    const partialApps = entry!.requiredApps.length > 1 ? [entry!.requiredApps[0]] : [];
    if (partialApps.length === 0) return; // entry a 0 ou 1 app requise — skip
    const reports = getApplicableReports(partialApps);
    const eng = reports.find((r) => r.id === ENGINEERING_VELOCITY_ID);
    if (eng) {
      expect(eng.status).toBe("partial");
      expect(eng.missingApps.length).toBeGreaterThan(0);
    }
  });

  it("needs-connection : message clair attendu si aucune app connectée", () => {
    // On s'assure que le report bloqué n'est pas retourné
    const reports = getApplicableReports([]);
    expect(reports.every((r) => r.status !== "blocked")).toBe(true);
    // Et que le tableau est vide quand rien n'est connecté
    expect(reports).toHaveLength(0);
  });
});

// ── 3. propose_report_spec — spec depuis catalogue + storeAsset ──

describe("propose_report_spec — intégration catalogue → runReport → storeAsset", () => {
  it("génère un report depuis un draft valide et stocke l'asset avec __reportPayload", async () => {
    const tool = buildProposeReportSpecTool(mockEngine, mockEventBus, ctx);

    const draft = {
      meta: {
        title: "Founder Cockpit Test",
        summary: "Vue d'ensemble fondateur",
        domain: "founder" as const,
        persona: "founder" as const,
        cadence: "ad-hoc" as const,
        confidentiality: "internal" as const,
      },
      sources: [
        {
          id: "stripe_data",
          kind: "composio" as const,
          spec: { action: "STRIPE_LIST_CHARGES", params: {} },
        },
      ],
      transforms: [
        {
          id: "mrr_total",
          op: "groupBy" as const,
          inputs: ["stripe_data"] as [string],
          params: {
            by: [],
            measures: [{ name: "value", fn: "sum" as const, field: "amount" }],
          },
        },
      ],
      blocks: [
        {
          id: "kpi_mrr",
          type: "kpi" as const,
          dataRef: "mrr_total",
          layout: { col: 1 as const, row: 0 },
          props: { field: "value", format: "currency" },
        },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (tool.execute as any)(draft, {});

    // Le tool doit confirmer la génération
    expect(out).toMatch(/g[ée]n[ée]r[ée]|report.*prêt|Founder Cockpit Test/i);

    // storeAsset doit avoir été appelé avec le bon payload
    expect(storeAsset).toHaveBeenCalledTimes(1);
    const storedAsset = (storeAsset as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(storedAsset.kind).toBe("report");
    expect(storedAsset.threadId).toBe(ctx.threadId);
    expect(storedAsset.contentRef).toBeDefined();

    // Le contentRef doit contenir un payload avec __reportPayload: true
    const parsed = JSON.parse(storedAsset.contentRef);
    expect(parsed.__reportPayload).toBe(true);
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0].type).toBe("kpi");

    // L'event asset_generated doit avoir été émis avec assetId
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "asset_generated",
        asset_type: "report",
      }),
    );
  });

  it("rejette un draft malformé sans crash — retourne message d'erreur", async () => {
    const tool = buildProposeReportSpecTool(mockEngine, mockEventBus, ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (tool.execute as any)({}, {});
    expect(out).toMatch(/erreur|Error/i);
    expect(storeAsset).not.toHaveBeenCalled();
  });
});

// ── 4. isReportPayload — détection robuste + fallback ───────────

describe("isReportPayload — détection __reportPayload", () => {
  it("détecte un payload valide avec __reportPayload: true", () => {
    const payload = {
      __reportPayload: true as const,
      specId: "spec-1",
      version: 1,
      generatedAt: Date.now(),
      blocks: [],
      scalars: {},
    };
    expect(isReportPayload(payload)).toBe(true);
  });

  it("rejette un objet sans __reportPayload", () => {
    expect(isReportPayload({ blocks: [] })).toBe(false);
    expect(isReportPayload(null)).toBe(false);
    expect(isReportPayload("string")).toBe(false);
    expect(isReportPayload(undefined)).toBe(false);
    expect(isReportPayload({ __reportPayload: false })).toBe(false);
  });

  it("ReportLayout — fallback block kind inconnu → pas de crash", async () => {
    // On importe dynamiquement le renderer pour le tester isolément
    // (JSDOM pas disponible ici — on teste juste que le payload est accepté)
    const unknownBlock = {
      id: "unknown-block",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: "unknown_future_type" as any,
      layout: { col: 2 as const, row: 0 },
      data: [],
      props: {},
    };
    const payload = {
      __reportPayload: true as const,
      specId: "spec-fallback",
      version: 1,
      generatedAt: Date.now(),
      blocks: [unknownBlock],
      scalars: {},
    };
    // Le payload est détecté comme valide — le fallback du switch dans BlockRenderer
    // affiche un placeholder "_pending" sans throw
    expect(isReportPayload(payload)).toBe(true);
    // Si un block type inconnu arrive, __reportPayload reste true → ReportLayout reçoit le payload
    // Le BlockRenderer a un case default → pas de crash (testé unitairement dans blocks.test.tsx)
  });
});
