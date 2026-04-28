/**
 * Tests de l'adapter HTTP : SSRF guard + extraction.
 * Mock global.fetch pour ne pas dépendre du réseau.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHttp } from "@/lib/reports/sources/http";

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("fetchHttp — SSRF guard", () => {
  it("refuse localhost", async () => {
    const out = await fetchHttp({ url: "http://localhost:8080/api" });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/SSRF/);
  });

  it("refuse 127.0.0.1", async () => {
    const out = await fetchHttp({ url: "http://127.0.0.1/" });
    expect(out.ok).toBe(false);
  });

  it("refuse les IPs privées 10/192.168/172.16-31", async () => {
    expect((await fetchHttp({ url: "http://10.0.0.1/" })).ok).toBe(false);
    expect((await fetchHttp({ url: "http://192.168.1.1/" })).ok).toBe(false);
    expect((await fetchHttp({ url: "http://172.16.0.1/" })).ok).toBe(false);
    expect((await fetchHttp({ url: "http://172.31.0.1/" })).ok).toBe(false);
  });

  it("refuse les protocoles non-HTTP(s)", async () => {
    expect((await fetchHttp({ url: "file:///etc/passwd" })).ok).toBe(false);
    expect((await fetchHttp({ url: "ftp://server/file" })).ok).toBe(false);
  });

  it("refuse les URLs malformées", async () => {
    expect((await fetchHttp({ url: "not a url" })).ok).toBe(false);
  });

  it("refuse 169.254 (AWS metadata)", async () => {
    expect((await fetchHttp({ url: "http://169.254.169.254/" })).ok).toBe(false);
  });
});

describe("fetchHttp — succès", () => {
  it("parse JSON et extract Tabular", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": "100" }),
      text: async () => JSON.stringify({ items: [{ x: 1 }, { x: 2 }] }),
    })) as unknown as typeof fetch;

    const out = await fetchHttp({ url: "https://api.example.com/data" });
    expect(out.ok).toBe(true);
    expect(out.rows).toHaveLength(2);
  });

  it("retourne erreur sur HTTP 404", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: async () => "",
    })) as unknown as typeof fetch;

    const out = await fetchHttp({ url: "https://api.example.com/missing" });
    expect(out.ok).toBe(false);
    expect(out.status).toBe(404);
  });

  it("retourne erreur sur réponse non-JSON", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "<html>oups</html>",
    })) as unknown as typeof fetch;

    const out = await fetchHttp({ url: "https://api.example.com/page" });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/non-JSON/);
  });
});
