/**
 * @vitest-environment jsdom
 *
 * MobileBottomNav — render, interactions Stage store, voice activation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MobileBottomNav } from "@/app/(user)/components/MobileBottomNav";
import { useStageStore } from "@/stores/stage";
import { useVoiceStore } from "@/stores/voice";

describe("MobileBottomNav", () => {
  beforeEach(() => {
    useStageStore.setState({
      current: { mode: "cockpit" },
      history: [],
      lastAssetId: null,
      lastMissionId: null,
      commandeurOpen: false,
    });
    useVoiceStore.setState({ voiceActive: false });
  });

  it("rend les 5 boutons attendus", () => {
    render(<MobileBottomNav />);
    expect(screen.getByTestId("mobile-nav-cockpit")).toBeTruthy();
    expect(screen.getByTestId("mobile-nav-chat")).toBeTruthy();
    expect(screen.getByTestId("mobile-nav-voice")).toBeTruthy();
    expect(screen.getByTestId("mobile-nav-asset")).toBeTruthy();
    expect(screen.getByTestId("mobile-nav-commandeur")).toBeTruthy();
  });

  it("Cockpit → setMode(cockpit)", () => {
    const setMode = vi.fn();
    useStageStore.setState({ setMode });
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByTestId("mobile-nav-cockpit"));
    expect(setMode).toHaveBeenCalledWith({ mode: "cockpit" });
  });

  it("Voice → setMode(voice) + voiceActive=true", () => {
    const setMode = vi.fn();
    const setVoiceActive = vi.fn();
    useStageStore.setState({ setMode });
    useVoiceStore.setState({ setVoiceActive });
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByTestId("mobile-nav-voice"));
    expect(setMode).toHaveBeenCalledWith({ mode: "voice" });
    expect(setVoiceActive).toHaveBeenCalledWith(true);
  });

  it("Asset sans lastAssetId → ouvre Commandeur (fallback)", () => {
    const setMode = vi.fn();
    const setCommandeurOpen = vi.fn();
    useStageStore.setState({ setMode, setCommandeurOpen, lastAssetId: null });
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByTestId("mobile-nav-asset"));
    expect(setMode).not.toHaveBeenCalled();
    expect(setCommandeurOpen).toHaveBeenCalledWith(true);
  });

  it("Asset avec lastAssetId → setMode(asset, lastAssetId)", () => {
    const setMode = vi.fn();
    useStageStore.setState({ setMode, lastAssetId: "asset-42" });
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByTestId("mobile-nav-asset"));
    expect(setMode).toHaveBeenCalledWith({
      mode: "asset",
      assetId: "asset-42",
    });
  });

  it("Commandeur → setCommandeurOpen(true)", () => {
    const setCommandeurOpen = vi.fn();
    useStageStore.setState({ setCommandeurOpen });
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByTestId("mobile-nav-commandeur"));
    expect(setCommandeurOpen).toHaveBeenCalledWith(true);
  });

  it("data-active=true sur le bouton du mode actif", () => {
    useStageStore.setState({ current: { mode: "voice" } });
    render(<MobileBottomNav />);
    expect(
      screen.getByTestId("mobile-nav-voice").getAttribute("data-active"),
    ).toBe("true");
    expect(
      screen.getByTestId("mobile-nav-cockpit").getAttribute("data-active"),
    ).toBe("false");
  });
});
