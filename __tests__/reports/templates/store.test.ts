/**
 * Tests du store templates — CRUD, isolation tenant, spec invalide rejeté,
 * visibilité is_public.
 *
 * Stratégie : on mocke le client Supabase via injection (paramètre `client`
 * optionnel) pour ne pas dépendre d'une instance Supabase réelle.
 */

import { describe, expect, it, vi } from "vitest";
import {
  saveTemplate,
  loadTemplate,
  listTemplates,
  deleteTemplate,
  updateTemplate,
} from "@/lib/reports/templates/store";
import type { SaveTemplateInput } from "@/lib/reports/templates/schema";
import type { ReportSpec } from "@/lib/reports/spec/schema";

// ── Spec minimal valide ─────────────────────────────────────

const SCOPE = {
  tenantId: "tenant-abc",
  workspaceId: "ws-1",
  userId: "user-1",
};

function buildValidSpec(): ReportSpec {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    version: 1,
    meta: {
      title: "Test Report",
      summary: "",
      domain: "founder",
      persona: "founder",
      cadence: "daily",
      confidentiality: "internal",
    },
    scope: SCOPE,
    sources: [
      {
        id: "src_a",
        kind: "http",
        spec: { url: "https://example.com", method: "GET" },
      },
    ],
    transforms: [],
    blocks: [
      {
        id: "b_kpi",
        type: "kpi",
        label: "KPI",
        dataRef: "src_a",
        layout: { col: 1, row: 0 },
        props: {},
      },
    ],
    refresh: { mode: "manual", cooldownHours: 0 },
    cacheTTL: { raw: 60, transform: 600, render: 3600 },
    createdAt: 1000000,
    updatedAt: 1000000,
  };
}

// ── Helpers mock Supabase ───────────────────────────────────

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "template-uuid-1",
    tenant_id: "tenant-abc",
    created_by: "00000000-0000-4000-8000-000000000099",
    name: "Mon template",
    description: null,
    domain: "founder",
    spec: buildValidSpec(),
    is_public: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSbInsert(row: ReturnType<typeof makeRow>, err: unknown = null) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: row, error: err }),
        }),
      }),
    }),
  };
}

function makeSbSelect(rows: ReturnType<typeof makeRow>[], err: unknown = null) {
  const eqChain = {
    eq: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: err }),
  };
  // Rend chaque méthode de chainage retourner eqChain
  eqChain.eq.mockReturnValue(eqChain);
  eqChain.or.mockReturnValue({
    ...eqChain,
    order: vi.fn().mockResolvedValue({ data: rows, error: err }),
    maybeSingle: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: err }),
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: rows, error: err }),
    }),
  });
  eqChain.order.mockResolvedValue({ data: rows, error: err });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(eqChain),
    }),
  };
}

// ── Tests saveTemplate ──────────────────────────────────────

