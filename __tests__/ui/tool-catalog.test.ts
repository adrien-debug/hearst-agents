import { describe, it, expect } from "vitest";
import { getToolCatalogEntry } from "@/app/(user)/components/tool-catalog";

describe("getToolCatalogEntry", () => {
  it("returns the curated entry for a known read tool", () => {
    const entry = getToolCatalogEntry("google.calendar.list_today_events");
    expect(entry.kind).toBe("read");
    expect(entry.label).toBe("Calendrier");
    expect(entry.icon).toBe("📅");
  });

  it("returns the curated entry for a known write tool", () => {
    const entry = getToolCatalogEntry("gmail_send_email");
    expect(entry.kind).toBe("write");
    expect(entry.label).toBe("Envoi d'email");
    expect(entry.completedVerb).toMatch(/envoy/);
  });

  it("falls back to write for unknown tools whose name implies a side effect", () => {
    expect(getToolCatalogEntry("slack.post_message").kind).toBe("write");
    expect(getToolCatalogEntry("calendar.create_event").kind).toBe("write");
    expect(getToolCatalogEntry("notion.delete_page").kind).toBe("write");
  });

  it("falls back to read for unknown tools that don't look like a side effect", () => {
    expect(getToolCatalogEntry("xyz.list_items").kind).toBe("read");
    expect(getToolCatalogEntry("stuff.search").kind).toBe("read");
  });
});
