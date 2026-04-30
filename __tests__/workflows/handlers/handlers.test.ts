/**
 * Tests workflow handlers — registry + comportement individuel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/connectors/composio/client", () => ({
  executeComposioAction: vi.fn(),
}));

import { executeWorkflowTool, WORKFLOW_HANDLERS } from "@/lib/workflows/handlers";
import { executeComposioAction } from "@/lib/connectors/composio/client";

const CTX = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "ws-1",
  runId: "run-1",
};

const ORIGINAL_ANTHROPIC = process.env.ANTHROPIC_API_KEY;

describe("workflow handlers registry", () => {
  beforeEach(() => {
    vi.mocked(executeComposioAction).mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_ANTHROPIC === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC;
  });

  it("expose les 5 handlers attendus", () => {
    expect(Object.keys(WORKFLOW_HANDLERS).sort()).toEqual(
      [
        "ai_classify_priority",
        "ai_draft_welcome_notes",
        "pms_list_arrivals_today",
        "pms_update_request_status",
        "slack_send_message",
      ].sort(),
    );
  });

  it("tool inconnu → success=false avec errorCode 'tool_not_implemented'", async () => {
    const res = await executeWorkflowTool("does_not_exist", {}, CTX);
    expect(res.success).toBe(false);
    expect(res.error).toContain("tool_not_implemented");
    expect((res.output as { errorCode?: string }).errorCode).toBe(
      "tool_not_implemented",
    );
  });

  it("pms_list_arrivals_today retourne source=demo + count", async () => {
    const res = await executeWorkflowTool("pms_list_arrivals_today", {}, CTX);
    expect(res.success).toBe(true);
    const out = res.output as { source: string; count: number; arrivals: unknown[] };
    expect(out.source).toBe("demo");
    expect(out.count).toBe(out.arrivals.length);
    expect(out.count).toBeGreaterThan(0);
  });

  it("pms_update_request_status sans requestId → error", async () => {
    const res = await executeWorkflowTool(
      "pms_update_request_status",
      { status: "done" },
      CTX,
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("requestId manquant");
  });

  it("pms_update_request_status nominal retourne source=demo", async () => {
    const res = await executeWorkflowTool(
      "pms_update_request_status",
      { requestId: "r1", status: "dispatched" },
      CTX,
    );
    expect(res.success).toBe(true);
    const out = res.output as { source: string; requestId: string; status: string };
    expect(out.source).toBe("demo");
    expect(out.requestId).toBe("r1");
    expect(out.status).toBe("dispatched");
  });

  it("slack_send_message en preview ne touche pas Composio", async () => {
    const res = await executeWorkflowTool(
      "slack_send_message",
      { channel: "#frontdesk", content: "hello", _preview: true },
      CTX,
    );
    expect(res.success).toBe(true);
    expect((res.output as { preview: boolean }).preview).toBe(true);
    expect(executeComposioAction).not.toHaveBeenCalled();
  });

  it("slack_send_message sans channel → error", async () => {
    const res = await executeWorkflowTool(
      "slack_send_message",
      { content: "x" },
      CTX,
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("channel manquant");
  });

  it("slack_send_message nominal délègue à Composio", async () => {
    vi.mocked(executeComposioAction).mockResolvedValue({
      ok: true,
      data: { ts: "1234.5" },
    });
    const res = await executeWorkflowTool(
      "slack_send_message",
      { channel: "#x", content: "hi" },
      CTX,
    );
    expect(res.success).toBe(true);
    expect(executeComposioAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SLACK_SEND_MESSAGE",
        entityId: "user-1",
        params: { channel: "#x", text: "hi" },
      }),
    );
  });

  it("slack_send_message Composio fail → handler error", async () => {
    vi.mocked(executeComposioAction).mockResolvedValue({
      ok: false,
      error: "auth required",
      errorCode: "AUTH_REQUIRED",
    });
    const res = await executeWorkflowTool(
      "slack_send_message",
      { channel: "#x", content: "hi" },
      CTX,
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("auth required");
  });

  it("ai_draft_welcome_notes sans clé Anthropic → degraded fallback", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await executeWorkflowTool(
      "ai_draft_welcome_notes",
      {
        arrivals: [{ guestName: "Ada", room: "201" }],
        tone: "warm-professional",
      },
      CTX,
    );
    expect(res.success).toBe(true);
    const out = res.output as {
      degraded: boolean;
      notes: Array<{ guestName: string; note: string }>;
    };
    expect(out.degraded).toBe(true);
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0].note.length).toBeGreaterThan(0);
  });

  it("ai_draft_welcome_notes arrivals vide → notes=[]", async () => {
    const res = await executeWorkflowTool(
      "ai_draft_welcome_notes",
      { arrivals: [] },
      CTX,
    );
    expect(res.success).toBe(true);
    expect((res.output as { notes: unknown[] }).notes).toHaveLength(0);
  });

  it("ai_classify_priority sans clé → priority normal degraded", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await executeWorkflowTool(
      "ai_classify_priority",
      { text: "Pas d'eau chaude depuis 1h" },
      CTX,
    );
    expect(res.success).toBe(true);
    const out = res.output as { priority: string; degraded?: boolean };
    expect(out.priority).toBe("normal");
    expect(out.degraded).toBe(true);
  });

  it("ai_classify_priority text vide → degraded normal", async () => {
    const res = await executeWorkflowTool(
      "ai_classify_priority",
      { text: "" },
      CTX,
    );
    expect(res.success).toBe(true);
    expect((res.output as { priority: string }).priority).toBe("normal");
  });
});
