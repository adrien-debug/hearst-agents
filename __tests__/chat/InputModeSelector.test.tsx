/**
 * @vitest-environment jsdom
 *
 * InputModeSelector — 3 pills (Demander / Analyser / Créer), switch, persist.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InputModeSelector } from "@/app/(user)/components/chat/InputModeSelector";
import { useChatContext } from "@/stores/chat-context";

const reset = () =>
  useChatContext.setState({ chips: [], inputMode: "ask" }, false);

describe("InputModeSelector", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
    reset();
  });

  it("affiche les 3 modes (Demander / Analyser / Créer)", () => {
    render(<InputModeSelector />);
    expect(screen.getByTestId("input-mode-ask")).toBeTruthy();
    expect(screen.getByTestId("input-mode-analyze")).toBeTruthy();
    expect(screen.getByTestId("input-mode-create")).toBeTruthy();
    expect(screen.getByText("Demander")).toBeTruthy();
    expect(screen.getByText("Analyser")).toBeTruthy();
    expect(screen.getByText("Créer")).toBeTruthy();
  });

  it("marque le mode 'ask' actif par défaut", () => {
    render(<InputModeSelector />);
    expect(screen.getByTestId("input-mode-ask").getAttribute("data-active")).toBe(
      "true",
    );
    expect(
      screen.getByTestId("input-mode-analyze").getAttribute("data-active"),
    ).toBe("false");
  });

  it("change de mode au clic et met à jour le store", () => {
    render(<InputModeSelector />);
    fireEvent.click(screen.getByTestId("input-mode-analyze"));
    expect(useChatContext.getState().inputMode).toBe("analyze");
    expect(
      screen.getByTestId("input-mode-analyze").getAttribute("data-active"),
    ).toBe("true");
    expect(screen.getByTestId("input-mode-ask").getAttribute("data-active")).toBe(
      "false",
    );
  });

  it("persiste le mode dans localStorage", () => {
    render(<InputModeSelector />);
    fireEvent.click(screen.getByTestId("input-mode-create"));
    const raw = window.localStorage.getItem("hearst-chat-context");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.inputMode).toBe("create");
  });
});
