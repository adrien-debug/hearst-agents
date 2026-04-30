/**
 * Manifest PWA — shape & valeurs critiques.
 *
 * Vérifie que le manifest généré par Next.js (app/manifest.ts) reste
 * cohérent : icônes 192/512, theme color cykan, shortcut voice présent
 * (entry point critique du C8 voice-first quick access).
 */

import { describe, it, expect } from "vitest";
import manifest from "@/app/manifest";

describe("PWA manifest", () => {
  const m = manifest();

  it("expose name + short_name", () => {
    expect(m.name).toBe("Hearst OS");
    expect(m.short_name).toBe("Hearst");
  });

  it("display = standalone (PWA installable)", () => {
    expect(m.display).toBe("standalone");
  });

  it("theme_color = cykan #2DD4BF", () => {
    expect(m.theme_color?.toUpperCase()).toBe("#2DD4BF");
  });

  it("inclut les icônes 192 et 512", () => {
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("au moins une icône maskable pour adaptive icons Android", () => {
    const hasMaskable = (m.icons ?? []).some((i) =>
      (i.purpose ?? "").includes("maskable"),
    );
    expect(hasMaskable).toBe(true);
  });

  it("expose shortcut voice ambient (voice-first quick access)", () => {
    const voice = (m.shortcuts ?? []).find((s) =>
      s.url?.includes("stage=voice"),
    );
    expect(voice).toBeDefined();
    expect(voice?.short_name?.toLowerCase()).toContain("voice");
  });

  it("expose shortcut cockpit", () => {
    const cockpit = (m.shortcuts ?? []).find((s) =>
      s.url?.includes("stage=cockpit"),
    );
    expect(cockpit).toBeDefined();
  });

  it("start_url = /", () => {
    expect(m.start_url).toBe("/");
  });

  it("orientation = portrait-primary (mobile-first)", () => {
    expect(m.orientation).toBe("portrait-primary");
  });
});
