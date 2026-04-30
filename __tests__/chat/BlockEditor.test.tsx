/**
 * @vitest-environment jsdom
 *
 * BlockEditor — edit mode, ESC cancel, Cmd+Enter save.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockEditor } from "@/app/(user)/components/chat/BlockEditor";

describe("BlockEditor", () => {
  it("monte avec la valeur initiale dans la textarea", () => {
    render(
      <BlockEditor initialValue="bonjour" onSave={() => {}} onCancel={() => {}} />,
    );
    const ta = screen.getByLabelText("Éditer le block") as HTMLTextAreaElement;
    expect(ta.value).toBe("bonjour");
  });

  it("appelle onCancel quand on tape ESC", () => {
    const onCancel = vi.fn();
    render(
      <BlockEditor initialValue="x" onSave={() => {}} onCancel={onCancel} />,
    );
    const ta = screen.getByLabelText("Éditer le block");
    fireEvent.keyDown(ta, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("appelle onSave avec la valeur courante via Cmd+Enter", () => {
    const onSave = vi.fn();
    render(
      <BlockEditor initialValue="hello" onSave={onSave} onCancel={() => {}} />,
    );
    const ta = screen.getByLabelText("Éditer le block") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "hello world" } });
    fireEvent.keyDown(ta, { key: "Enter", metaKey: true });
    expect(onSave).toHaveBeenCalledWith("hello world");
  });

  it("supporte Ctrl+Enter (Linux/Windows)", () => {
    const onSave = vi.fn();
    render(
      <BlockEditor initialValue="abc" onSave={onSave} onCancel={() => {}} />,
    );
    const ta = screen.getByLabelText("Éditer le block");
    fireEvent.keyDown(ta, { key: "Enter", ctrlKey: true });
    expect(onSave).toHaveBeenCalledWith("abc");
  });

  it("clic sur 'Annuler' déclenche onCancel", () => {
    const onCancel = vi.fn();
    render(
      <BlockEditor initialValue="x" onSave={() => {}} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByTestId("block-editor-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("clic sur 'Enregistrer' déclenche onSave avec la valeur courante", () => {
    const onSave = vi.fn();
    render(
      <BlockEditor initialValue="initial" onSave={onSave} onCancel={() => {}} />,
    );
    const ta = screen.getByLabelText("Éditer le block") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "modifié" } });
    fireEvent.click(screen.getByTestId("block-editor-save"));
    expect(onSave).toHaveBeenCalledWith("modifié");
  });

  it("ne déclenche PAS onSave sur Enter sans modificateur", () => {
    const onSave = vi.fn();
    render(
      <BlockEditor initialValue="x" onSave={onSave} onCancel={() => {}} />,
    );
    const ta = screen.getByLabelText("Éditer le block");
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
  });
});
