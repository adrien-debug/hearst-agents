/**
 * @vitest-environment jsdom
 *
 * BlockPalette + SpecOutline — tests UI minimaux du Studio.
 *
 * Couverture :
 *   - BlockPalette : rend toutes les primitives, click → onAdd
 *   - SpecOutline : rend la liste, focus/move/remove, drop kind
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockPalette } from "@/app/(user)/components/reports/studio/BlockPalette";
import { SpecOutline } from "@/app/(user)/components/reports/studio/SpecOutline";
import type { BlockSpec } from "@/lib/reports/spec/schema";

const SAMPLE_BLOCKS: BlockSpec[] = [
  {
    id: "b1",
    type: "kpi",
    label: "Revenue",
    dataRef: "src_a",
    layout: { col: 1, row: 0 },
    props: { field: "value" },
  },
  {
    id: "b2",
    type: "table",
    label: "Détails",
    dataRef: "src_a",
    layout: { col: 4, row: 1 },
    props: {},
  },
];

describe("BlockPalette", () => {
  it("rend les primitives V1+V2 et appelle onAdd au click", () => {
    const onAdd = vi.fn();
    render(<BlockPalette onAdd={onAdd} />);

    expect(screen.getByTestId("palette-kpi")).toBeTruthy();
    expect(screen.getByTestId("palette-table")).toBeTruthy();
    expect(screen.getByTestId("palette-waterfall")).toBeTruthy();
    expect(screen.getByTestId("palette-gantt")).toBeTruthy();

    fireEvent.click(screen.getByTestId("palette-kpi"));
    expect(onAdd).toHaveBeenCalledWith("kpi");
  });
});

describe("SpecOutline", () => {
  it("rend la liste vide + état empty", () => {
    render(
      <SpecOutline
        blocks={[]}
        onSelect={() => {}}
        onMove={() => {}}
        onRemove={() => {}}
        onDropKind={() => {}}
      />,
    );
    expect(screen.getByTestId("outline-empty")).toBeTruthy();
  });

  it("rend la liste, click select, move/remove appellent les handlers", () => {
    const onSelect = vi.fn();
    const onMove = vi.fn();
    const onRemove = vi.fn();
    render(
      <SpecOutline
        blocks={SAMPLE_BLOCKS}
        selectedBlockId="b1"
        onSelect={onSelect}
        onMove={onMove}
        onRemove={onRemove}
        onDropKind={() => {}}
      />,
    );

    expect(screen.getByTestId("outline-block-b1")).toBeTruthy();
    expect(screen.getByTestId("outline-block-b2")).toBeTruthy();

    fireEvent.click(screen.getByTestId("outline-select-b2"));
    expect(onSelect).toHaveBeenCalledWith("b2");

    fireEvent.click(screen.getByTestId("outline-down-b1"));
    expect(onMove).toHaveBeenCalledWith("b1", 1);

    fireEvent.click(screen.getByTestId("outline-remove-b2"));
    expect(onRemove).toHaveBeenCalledWith("b2");
  });

  it("up désactivé sur premier, down désactivé sur dernier", () => {
    render(
      <SpecOutline
        blocks={SAMPLE_BLOCKS}
        onSelect={() => {}}
        onMove={() => {}}
        onRemove={() => {}}
        onDropKind={() => {}}
      />,
    );
    const upFirst = screen.getByTestId("outline-up-b1") as HTMLButtonElement;
    const downLast = screen.getByTestId("outline-down-b2") as HTMLButtonElement;
    expect(upFirst.disabled).toBe(true);
    expect(downLast.disabled).toBe(true);
  });
});
