/**
 * @vitest-environment jsdom
 *
 * StageActionBar — render + variants + click handlers + overflow menu.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StageActionBar } from "@/app/(user)/components/stages/StageActionBar";

describe("StageActionBar", () => {
  it("renders nothing decorative when no actions are passed", () => {
    render(<StageActionBar />);
    expect(screen.getByTestId("stage-action-bar")).toBeTruthy();
  });

  it("renders the back button when onBack is provided", () => {
    const onBack = vi.fn();
    render(<StageActionBar onBack={onBack} backLabel="Retour" />);
    const btn = screen.getByTestId("stage-action-back");
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("renders primary action and calls onClick", () => {
    const onClick = vi.fn();
    render(
      <StageActionBar
        primary={{ id: "rerun", label: "Re-run", onClick }}
      />,
    );
    const btn = screen.getByTestId("stage-action-rerun");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders secondary actions and disables them when disabled flag is set", () => {
    const onClick = vi.fn();
    render(
      <StageActionBar
        secondary={[{ id: "edit", label: "Éditer", onClick, disabled: true }]}
      />,
    );
    const btn = screen.getByTestId("stage-action-edit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("opens the overflow menu and triggers menu items", () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    render(
      <StageActionBar
        overflow={[
          { id: "duplicate", label: "Dupliquer", onClick: onDuplicate },
          { id: "delete", label: "Supprimer", variant: "danger", onClick: onDelete },
        ]}
      />,
    );
    // Menu fermé au mount
    expect(screen.queryByTestId("stage-action-overflow-menu")).toBeNull();
    fireEvent.click(screen.getByTestId("stage-action-overflow-toggle"));
    // Menu ouvert
    expect(screen.getByTestId("stage-action-overflow-menu")).toBeTruthy();
    fireEvent.click(screen.getByTestId("stage-action-delete"));
    expect(onDelete).toHaveBeenCalledOnce();
    // Le menu se referme après un clic sur un item
    expect(screen.queryByTestId("stage-action-overflow-menu")).toBeNull();
  });

  it("closes overflow menu on Escape", () => {
    render(
      <StageActionBar
        overflow={[{ id: "dup", label: "Dupliquer", onClick: () => {} }]}
      />,
    );
    fireEvent.click(screen.getByTestId("stage-action-overflow-toggle"));
    expect(screen.getByTestId("stage-action-overflow-menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("stage-action-overflow-menu")).toBeNull();
  });

  it("shows loading state on primary action", () => {
    render(
      <StageActionBar
        primary={{ id: "run", label: "Run now", onClick: () => {}, loading: true }}
      />,
    );
    const btn = screen.getByTestId("stage-action-run") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain("…");
  });
});
