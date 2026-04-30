/**
 * @vitest-environment jsdom
 *
 * BlockActions — visibility hover, callbacks, aria-labels.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockActions } from "@/app/(user)/components/chat/BlockActions";

describe("BlockActions", () => {
  it("rend les 5 actions avec aria-labels FR", () => {
    render(<BlockActions onAction={() => {}} />);
    expect(screen.getByLabelText("Ouvrir le block en vue détaillée")).toBeTruthy();
    expect(screen.getByLabelText("Transformer en mission")).toBeTruthy();
    expect(screen.getByLabelText("Sauvegarder comme asset")).toBeTruthy();
    expect(screen.getByLabelText("Éditer le block")).toBeTruthy();
    expect(screen.getByLabelText("Affiner le block (re-prompt)")).toBeTruthy();
  });

  it("démarre opacity-0 (visible uniquement au hover via group-hover)", () => {
    render(<BlockActions onAction={() => {}} />);
    const wrapper = screen.getByTestId("block-actions");
    expect(wrapper.className).toContain("opacity-0");
    expect(wrapper.className).toContain("group-hover:opacity-100");
  });

  it("appelle onAction avec l'id correspondant", () => {
    const onAction = vi.fn();
    render(<BlockActions onAction={onAction} />);
    fireEvent.click(screen.getByTestId("block-action-expand"));
    fireEvent.click(screen.getByTestId("block-action-mission"));
    fireEvent.click(screen.getByTestId("block-action-asset"));
    fireEvent.click(screen.getByTestId("block-action-edit"));
    fireEvent.click(screen.getByTestId("block-action-refine"));
    expect(onAction).toHaveBeenNthCalledWith(1, "expand");
    expect(onAction).toHaveBeenNthCalledWith(2, "mission");
    expect(onAction).toHaveBeenNthCalledWith(3, "asset");
    expect(onAction).toHaveBeenNthCalledWith(4, "edit");
    expect(onAction).toHaveBeenNthCalledWith(5, "refine");
  });

  it("désactive le bouton Éditer quand editable=false", () => {
    const onAction = vi.fn();
    render(<BlockActions onAction={onAction} editable={false} />);
    const editBtn = screen.getByTestId("block-action-edit") as HTMLButtonElement;
    expect(editBtn.disabled).toBe(true);
    fireEvent.click(editBtn);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("affiche un feedback 'Bientôt' pour mission et refine", () => {
    render(<BlockActions onAction={() => {}} />);
    fireEvent.click(screen.getByTestId("block-action-mission"));
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/Bientôt/i);
  });

  it("affiche un feedback 'Sauvegardé' pour asset", () => {
    render(<BlockActions onAction={() => {}} />);
    fireEvent.click(screen.getByTestId("block-action-asset"));
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/Sauvegardé/i);
  });
});
