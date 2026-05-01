import { describe, it, expect, beforeEach } from "vitest";
import { useFocalStore, type FocalObject } from "@/stores/focal";

const baseFocal = (id: string, sourceAssetId?: string, missionId?: string): FocalObject => ({
  id,
  type: "report",
  status: "ready",
  title: `Focal ${id}`,
  body: "Contenu valide.",
  createdAt: 1,
  updatedAt: 1,
  sourceAssetId,
  missionId,
});

describe("useFocalStore — pin par sourceAssetId/missionId (Phase C3)", () => {
  beforeEach(() => {
    useFocalStore.setState({
      focal: null,
      secondary: [],
      isFocused: false,
      hasContent: false,
      isVisible: false,
      pinnedFocalKey: null,
    });
  });

  it("setFocal d'un asset pose un pin = sourceAssetId", () => {
    useFocalStore.getState().setFocal(baseFocal("f1", "asset-42"));
    expect(useFocalStore.getState().pinnedFocalKey).toBe("asset-42");
  });

  it("setFocal d'une mission pose un pin = missionId quand sourceAssetId absent", () => {
    useFocalStore.getState().setFocal(baseFocal("f2", undefined, "mission-99"));
    expect(useFocalStore.getState().pinnedFocalKey).toBe("mission-99");
  });

  it("setFocal sans asset ni mission ne pose pas de pin", () => {
    useFocalStore.getState().setFocal(baseFocal("f3"));
    expect(useFocalStore.getState().pinnedFocalKey).toBeNull();
  });

  it("clearFocal vide le pin", () => {
    useFocalStore.getState().setFocal(baseFocal("f4", "asset-1"));
    expect(useFocalStore.getState().pinnedFocalKey).toBe("asset-1");
    useFocalStore.getState().clearFocal();
    expect(useFocalStore.getState().pinnedFocalKey).toBeNull();
  });

  it("hydrateThreadState NE doit PAS écraser un focal pinné par un autre asset", () => {
    useFocalStore.getState().setFocal(baseFocal("user-pick", "asset-USER"));
    const sseFocal = baseFocal("sse-pick", "asset-OTHER");
    useFocalStore.getState().hydrateThreadState(sseFocal, []);
    expect(useFocalStore.getState().focal?.id).toBe("user-pick");
    expect(useFocalStore.getState().pinnedFocalKey).toBe("asset-USER");
  });

  it("hydrateThreadState met à jour secondary même quand le pin protège le focal", () => {
    useFocalStore.getState().setFocal(baseFocal("user-pick", "asset-USER"));
    const sseSecondary = [baseFocal("hist-1"), baseFocal("hist-2")];
    useFocalStore.getState().hydrateThreadState(baseFocal("sse-pick", "asset-OTHER"), sseSecondary);
    expect(useFocalStore.getState().secondary).toHaveLength(2);
    expect(useFocalStore.getState().focal?.id).toBe("user-pick");
  });

  it("hydrateThreadState peut update le focal pinné si l'incoming a le même pin (refresh contenu)", () => {
    useFocalStore.getState().setFocal(baseFocal("v1", "asset-SAME"));
    const refreshed: FocalObject = { ...baseFocal("v1", "asset-SAME"), status: "delivered" };
    useFocalStore.getState().hydrateThreadState(refreshed, []);
    expect(useFocalStore.getState().focal?.status).toBe("delivered");
    expect(useFocalStore.getState().pinnedFocalKey).toBe("asset-SAME");
  });

  it("hydrateThreadState applique le SSE focal quand aucun pin actif", () => {
    const sseFocal = baseFocal("sse-only", "asset-XYZ");
    useFocalStore.getState().hydrateThreadState(sseFocal, []);
    expect(useFocalStore.getState().focal?.id).toBe("sse-only");
    // Auto-rehydratation ne pose PAS de pin (vient du serveur, pas d'un clic).
    expect(useFocalStore.getState().pinnedFocalKey).toBeNull();
  });

  it("setFocal d'un autre asset remplace le pin par la nouvelle valeur", () => {
    useFocalStore.getState().setFocal(baseFocal("a", "asset-A"));
    useFocalStore.getState().setFocal(baseFocal("b", "asset-B"));
    expect(useFocalStore.getState().pinnedFocalKey).toBe("asset-B");
    expect(useFocalStore.getState().focal?.id).toBe("b");
  });
});
