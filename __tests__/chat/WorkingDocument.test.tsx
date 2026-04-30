/**
 * @vitest-environment jsdom
 *
 * WorkingDocument — render closed (null), open via event, close via button,
 * edit content.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WorkingDocument } from "@/app/(user)/components/chat/WorkingDocument";
import { useWorkingDocumentStore } from "@/stores/working-document";

const reset = () =>
  useWorkingDocumentStore.setState({ current: null, isOpen: false });

describe("WorkingDocument", () => {
  beforeEach(() => {
    reset();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<WorkingDocument />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByLabelText("Document de travail")).toBeNull();
  });

  it("opens via the chat:expand-block CustomEvent", () => {
    render(<WorkingDocument />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("chat:expand-block", {
          detail: {
            id: "msg-1",
            title: "Plan trimestriel",
            content: "# Plan\n- Q1",
          },
        }),
      );
    });

    expect(screen.getByLabelText("Document de travail")).toBeTruthy();
    expect(screen.getByDisplayValue("Plan trimestriel")).toBeTruthy();

    const textarea = screen.getByLabelText("Contenu du document") as HTMLTextAreaElement;
    expect(textarea.value).toBe("# Plan\n- Q1");

    const state = useWorkingDocumentStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.current?.sourceMessageId).toBe("msg-1");
  });

  it("opens via store.open() too (programmatic)", () => {
    render(<WorkingDocument />);

    act(() => {
      useWorkingDocumentStore.getState().open({
        title: "Brouillon",
        content: "lorem ipsum",
      });
    });

    expect(screen.getByDisplayValue("Brouillon")).toBeTruthy();
    expect(screen.getByDisplayValue("lorem ipsum")).toBeTruthy();
  });

  it("closes when the réduire button is clicked", () => {
    render(<WorkingDocument />);

    act(() => {
      useWorkingDocumentStore.getState().open({
        title: "Doc",
        content: "Contenu",
      });
    });

    const closeBtn = screen.getByTitle("Réduire (Cmd+B)");
    fireEvent.click(closeBtn);

    expect(useWorkingDocumentStore.getState().isOpen).toBe(false);
    expect(screen.queryByLabelText("Document de travail")).toBeNull();
  });

  it("updates content when the textarea is edited", () => {
    render(<WorkingDocument />);

    act(() => {
      useWorkingDocumentStore.getState().open({
        title: "Doc",
        content: "v1",
      });
    });

    const textarea = screen.getByLabelText("Contenu du document") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "v2 édité" } });

    expect(useWorkingDocumentStore.getState().current?.content).toBe("v2 édité");
  });

  it("updates title when the title input is edited", () => {
    render(<WorkingDocument />);

    act(() => {
      useWorkingDocumentStore.getState().open({
        title: "Avant",
        content: "",
      });
    });

    const input = screen.getByLabelText("Titre du document") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Après" } });

    expect(useWorkingDocumentStore.getState().current?.title).toBe("Après");
  });

  it("renders Sauvegarder + Convertir buttons in footer", () => {
    render(<WorkingDocument />);

    act(() => {
      useWorkingDocumentStore.getState().open({ title: "T", content: "" });
    });

    expect(screen.getByText("Sauvegarder comme asset")).toBeTruthy();
    expect(screen.getByText("Convertir en mission")).toBeTruthy();
  });

  it("removes the event listener on unmount", () => {
    const { unmount } = render(<WorkingDocument />);
    unmount();

    // Après unmount, l'event ne doit plus muter le store.
    act(() => {
      window.dispatchEvent(
        new CustomEvent("chat:expand-block", {
          detail: { id: "x", title: "Ghost", content: "x" },
        }),
      );
    });

    expect(useWorkingDocumentStore.getState().isOpen).toBe(false);
    expect(useWorkingDocumentStore.getState().current).toBeNull();
  });
});
