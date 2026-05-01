/**
 * @vitest-environment jsdom
 *
 * ChatStage — split layout :
 *   - quand WorkingDocument.isOpen = true, deux panes (chat + doc).
 *   - sinon, un seul pane.
 *
 * On mock les enfants lourds (ChatMessages, FocalStage, …) pour garder le
 * test focalisé sur la composition split.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useWorkingDocumentStore } from "@/stores/working-document";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";

vi.mock("@/app/(user)/components/ChatMessages", () => ({
  ChatMessages: () => <div data-testid="chat-messages-mock">CHAT</div>,
}));
vi.mock("@/app/(user)/components/FocalStage", () => ({
  FocalStage: () => <div data-testid="focal-stage-mock">FOCAL</div>,
}));
vi.mock("@/app/(user)/components/RunProgressBanner", () => ({
  RunProgressBanner: () => null,
}));
vi.mock("@/app/(user)/components/WelcomePanel", () => ({
  WelcomePanel: () => <div data-testid="welcome-mock">WELCOME</div>,
}));
vi.mock("@/app/(user)/components/Breadcrumb", () => ({
  Breadcrumb: () => <div data-testid="breadcrumb-mock" />,
}));

import { ChatStage } from "@/app/(user)/components/stages/ChatStage";

const resetStores = () => {
  useWorkingDocumentStore.setState({ current: null, isOpen: false });
  useFocalStore.setState({
    focal: null,
    secondary: [],
    isFocused: false,
    hasContent: false,
    isVisible: false,
    pinnedFocalKey: null,
  });
  useNavigationStore.setState((s) => ({ ...s, activeThreadId: null }));
};

describe("ChatStage — split layout", () => {
  beforeEach(() => {
    resetStores();
  });

  it("renders only the chat pane when WorkingDocument is closed", async () => {
    render(
      <ChatStage
        messages={[
          { id: "m1", role: "user", content: "hello" } as never,
        ]}
        hasMessages
        onSubmit={async () => {}}
      />,
    );

    expect(screen.getByTestId("chat-messages-mock")).toBeTruthy();
    expect(screen.queryByLabelText("Document de travail")).toBeNull();
  });

  it("renders chat + WorkingDocument pane when isOpen=true", async () => {
    act(() => {
      useWorkingDocumentStore.getState().open({
        title: "Doc",
        content: "body",
      });
    });

    render(
      <ChatStage
        messages={[
          { id: "m1", role: "user", content: "hello" } as never,
        ]}
        hasMessages
        onSubmit={async () => {}}
      />,
    );

    expect(screen.getByTestId("chat-messages-mock")).toBeTruthy();
    expect(screen.getByLabelText("Document de travail")).toBeTruthy();
  });

  it("hides the WorkingDocument pane after close()", async () => {
    act(() => {
      useWorkingDocumentStore.getState().open({
        title: "Doc",
        content: "body",
      });
    });

    const { rerender } = render(
      <ChatStage
        messages={[]}
        hasMessages={false}
        onSubmit={async () => {}}
      />,
    );

    expect(screen.getByLabelText("Document de travail")).toBeTruthy();

    act(() => {
      useWorkingDocumentStore.getState().close();
    });
    rerender(
      <ChatStage
        messages={[]}
        hasMessages={false}
        onSubmit={async () => {}}
      />,
    );

    expect(screen.queryByLabelText("Document de travail")).toBeNull();
  });
});
