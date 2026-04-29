/**
 * @vitest-environment jsdom
 *
 * Tests du ReportSpecEditor — toggle visibility, callback Apply, Reset.
 * On vérifie le comportement utilisateur sans dépendre du rendu fin
 * des primitives (déjà couvert par blocks.test).
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ReportSpecEditor } from "@/app/(user)/components/reports/ReportSpecEditor";
import type { ReportSpec } from "@/lib/reports/spec/schema";

function buildTestSpec(): ReportSpec {
  return {
    id: "00000000-0000-4000-8000-100000000099",
    version: 1,
    meta: {
      title: "Test",
      summary: "",
      domain: "founder",
      persona: "founder",
      cadence: "ad-hoc",
      confidentiality: "internal",
    },
    scope: {
      tenantId: "t",
      workspaceId: "w",
      userId: "u",
    },
    sources: [
      {
        id: "src_a",
        kind: "http",
        spec: { url: "https://example.com/a", method: "GET" },
      },
    ],
    transforms: [],
    blocks: [
      {
        id: "kpi_a",
        type: "kpi",
        label: "Alpha",
        dataRef: "src_a",
        layout: { col: 1, row: 0 },
        props: { previewValue: 42 },
      },
      {
        id: "kpi_b",
        type: "kpi",
        label: "Beta",
        dataRef: "src_a",
        layout: { col: 1, row: 0 },
        props: { previewValue: 7 },
      },
      {
        id: "tab_c",
        type: "table",
        label: "Charlie",
        dataRef: "src_a",
        layout: { col: 2, row: 1 },
        props: {},
      },
    ],
    refresh: { mode: "manual", cooldownHours: 0 },
    cacheTTL: { raw: 60, transform: 600, render: 3600 },
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("ReportSpecEditor", () => {
  it("rend la liste des blocks avec compteur visible/total", () => {
    const spec = buildTestSpec();
    render(<ReportSpecEditor spec={spec} />);
    // Compteur 3/3 par défaut
    expect(screen.getByText(/3 \/ 3/)).toBeTruthy();
    // Tous les labels présents (au moins 1 fois — label + preview KPI)
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Beta").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Charlie").length).toBeGreaterThan(0);
  });

  it("toggle la visibilité quand on clique sur la checkbox", () => {
    const spec = buildTestSpec();
    render(<ReportSpecEditor spec={spec} />);
    const toggle = screen.getByTestId("editor-toggle-kpi_a") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    // Compteur passe à 2/3
    expect(screen.getByText(/2 \/ 3/)).toBeTruthy();
  });

  it("Apply : émet un onChange avec uniquement les blocks visibles", () => {
    const spec = buildTestSpec();
    const onChange = vi.fn();
    render(<ReportSpecEditor spec={spec} onChange={onChange} />);
    // Cache kpi_a et tab_c → ne reste que kpi_b
    fireEvent.click(screen.getByTestId("editor-toggle-kpi_a"));
    fireEvent.click(screen.getByTestId("editor-toggle-tab_c"));
    fireEvent.click(screen.getByTestId("editor-apply"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0] as ReportSpec;
    expect(emitted.blocks).toHaveLength(1);
    expect(emitted.blocks[0].id).toBe("kpi_b");
    // Les autres champs (sources/meta) sont préservés
    expect(emitted.meta.title).toBe("Test");
    expect(emitted.sources).toHaveLength(1);
  });

  it("Reset : restaure tous les blocks visibles", () => {
    const spec = buildTestSpec();
    render(<ReportSpecEditor spec={spec} />);
    fireEvent.click(screen.getByTestId("editor-toggle-kpi_a"));
    fireEvent.click(screen.getByTestId("editor-toggle-kpi_b"));
    expect(screen.getByText(/1 \/ 3/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("editor-reset"));
    expect(screen.getByText(/3 \/ 3/)).toBeTruthy();
    const toggleA = screen.getByTestId("editor-toggle-kpi_a") as HTMLInputElement;
    expect(toggleA.checked).toBe(true);
  });

  it("affiche 'Aucun block visible' quand tout est désactivé", () => {
    const spec = buildTestSpec();
    render(<ReportSpecEditor spec={spec} />);
    fireEvent.click(screen.getByTestId("editor-toggle-kpi_a"));
    fireEvent.click(screen.getByTestId("editor-toggle-kpi_b"));
    fireEvent.click(screen.getByTestId("editor-toggle-tab_c"));
    expect(screen.getByText(/Aucun block visible/i)).toBeTruthy();
  });

  it("Apply est désactivé si onChange n'est pas fourni", () => {
    const spec = buildTestSpec();
    render(<ReportSpecEditor spec={spec} />);
    const apply = screen.getByTestId("editor-apply") as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });

  it("la liste contient le block_type en uppercase pour chaque block", () => {
    const spec = buildTestSpec();
    render(<ReportSpecEditor spec={spec} />);
    const list = screen.getByTestId("editor-block-list");
    // 'kpi' apparaît au moins 2× (deux blocks kpi)
    expect(within(list).getAllByText("kpi").length).toBeGreaterThanOrEqual(2);
    expect(within(list).getByText("table")).toBeTruthy();
  });
});