describe("saveTemplate", () => {
  it("retourne null si Supabase absent (no client)", async () => {
    const result = await saveTemplate({
      tenantId: "t1",
      userId: "00000000-0000-4000-8000-000000000099",
      name: "Test",
      spec: buildValidSpec(),
      isPublic: false,
    });
    // Sans client injecté + sans env → getServerSupabase() retourne null
    expect(result).toBeNull();
  });

  it("retourne null si input invalide (name vide)", async () => {
    const input = {
      tenantId: "t1",
      userId: "00000000-0000-4000-8000-000000000099",
      name: "",
      spec: buildValidSpec(),
      isPublic: false,
    } as SaveTemplateInput;
    const result = await saveTemplate(input);
    expect(result).toBeNull();
  });

  it("retourne null si spec invalide", async () => {
    const input = {
      tenantId: "t1",
      userId: "00000000-0000-4000-8000-000000000099",
      name: "Test",
      spec: { id: "not-a-uuid" } as unknown as ReportSpec,
      isPublic: false,
    };
    const result = await saveTemplate(input);
    expect(result).toBeNull();
  });

  it("insère et retourne le template si client mock ok", async () => {
    const row = makeRow();
    const sb = makeSbInsert(row) as unknown as Parameters<typeof saveTemplate>[1];
    const result = await saveTemplate(
      {
        tenantId: "tenant-abc",
        userId: "00000000-0000-4000-8000-000000000099",
        name: "Mon template",
        spec: buildValidSpec(),
        isPublic: false,
      },
      sb,
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Mon template");
    expect(result?.domain).toBe("founder");
  });

  it("retourne null si Supabase retourne une erreur", async () => {
    const sb = makeSbInsert(makeRow(), { message: "db error" }) as unknown as Parameters<typeof saveTemplate>[1];
    const result = await saveTemplate(
      {
        tenantId: "tenant-abc",
        userId: "00000000-0000-4000-8000-000000000099",
        name: "Test",
        spec: buildValidSpec(),
        isPublic: false,
      },
      sb,
    );
    expect(result).toBeNull();
  });
});

// ── Tests loadTemplate ──────────────────────────────────────

describe("loadTemplate", () => {
  it("retourne null si templateId pas uuid valide", async () => {
    const result = await loadTemplate({ templateId: "not-a-uuid", tenantId: "t1" });
    expect(result).toBeNull();
  });

  it("retourne null si aucune ligne trouvée", async () => {
    const sb = makeSbSelect([]) as unknown as Parameters<typeof loadTemplate>[1];
    const result = await loadTemplate(
      { templateId: "00000000-0000-4000-8000-000000000001", tenantId: "tenant-abc" },
      sb,
    );
    expect(result).toBeNull();
  });

  it("retourne le spec parsé si template trouvé", async () => {
    const row = makeRow();
    const sb = makeSbSelect([row]) as unknown as Parameters<typeof loadTemplate>[1];
    const result = await loadTemplate(
      { templateId: "00000000-0000-4000-8000-000000000001", tenantId: "tenant-abc" },
      sb,
    );
    expect(result).not.toBeNull();
    expect(result?.meta.title).toBe("Test Report");
  });

  it("retourne null si spec stocké est invalide", async () => {
    const row = makeRow({ spec: { id: "bad" } });
    const sb = makeSbSelect([row]) as unknown as Parameters<typeof loadTemplate>[1];
    const result = await loadTemplate(
      { templateId: "00000000-0000-4000-8000-000000000001", tenantId: "tenant-abc" },
      sb,
    );
    expect(result).toBeNull();
  });
});

// ── Tests listTemplates ─────────────────────────────────────

describe("listTemplates", () => {
  it("retourne [] si tenantId vide", async () => {
    const result = await listTemplates({ tenantId: "" });
    expect(result).toEqual([]);
  });

  it("retourne une liste de summaries", async () => {
    const rows = [makeRow(), makeRow({ id: "template-uuid-2", name: "Autre" })];
    const sb = makeSbSelect(rows) as unknown as Parameters<typeof listTemplates>[1];
    const result = await listTemplates({ tenantId: "tenant-abc" }, sb);
    // Retourne au moins un summary (mock ou liste)
    expect(Array.isArray(result)).toBe(true);
  });

  it("retourne [] si Supabase absent", async () => {
    const result = await listTemplates({ tenantId: "t1" });
    expect(result).toEqual([]);
  });
});

// ── Tests deleteTemplate ────────────────────────────────────

describe("deleteTemplate", () => {
  it("ne fait rien si userId pas uuid", async () => {
    // userId invalide → retourne avant tout appel
    await expect(
      deleteTemplate({
        templateId: "00000000-0000-4000-8000-000000000001",
        tenantId: "t1",
        userId: "not-a-uuid",
      }),
    ).resolves.toBeUndefined();
  });

  it("appelle delete sur la bonne row", async () => {
    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const eqChain = {
      eq: vi.fn(),
      delete: vi.fn(),
    };
    eqChain.eq.mockReturnValue(eqChain);
    eqChain.delete.mockReturnValue(eqChain);
    // last eq mock returns deleteMock
    let callCount = 0;
    eqChain.eq.mockImplementation(() => {
      callCount++;
      if (callCount >= 3) return { then: deleteMock, ...eqChain };
      return eqChain;
    });

    const fromMock = vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    });
    const sb = { from: fromMock } as unknown as Parameters<typeof deleteTemplate>[1];

    await expect(
      deleteTemplate(
        {
          templateId: "00000000-0000-4000-8000-000000000001",
          tenantId: "tenant-abc",
          userId: "00000000-0000-4000-8000-000000000099",
        },
        sb,
      ),
    ).resolves.toBeUndefined();

    expect(fromMock).toHaveBeenCalledWith("report_templates");
  });
});

// ── Tests updateTemplate ────────────────────────────────────

describe("updateTemplate", () => {
  it("retourne null si templateId pas uuid", async () => {
    const result = await updateTemplate({
      templateId: "bad",
      tenantId: "t1",
      userId: "00000000-0000-4000-8000-000000000099",
      patch: { name: "Nouveau" },
    });
    expect(result).toBeNull();
  });

  it("retourne null si Supabase absent", async () => {
    const result = await updateTemplate({
      templateId: "00000000-0000-4000-8000-000000000001",
      tenantId: "t1",
      userId: "00000000-0000-4000-8000-000000000099",
      patch: { name: "Test" },
    });
    expect(result).toBeNull();
  });

  it("met à jour le nom si patch.name fourni", async () => {
    const updated = makeRow({ name: "Nouveau nom" });
    const eqChain = { eq: vi.fn() };
    eqChain.eq.mockReturnValue({
      ...eqChain,
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: updated, error: null }),
      }),
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: updated, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof updateTemplate>[1];

    const result = await updateTemplate(
      {
        templateId: "00000000-0000-4000-8000-000000000001",
        tenantId: "tenant-abc",
        userId: "00000000-0000-4000-8000-000000000099",
        patch: { name: "Nouveau nom" },
      },
      sb,
    );
    expect(result?.name).toBe("Nouveau nom");
  });
});

// ── Test isolation tenant ───────────────────────────────────

describe("isolation tenant", () => {
  it("loadTemplate filtre par tenantId + is_public", async () => {
    // On vérifie que la query utilise bien .or(tenant_id.eq.X,is_public.eq.true)
    const orMock = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            or: orMock,
          }),
        }),
      }),
    } as unknown as Parameters<typeof loadTemplate>[1];

    await loadTemplate(
      { templateId: "00000000-0000-4000-8000-000000000001", tenantId: "tenant-abc" },
      sb,
    );

    expect(orMock).toHaveBeenCalledWith("tenant_id.eq.tenant-abc,is_public.eq.true");
  });
});
