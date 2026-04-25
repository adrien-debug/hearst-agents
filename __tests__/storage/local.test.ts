/**
 * Storage Provider — Tests (Local)
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { LocalStorageProvider } from "@/lib/engine/runtime/assets/storage/local";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("LocalStorageProvider", () => {
  const testDir = path.join(os.tmpdir(), "hearst-storage-test-" + Date.now());
  let storage: LocalStorageProvider;

  beforeAll(async () => {
    storage = new LocalStorageProvider({
      basePath: testDir,
      publicBaseUrl: "http://localhost:9000/assets",
    });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("uploads a file", async () => {
    const result = await storage.upload(
      "test/hello.txt",
      Buffer.from("Hello World"),
      { contentType: "text/plain", tenantId: "tenant-1" }
    );

    expect(result.key).toBe("test/hello.txt");
    expect(result.size).toBe(11);
    expect(result.provider).toBe("local");
    expect(result.url).toContain("/assets/tenant-1/test/hello.txt");
  });

  it("checks if file exists", async () => {
    await storage.upload("exists.txt", Buffer.from("content"), {
      contentType: "text/plain",
    });

    expect(await storage.exists("exists.txt")).toBe(true);
    expect(await storage.exists("nonexistent.txt")).toBe(false);
  });

  it("downloads a file", async () => {
    const content = "Download test content";
    await storage.upload("download.txt", Buffer.from(content), {
      contentType: "text/plain",
      metadata: { source: "test" },
    });

    const result = await storage.download("download.txt");
    expect(result.size).toBe(content.length);
    // ContentType comes from metadata sidecar file
    expect(result.contentType).toBe("text/plain");

    // Read stream
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const downloaded = Buffer.concat(chunks).toString();
    expect(downloaded).toBe(content);
  });

  it("deletes a file", async () => {
    await storage.upload("delete-me.txt", Buffer.from("temp"), {
      contentType: "text/plain",
    });

    expect(await storage.exists("delete-me.txt")).toBe(true);
    await storage.delete("delete-me.txt");
    expect(await storage.exists("delete-me.txt")).toBe(false);
  });

  it("lists files with prefix", async () => {
    await storage.upload("list/a.txt", Buffer.from("a"), {
      contentType: "text/plain",
    });
    await storage.upload("list/b.txt", Buffer.from("b"), {
      contentType: "text/plain",
    });
    await storage.upload("other/c.txt", Buffer.from("c"), {
      contentType: "text/plain",
    });

    const list = await storage.list("list/");
    expect(list.length).toBe(2);
    expect(list.map((f) => f.key).sort()).toEqual(["a.txt", "b.txt"]);
  });

  it("health check passes", async () => {
    const health = await storage.health();
    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("generates signed URL", async () => {
    await storage.upload("signed.txt", Buffer.from("test"), {
      contentType: "text/plain",
    });

    const url = await storage.getSignedUrl("signed.txt", "read", {
      expiresInSeconds: 3600,
    });

    expect(url).toContain("token=");
    expect(url).toContain("expires=");
  });
});
