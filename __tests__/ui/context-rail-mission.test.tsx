/**
 * @vitest-environment jsdom
 *
 * Tests — ContextRailForMission.
 *
 * Refonte 2026-04-30 (Phase 4 — Lot 2) : single source of truth pour les
 * actions = StageActionBar dans le header. Le rail ne montre plus que du
 * contexte (titre, statut, prompt, cadence, derniers runs, threads liés).
 *
 * Vérifie :
 *  - rendu du nom + statut
 *  - rendu du prompt + cadence
 *  - rendu des derniers runs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { ContextRailForMission } from "@/app/(user)/components/ContextRailForMission";
import { useStageStore } from "@/stores/stage";

const FAKE_MISSION = {
  id: "mission-abc-123",
  name: "Rapport hebdo ventes",
  enabled: true,
  schedule: "0 9 * * 1",
  input: "Génère le rapport ventes hebdo",
};

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (url.includes("/api/v2/missions") && method === "GET") {
      return {
        ok: true,
        json: async () => ({ missions: [FAKE_MISSION] }),
        text: async () => "",
      } as Response;
    }

    if (url.includes("/api/v2/runs") && method === "GET") {
      return {
        ok: true,
        json: async () => ({ runs: [] }),
        text: async () => "",
      } as Response;
    }

    return { ok: false, json: async () => ({}), text: async () => "" } as Response;
  });
}

describe("ContextRailForMission", () => {
  beforeEach(() => {
    useStageStore.setState({
      current: { mode: "mission", missionId: FAKE_MISSION.id },
      history: [],
      lastAssetId: null,
      commandeurOpen: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("affiche le nom et le statut de la mission", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<ContextRailForMission />);
    await waitFor(() => {
      expect(screen.getByText(FAKE_MISSION.name)).toBeTruthy();
    });
    expect(screen.getByTestId("mission-rail-status").textContent).toBe("ACTIVE");
  });

  it("affiche le prompt et la cadence en lecture seule", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<ContextRailForMission />);
    await waitFor(() => {
      expect(screen.getByText(FAKE_MISSION.input)).toBeTruthy();
    });
    expect(screen.getByText(FAKE_MISSION.schedule)).toBeTruthy();
  });

  it("ne rend aucun bouton d'action (single source of truth = StageActionBar)", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<ContextRailForMission />);
    await waitFor(() => {
      expect(screen.getByText(FAKE_MISSION.name)).toBeTruthy();
    });
    expect(screen.queryByTestId("mission-rail-action-run")).toBeNull();
    expect(screen.queryByTestId("mission-rail-action-edit")).toBeNull();
    expect(screen.queryByTestId("mission-rail-action-toggle")).toBeNull();
    expect(screen.queryByTestId("mission-rail-action-delete")).toBeNull();
  });
});
