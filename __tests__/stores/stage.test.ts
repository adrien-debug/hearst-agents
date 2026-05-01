import { describe, it, expect, beforeEach } from "vitest";
import { useStageStore } from "@/stores/stage";

describe("useStageStore", () => {
  beforeEach(() => {
    useStageStore.setState({
      current: { mode: "chat" },
      history: [],
      lastAssetId: null,
      lastMissionId: null,
      lastManualChangeAt: null,
      commandeurOpen: false,
      commandeurPrefilledQuery: null,
    });
  });

  describe("setModeFromTool", () => {
    it("applique le mode quand aucun changement manuel récent", () => {
      useStageStore.getState().setModeFromTool({ mode: "browser", sessionId: "s-1" });
      expect(useStageStore.getState().current).toEqual({ mode: "browser", sessionId: "s-1" });
    });

    it("ignore le tool override quand l'utilisateur vient de changer manuellement (< 10s)", () => {
      useStageStore.getState().setMode({ mode: "cockpit" });
      useStageStore.getState().setModeFromTool({ mode: "browser", sessionId: "s-1" });
      expect(useStageStore.getState().current).toEqual({ mode: "cockpit" });
    });

    it("applique le tool override après expiration du guard manuel", () => {
      useStageStore.getState().setMode({ mode: "cockpit" });
      useStageStore.setState({ lastManualChangeAt: Date.now() - 11_000 });
      useStageStore.getState().setModeFromTool({ mode: "browser", sessionId: "s-1" });
      expect(useStageStore.getState().current).toEqual({ mode: "browser", sessionId: "s-1" });
    });

    it("ne touche PAS lastManualChangeAt (le guard reste basé sur l'action user)", () => {
      useStageStore.setState({ lastManualChangeAt: null });
      useStageStore.getState().setModeFromTool({ mode: "kg" });
      expect(useStageStore.getState().lastManualChangeAt).toBeNull();
    });

    it("persiste lastAssetId quand le tool override est asset", () => {
      useStageStore.getState().setModeFromTool({ mode: "asset", assetId: "a-42" });
      expect(useStageStore.getState().lastAssetId).toBe("a-42");
    });
  });

  describe("setMode (action utilisateur)", () => {
    it("met à jour lastManualChangeAt", () => {
      const before = Date.now();
      useStageStore.getState().setMode({ mode: "voice" });
      const after = Date.now();
      const changed = useStageStore.getState().lastManualChangeAt;
      expect(changed).not.toBeNull();
      expect(changed!).toBeGreaterThanOrEqual(before);
      expect(changed!).toBeLessThanOrEqual(after);
    });
  });
});
