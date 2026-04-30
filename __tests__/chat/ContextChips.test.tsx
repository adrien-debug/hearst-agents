/**
 * @vitest-environment jsdom
 *
 * ContextChips — render, removal, label click event.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextChips } from "@/app/(user)/components/chat/ContextChips";
import { useChatContext } from "@/stores/chat-context";

const reset = () => useChatContext.setState({ chips: [] }, false);

describe("ContextChips", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
    reset();
  });

  it("ne rend rien quand 0 chip", () => {
    const { container } = render(<ContextChips />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("context-chips")).toBeNull();
  });

  it("affiche 3 chips quand le store en contient 3", () => {
    const { addChip } = useChatContext.getState();
    addChip({ id: "a", label: "Bitcoin", kind: "topic" });
    addChip({ id: "b", label: "Missions", kind: "mission" });
    addChip({ id: "c", label: "Reports", kind: "report" });
    render(<ContextChips />);
    expect(screen.getByTestId("context-chips")).toBeTruthy();
    expect(screen.getByText("Bitcoin")).toBeTruthy();
    expect(screen.getByText("Missions")).toBeTruthy();
    expect(screen.getByText("Reports")).toBeTruthy();
  });

  it("retire la chip quand on clique sur la croix", () => {
    const { addChip } = useChatContext.getState();
    addChip({ id: "a", label: "Bitcoin", kind: "topic" });
    addChip({ id: "b", label: "Missions", kind: "mission" });
    render(<ContextChips />);
    fireEvent.click(screen.getByTestId("context-chip-remove-a"));
    expect(useChatContext.getState().chips.find((c) => c.id === "a")).toBeUndefined();
    expect(useChatContext.getState().chips).toHaveLength(1);
  });

  it("émet l'event chat-context:focus quand on clique sur le label", () => {
    const { addChip } = useChatContext.getState();
    addChip({ id: "asset-42", label: "BTC-USD", kind: "asset" });
    const handler = vi.fn();
    window.addEventListener("chat-context:focus", handler as EventListener);
    render(<ContextChips />);
    fireEvent.click(screen.getByTestId("context-chip-label-asset-42"));
    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ id: "asset-42", kind: "asset" });
    window.removeEventListener("chat-context:focus", handler as EventListener);
  });
});
