/**
 * Tests — store marketplace.
 *
 * - validatePayload : valide un payload selon le kind
 * - publishTemplate : refuse les payloads invalides, retourne null si Supabase absent
 * - listTemplates / getTemplate : retournent vides quand Supabase absent
 * - rate-limit : bloque au 11ᵉ hit dans la même fenêtre
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: vi.fn(() => null),
}));

import {
  publishTemplate,
  listTemplates,
  getTemplate,
  cloneTemplate,
  rateTemplate,
  reportTemplate,
  archiveTemplate,
} from "@/lib/marketplace/store";
import { validatePayload } from "@/lib/marketplace/types";
import {
  checkRateLimit,
  __clearRateLimits,
} from "@/lib/marketplace/rate-limit";
import { dailyStandupTemplate } from "@/lib/workflows/templates/daily-standup";

describe("marketplace/types — validatePayload", () => {
  it("workflow : accepte un graph minimal", () => {
    const result = validatePayload("workflow", dailyStandupTemplate());
    expect(result.ok).toBe(true);
  });

  it("workflow : rejette un graph sans nodes", () => {
    const result = validatePayload("workflow", {
      nodes: [],
      edges: [],
      startNodeId: "x",
    });
    expect(result.ok).toBe(false);
  });

  it("persona : accepte un payload minimal", () => {
    const result = validatePayload("persona", {
      name: "Test",
      tone: "direct",
    });
    expect(result.ok).toBe(true);
  });

  it("persona : rejette un name vide", () => {
    const result = validatePayload("persona", { name: "" });
    expect(result.ok).toBe(false);
  });

  it("report_spec : rejette un objet vide", () => {
    const result = validatePayload("report_spec", {});
    expect(result.ok).toBe(false);
  });
});

describe("marketplace/store — fallback Supabase absent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishTemplate retourne null quand Supabase indisponible", async () => {
    const out = await publishTemplate({
      kind: "persona",
      title: "Test",
      payload: { name: "P" },
      authorUserId: "u",
      authorTenantId: "t",
    });
    expect(out).toBeNull();
  });

  it("publishTemplate retourne null si payload invalide (ne tente pas Supabase)", async () => {
    const out = await publishTemplate({
      kind: "workflow",
      title: "Bad",
      payload: { nodes: [], edges: [], startNodeId: "x" },
      authorUserId: "u",
      authorTenantId: "t",
    });
    expect(out).toBeNull();
  });

  it("publishTemplate retourne null si tags invalides (>5)", async () => {
    const out = await publishTemplate({
      kind: "persona",
      title: "Test",
      payload: { name: "P" },
      tags: ["a", "b", "c", "d", "e", "f"],
      authorUserId: "u",
      authorTenantId: "t",
    });
    expect(out).toBeNull();
  });

  it("listTemplates retourne [] quand Supabase indisponible", async () => {
    const out = await listTemplates({ kind: "workflow" });
    expect(out).toEqual([]);
  });

  it("getTemplate retourne null quand Supabase indisponible", async () => {
    const out = await getTemplate("any-id");
    expect(out).toBeNull();
  });

  it("cloneTemplate retourne ok=false avec error supabase_unavailable", async () => {
    const out = await cloneTemplate("any-id", "user", "tenant", "ws");
    expect(out.ok).toBe(false);
    expect(out.error).toBe("supabase_unavailable");
  });

  it("rateTemplate refuse une note hors plage", async () => {
    const out = await rateTemplate("id", "u", 6);
    expect(out).toBe(false);
  });

  it("rateTemplate retourne false quand Supabase absent", async () => {
    const out = await rateTemplate("id", "u", 5);
    expect(out).toBe(false);
  });

  it("reportTemplate refuse une raison vide", async () => {
    const out = await reportTemplate("id", "u", "");
    expect(out).toBe(false);
  });

  it("archiveTemplate retourne false quand Supabase absent", async () => {
    const out = await archiveTemplate("id", "u");
    expect(out).toBe(false);
  });
});

describe("marketplace/rate-limit", () => {
  beforeEach(() => {
    __clearRateLimits();
  });

  it("autorise jusqu'à 10 hits par fenêtre", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("u1", "publish")).toBe(true);
    }
    expect(checkRateLimit("u1", "publish")).toBe(false);
  });

  it("isole par action et user", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("u1", "publish");
    expect(checkRateLimit("u1", "publish")).toBe(false);
    // Autre action : ok
    expect(checkRateLimit("u1", "clone")).toBe(true);
    // Autre user : ok
    expect(checkRateLimit("u2", "publish")).toBe(true);
  });
});
