/**
 * @vitest-environment jsdom
 *
 * useAssetDrag — vérifie l'écriture du payload sur dataTransfer et le
 * round-trip via readAssetDragPayload.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  ASSET_DRAG_MIME,
  readAssetDragPayload,
  useAssetDrag,
} from "@/app/(user)/components/use-asset-drag";

function makeDataTransfer() {
  const store = new Map<string, string>();
  return {
    setData: vi.fn((mime: string, value: string) => {
      store.set(mime, value);
    }),
    getData: vi.fn((mime: string) => store.get(mime) ?? ""),
    types: [] as string[],
    effectAllowed: "" as string,
    _store: store,
  };
}

describe("useAssetDrag", () => {
  it("renvoie un getDragProps qui set le payload sur dataTransfer", () => {
    const { result } = renderHook(() => useAssetDrag());
    const dragProps = result.current.getDragProps({
      id: "asset-1",
      kind: "report",
      title: "Mon rapport",
    });
    expect(dragProps.draggable).toBe(true);
    const dt = makeDataTransfer();
    act(() => {
      dragProps.onDragStart({
        dataTransfer: dt,
      } as unknown as React.DragEvent<HTMLElement>);
    });
    const stored = dt._store.get(ASSET_DRAG_MIME);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed).toEqual({ assetId: "asset-1", kind: "report", title: "Mon rapport" });
    expect(dt._store.get("text/plain")).toBe("@asset:Mon rapport");
  });

  it("readAssetDragPayload retourne le payload roundtrip", () => {
    const dt = makeDataTransfer();
    dt.setData(
      ASSET_DRAG_MIME,
      JSON.stringify({ assetId: "a1", kind: "report", title: "T" }),
    );
    const payload = readAssetDragPayload({
      dataTransfer: dt,
    } as unknown as React.DragEvent<HTMLElement>);
    expect(payload).toEqual({ assetId: "a1", kind: "report", title: "T" });
  });

  it("readAssetDragPayload retourne null si le MIME absent", () => {
    const dt = makeDataTransfer();
    const payload = readAssetDragPayload({
      dataTransfer: dt,
    } as unknown as React.DragEvent<HTMLElement>);
    expect(payload).toBeNull();
  });

  it("readAssetDragPayload retourne null sur JSON invalide", () => {
    const dt = makeDataTransfer();
    dt.setData(ASSET_DRAG_MIME, "{not-json");
    const payload = readAssetDragPayload({
      dataTransfer: dt,
    } as unknown as React.DragEvent<HTMLElement>);
    expect(payload).toBeNull();
  });
});
