/**
 * @vitest-environment jsdom
 *
 * Working Document Store — open/close/updateContent, no-persist.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useWorkingDocumentStore } from "@/stores/working-document";

const reset = () =>
  useWorkingDocumentStore.setState({ current: null, isOpen: false });

describe("Working Document Store", () => {
  beforeEach(() => {
    reset();
  });

  it("starts closed with no current document", () => {
    const state = useWorkingDocumentStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.current).toBeNull();
  });

  it("open() creates a document with id + createdAt and flips isOpen", () => {
    const before = Date.now();
    useWorkingDocumentStore.getState().open({
      title: "Plan trimestriel",
      content: "# Plan\n\n- Q1\n- Q2",
      sourceMessageId: "msg-42",
    });
    const after = Date.now();
    const state = useWorkingDocumentStore.getState();

    expect(state.isOpen).toBe(true);
    expect(state.current).not.toBeNull();
    expect(state.current?.title).toBe("Plan trimestriel");
    expect(state.current?.content).toBe("# Plan\n\n- Q1\n- Q2");
    expect(state.current?.sourceMessageId).toBe("msg-42");
    expect(typeof state.current?.id).toBe("string");
    expect(state.current?.id.length).toBeGreaterThan(0);
    expect(state.current?.createdAt).toBeGreaterThanOrEqual(before);
    expect(state.current?.createdAt).toBeLessThanOrEqual(after);
  });

  it("close() flips isOpen to false but keeps the current document", () => {
    useWorkingDocumentStore.getState().open({
      title: "Doc",
      content: "Body",
    });
    useWorkingDocumentStore.getState().close();
    const state = useWorkingDocumentStore.getState();

    expect(state.isOpen).toBe(false);
    // Conserve le doc pour qu'un toggle ultérieur (Cmd+B) puisse le rouvrir.
    expect(state.current).not.toBeNull();
    expect(state.current?.title).toBe("Doc");
  });

  it("updateContent() patches the content of the current document", () => {
    useWorkingDocumentStore.getState().open({ title: "T", content: "v1" });
    useWorkingDocumentStore.getState().updateContent("v2");
    expect(useWorkingDocumentStore.getState().current?.content).toBe("v2");
  });

  it("updateContent() is a no-op when no current document", () => {
    useWorkingDocumentStore.getState().updateContent("ignored");
    expect(useWorkingDocumentStore.getState().current).toBeNull();
  });

  it("updateTitle() patches the title of the current document", () => {
    useWorkingDocumentStore.getState().open({ title: "Avant", content: "" });
    useWorkingDocumentStore.getState().updateTitle("Après");
    expect(useWorkingDocumentStore.getState().current?.title).toBe("Après");
  });

  it("toggle() closes when open", () => {
    useWorkingDocumentStore.getState().open({ title: "T", content: "" });
    expect(useWorkingDocumentStore.getState().isOpen).toBe(true);
    useWorkingDocumentStore.getState().toggle();
    expect(useWorkingDocumentStore.getState().isOpen).toBe(false);
  });

  it("toggle() reopens when closed and a document exists", () => {
    useWorkingDocumentStore.getState().open({ title: "T", content: "" });
    useWorkingDocumentStore.getState().close();
    useWorkingDocumentStore.getState().toggle();
    expect(useWorkingDocumentStore.getState().isOpen).toBe(true);
  });

  it("toggle() is a no-op when no document exists yet", () => {
    useWorkingDocumentStore.getState().toggle();
    expect(useWorkingDocumentStore.getState().isOpen).toBe(false);
    expect(useWorkingDocumentStore.getState().current).toBeNull();
  });

  it("does NOT persist to localStorage (volatile by design)", () => {
    useWorkingDocumentStore.getState().open({ title: "Volatile", content: "x" });
    // Aucune entrée localStorage liée au store ne doit apparaître.
    const keys = Object.keys(window.localStorage);
    const matching = keys.filter(
      (k) => k.toLowerCase().includes("working") || k.toLowerCase().includes("document"),
    );
    expect(matching).toEqual([]);
  });

  it("subsequent open() replaces the previous document with a fresh id", () => {
    useWorkingDocumentStore.getState().open({ title: "A", content: "1" });
    const idA = useWorkingDocumentStore.getState().current?.id;
    useWorkingDocumentStore.getState().open({ title: "B", content: "2" });
    const stateB = useWorkingDocumentStore.getState();
    expect(stateB.current?.title).toBe("B");
    expect(stateB.current?.id).not.toBe(idA);
    expect(stateB.isOpen).toBe(true);
  });
});
