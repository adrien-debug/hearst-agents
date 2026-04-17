import { describe, it, expect } from "vitest";
import { HttpAdapter } from "@/lib/integrations/http-adapter";
import { NotionAdapter } from "@/lib/integrations/notion-adapter";
import { getAdapter, listAdapters } from "@/lib/integrations/executor";

describe("Adapter registry", () => {
  it("returns http adapter", () => {
    const adapter = getAdapter("http");
    expect(adapter.provider).toBe("http");
    expect(adapter.actions.length).toBeGreaterThan(0);
  });

  it("returns notion adapter", () => {
    const adapter = getAdapter("notion");
    expect(adapter.provider).toBe("notion");
  });

  it("throws on unknown provider", () => {
    expect(() => getAdapter("unknown")).toThrow("No adapter registered");
  });

  it("lists all adapters", () => {
    const adapters = listAdapters();
    expect(adapters.length).toBe(2);
    const providers = adapters.map((a) => a.provider);
    expect(providers).toContain("http");
    expect(providers).toContain("notion");
  });
});

describe("HttpAdapter", () => {
  const adapter = new HttpAdapter();

  it("declares http.fetch action as read-only", () => {
    expect(adapter.actions[0].name).toBe("http.fetch");
    expect(adapter.actions[0].readonly).toBe(true);
  });

  it("rejects unknown actions", async () => {
    const result = await adapter.execute("http.post", {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown action");
  });

  it("rejects missing url", async () => {
    const result = await adapter.execute("http.fetch", {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("url");
  });
});

describe("NotionAdapter", () => {
  const adapter = new NotionAdapter();

  it("declares notion.read_page action as read-only", () => {
    expect(adapter.actions[0].name).toBe("notion.read_page");
    expect(adapter.actions[0].readonly).toBe(true);
  });

  it("rejects unknown actions", async () => {
    const result = await adapter.execute("notion.create_page", {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown action");
  });

  it("rejects missing page_id", async () => {
    const result = await adapter.execute("notion.read_page", {}, { bearer_token: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("page_id");
  });

  it("rejects missing token", async () => {
    const result = await adapter.execute("notion.read_page", { page_id: "abc" }, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("token");
  });
});
