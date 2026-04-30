/**
 * @vitest-environment jsdom
 *
 * Chat Context Store — chips add/remove/clear, mode switch, persistence.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useChatContext } from "@/stores/chat-context";

const reset = () =>
  useChatContext.setState({ chips: [], inputMode: "ask" }, false);

describe("useChatContext store", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
    reset();
  });

  it("initialise avec aucune chip et mode 'ask'", () => {
    const state = useChatContext.getState();
    expect(state.chips).toEqual([]);
    expect(state.inputMode).toBe("ask");
  });

  it("ajoute une chip", () => {
    useChatContext
      .getState()
      .addChip({ id: "btc", label: "bitcoin", kind: "topic" });
    expect(useChatContext.getState().chips).toHaveLength(1);
    expect(useChatContext.getState().chips[0].label).toBe("bitcoin");
  });

  it("ne duplique pas une chip déjà présente (id égal)", () => {
    const { addChip } = useChatContext.getState();
    addChip({ id: "btc", label: "bitcoin", kind: "topic" });
    addChip({ id: "btc", label: "bitcoin-bis", kind: "asset" });
    const chips = useChatContext.getState().chips;
    expect(chips).toHaveLength(1);
    expect(chips[0].label).toBe("bitcoin");
  });

  it("retire une chip par id", () => {
    const { addChip, removeChip } = useChatContext.getState();
    addChip({ id: "a", label: "A", kind: "topic" });
    addChip({ id: "b", label: "B", kind: "asset" });
    removeChip("a");
    const chips = useChatContext.getState().chips;
    expect(chips).toHaveLength(1);
    expect(chips[0].id).toBe("b");
  });

  it("clearChips vide entièrement la liste", () => {
    const { addChip, clearChips } = useChatContext.getState();
    addChip({ id: "a", label: "A", kind: "topic" });
    addChip({ id: "b", label: "B", kind: "asset" });
    clearChips();
    expect(useChatContext.getState().chips).toEqual([]);
  });

  it("setInputMode change le mode", () => {
    useChatContext.getState().setInputMode("analyze");
    expect(useChatContext.getState().inputMode).toBe("analyze");
    useChatContext.getState().setInputMode("create");
    expect(useChatContext.getState().inputMode).toBe("create");
  });

  it("persiste chips et mode dans localStorage (clé hearst-chat-context)", () => {
    const { addChip, setInputMode } = useChatContext.getState();
    addChip({ id: "x", label: "X", kind: "report" });
    setInputMode("create");

    const raw = window.localStorage.getItem("hearst-chat-context");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.chips).toHaveLength(1);
    expect(parsed.state.chips[0].id).toBe("x");
    expect(parsed.state.inputMode).toBe("create");
  });
});
