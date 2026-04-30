/**
 * @vitest-environment jsdom
 *
 * RowActions — visibility / hover / click / disabled.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RowActions } from "@/app/(user)/components/RowActions";

describe("RowActions", () => {
  it("renders nothing when actions is empty", () => {
    const { container } = render(<RowActions actions={[]} />);
    expect(container.querySelector("[data-testid='row-actions']")).toBeNull();
  });

  it("renders all buttons with aria-label", () => {
    render(
      <RowActions
        actions={[
          { id: "open", label: "Ouvrir", icon: <span>O</span>, onClick: () => {} },
          { id: "del", label: "Supprimer", icon: <span>D</span>, onClick: () => {}, variant: "danger" },
        ]}
      />,
    );
    expect(screen.getByLabelText("Ouvrir")).toBeTruthy();
    expect(screen.getByLabelText("Supprimer")).toBeTruthy();
  });

  it("calls onClick and stops propagation", () => {
    const inner = vi.fn();
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <RowActions
          actions={[{ id: "x", label: "Test", icon: "x", onClick: inner }]}
        />
      </div>,
    );
    fireEvent.click(screen.getByTestId("row-action-x"));
    expect(inner).toHaveBeenCalledOnce();
    // stopPropagation fait que le parent ne reçoit pas le click
    expect(outer).not.toHaveBeenCalled();
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <RowActions
        actions={[{ id: "x", label: "Test", icon: "x", onClick, disabled: true }]}
      />,
    );
    fireEvent.click(screen.getByTestId("row-action-x"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("starts hidden when showOnHover=true (default)", () => {
    render(
      <RowActions
        actions={[{ id: "x", label: "Test", icon: "x", onClick: () => {} }]}
      />,
    );
    const wrapper = screen.getByTestId("row-actions");
    expect(wrapper.className).toContain("opacity-0");
  });

  it("stays visible when showOnHover=false", () => {
    render(
      <RowActions
        showOnHover={false}
        actions={[{ id: "x", label: "Test", icon: "x", onClick: () => {} }]}
      />,
    );
    const wrapper = screen.getByTestId("row-actions");
    expect(wrapper.className).toContain("opacity-100");
    expect(wrapper.className).not.toContain("opacity-0");
  });
});
