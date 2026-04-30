/**
 * @vitest-environment jsdom
 *
 * ConfirmModal — open/close, confirm/cancel, ESC.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmModal } from "@/app/(user)/components/ConfirmModal";

describe("ConfirmModal", () => {
  it("renders nothing when open=false", () => {
    render(
      <ConfirmModal
        open={false}
        title="T"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
  });

  it("renders title and description when open", () => {
    render(
      <ConfirmModal
        open
        title="Supprimer ?"
        description="Action irréversible"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Supprimer ?")).toBeTruthy();
    expect(screen.getByText("Action irréversible")).toBeTruthy();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        open
        title="T"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("confirm-modal-confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        open
        title="T"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("confirm-modal-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when ESC is pressed", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        open
        title="T"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not call onCancel on ESC when loading", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        open
        title="T"
        loading
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("disables confirm button when loading", () => {
    render(
      <ConfirmModal
        open
        title="T"
        loading
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const btn = screen.getByTestId("confirm-modal-confirm") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain("…");
  });

  it("calls onCancel when clicking the backdrop", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        open
        title="T"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    const backdrop = screen.getByTestId("confirm-modal");
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
