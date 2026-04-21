import { describe, it, expect } from "vitest";
import {
  deriveManifestationVisualState,
  sublineForFlow,
  focalStatusSubline,
} from "@/app/lib/manifestation-stage-model";

describe("deriveManifestationVisualState", () => {
  it("idle when halo idle and no focal", () => {
    expect(
      deriveManifestationVisualState({
        haloCore: "idle",
        flowLabel: null,
        emergingArtifact: null,
        focal: null,
      }),
    ).toBe("idle_habited");
  });

  it("active when thinking", () => {
    expect(
      deriveManifestationVisualState({
        haloCore: "thinking",
        flowLabel: "LISTENING",
        emergingArtifact: null,
        focal: null,
      }),
    ).toBe("active_condensation");
  });

  it("ready when halo success", () => {
    expect(
      deriveManifestationVisualState({
        haloCore: "success",
        flowLabel: "FINALIZING",
        emergingArtifact: null,
        focal: null,
      }),
    ).toBe("ready_stabilized");
  });

  it("focal composing overrides halo success", () => {
    expect(
      deriveManifestationVisualState({
        haloCore: "success",
        flowLabel: "FINALIZING",
        emergingArtifact: null,
        focal: { status: "composing", title: "Rapport" },
      }),
    ).toBe("active_condensation");
  });

  it("active when focal composing", () => {
    expect(
      deriveManifestationVisualState({
        haloCore: "idle",
        flowLabel: null,
        emergingArtifact: null,
        focal: { status: "composing", title: "Rapport" },
      }),
    ).toBe("active_condensation");
  });

  it("ready when focal awaiting_approval", () => {
    expect(
      deriveManifestationVisualState({
        haloCore: "executing",
        flowLabel: "SYNTHESIZING",
        emergingArtifact: null,
        focal: { status: "awaiting_approval", title: "Mission" },
      }),
    ).toBe("ready_stabilized");
  });

  it("active when artifact emerging", () => {
    expect(
      deriveManifestationVisualState({
        haloCore: "idle",
        flowLabel: null,
        emergingArtifact: {
          kind: "report",
          status: "emerging",
          createdAt: 0,
        },
        focal: null,
      }),
    ).toBe("active_condensation");
  });

  it("weak flowLabel promotes activity when halo idle", () => {
    expect(
      deriveManifestationVisualState({
        haloCore: "idle",
        flowLabel: "LISTENING",
        emergingArtifact: null,
        focal: null,
      }),
    ).toBe("active_condensation");
  });

  it("degraded maps to active", () => {
    expect(
      deriveManifestationVisualState({
        haloCore: "degraded",
        flowLabel: "UNABLE TO RESOLVE",
        emergingArtifact: null,
        focal: null,
      }),
    ).toBe("active_condensation");
  });
});

describe("copy helpers", () => {
  it("sublineForFlow maps LISTENING", () => {
    expect(sublineForFlow("LISTENING")).toContain("intention");
  });

  it("focalStatusSubline for composing", () => {
    expect(focalStatusSubline("composing")).toBeTruthy();
  });
});
