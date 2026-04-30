/**
 * @vitest-environment jsdom
 *
 * Tests — ContextRailForMission.
 *
 * Vérifie :
 *  - rendu du nom + statut
 *  - bouton Run now → POST /api/v2/missions/[id]/run
 *  - bouton Activer/Désactiver → PATCH /api/v2/missions/[id]
 *  - confirmation Supprimer → DELETE /api/v2/missions/[id]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

function mockFetch(opts: {
  onPatch?: (body: unknown) => void;
  onDelete?: () => void;
  onRun?: () => void;
}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (url.includes("/api/v2/missions") && url.includes("/run") && method === "POST") {
      opts.onRun?.();
      return { ok: true, json: async () => ({ ok: true, runId: "run-1" }), text: async () => "" } as Response;
    }

    if (url.match(/\/api\/v2\/missions\/[^/]+$/) && method === "PATCH") {
      opts.onPatch?.(JSON.parse(init!.body as string));
      return { ok: true, json: async () => ({ ok: true }), text: async () => "" } as Response;
    }

    if (url.match(/\/api\/v2\/missions\/[^/]+$/) && method === "DELETE") {
      opts.onDelete?.();
      return { ok: true, json: async () => ({ ok: true, deleted: true }), text: async () => "" } as Response;
    }

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
    vi.stubGlobal("fetch", mockFetch({}));
    render(<ContextRailForMission />);
    await waitFor(() => {
      expect(screen.getByText(FAKE_MISSION.name)).toBeTruthy();
    });
    expect(screen.getByTestId("mission-rail-status").textContent).toBe("ACTIVE");
  });

  it("Run now appelle POST /api/v2/missions/[id]/run", async () => {
    let runCalled = false;
    vi.stubGlobal("fetch", mockFetch({ onRun: () => { runCalled = true; } }));
    render(<ContextRailForMission />);
    await waitFor(() => {
      expect(screen.getByText(FAKE_MISSION.name)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mission-rail-action-run"));
    });
    await waitFor(() => expect(runCalled).toBe(true));
  });

  it("toggle envoie PATCH avec enabled inversé", async () => {
    let patchedBody: unknown = null;
    vi.stubGlobal(
      "fetch",
      mockFetch({ onPatch: (body) => { patchedBody = body; } }),
    );
    render(<ContextRailForMission />);
    await waitFor(() => {
      expect(screen.getByText(FAKE_MISSION.name)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mission-rail-action-toggle"));
    });
    await waitFor(() => {
      expect(patchedBody).toEqual({ enabled: false });
    });
  });

  it("supprimer demande confirmation puis envoie DELETE", async () => {
    let deleteCalled = false;
    vi.stubGlobal(
      "fetch",
      mockFetch({ onDelete: () => { deleteCalled = true; } }),
    );
    render(<ContextRailForMission />);
    await waitFor(() => {
      expect(screen.getByText(FAKE_MISSION.name)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mission-rail-action-delete"));
    });
    // Le bouton de confirmation apparaît
    const confirmBtn = await screen.findByTestId("mission-rail-action-delete-confirm");
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await waitFor(() => expect(deleteCalled).toBe(true));
  });
});
