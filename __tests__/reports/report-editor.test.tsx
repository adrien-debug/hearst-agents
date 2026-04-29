/**
 * @vitest-environment jsdom
 *
 * ReportEditor — tests UI du panneau d'édition.
 *
 * Couverture :
 *   - toggle visibilité (block.hidden bascule)
 *   - réorder up/down (premier ne peut pas monter, dernier ne peut pas descendre)
 *   - reset (revient au spec initial mémorisé au mount)
 *   - preview JSON (collapsible, contient le spec sérialisé)
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportEditor } from "@/app/(user)/components/reports/ReportEditor";
import type { ReportSpec } from "@/lib/reports/spec/schema";

const SCOPE = {
  tenantId: "t1",
  workspaceId: "w1",
  userId: "u1",
} as const;

function buildSpec(): ReportSpec {
  return {
    id: "00000000-0000-4000-8000-200000000001",
    version: 1,
    meta: {
      title: "Demo report",
      summary: "",
      domain: "founder",
      persona: "founder",
      cadence: "daily",
      confidentiality: "internal",
    },
    scope: SCOPE,
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
        id: "b_kpi",
        type: "kpi",
        label: "Revenue",
        dataRef: "src_a",
        layout: { col: 1, row: 0 },
        props: { field: "value" },
      },
      {
        id: "b_table",
        type: "table",
        label: "Détails",
        dataRef: "src_a",
        layout: { col: 2, row: 0 },
        props: {},
      },
      {
        id: "b_bar",
        type: "bar",
        label: "Top",
        dataRef: "src_a",
        layout: { col: 1, row: 0 },
        props: {},
      },
    ],
    refresh: { mode: "manual", cooldownHours: 0 },
    cacheTTL: { raw: 60, transform: 600, render: 3600 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as ReportSpec;
}

describe("ReportEditor — toggle visibilité", () => {
  it("met à jour block.hidden via onChange quand on toggle la checkbox", () => {
    const spec = buildSpec();
    const onChange = vi.fn();
    render(<ReportEditor spec={spec} onChange={onChange} />);

    const checkbox = screen.getByTestId("report-editor-toggle-b_kpi") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ReportSpec;
    const target = next.blocks.find((b) => b.id === "b_kpi");
    expect(target?.hidden).toBe(true);
    // Les autres blocks ne sont pas modifiés.
    expect(next.blocks.find((b) => b.id === "b_table")?.hidden).toBeFalsy();
  });

  it("re-toggle un block hidden=true le rebascule à false", () => {
    const spec = buildSpec();
    spec.blocks[0].hidden = true;
    const onChange = vi.fn();
    render(<ReportEditor spec={spec} onChange={onChange} />);

    const checkbox = screen.getByTestId("report-editor-toggle-b_kpi") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    const next = onChange.mock.calls[0][0] as ReportSpec;
    expect(next.blocks.find((b) => b.id === "b_kpi")?.hidden).toBe(false);
  });

  it("affiche le compteur de blocs visibles", () => {
    const spec = buildSpec();
    spec.blocks[1].hidden = true;
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    expect(screen.getByText(/2 \/ 3 blocs visibles/)).toBeTruthy();
  });
});

describe("ReportEditor — réorder up/down", () => {
  it("le premier block ne peut pas remonter (bouton désactivé)", () => {
    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    const upBtn = screen.getByTestId("report-editor-up-b_kpi") as HTMLButtonElement;
    expect(upBtn.disabled).toBe(true);
  });

  it("le dernier block ne peut pas descendre (bouton désactivé)", () => {
    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    const downBtn = screen.getByTestId("report-editor-down-b_bar") as HTMLButtonElement;
    expect(downBtn.disabled).toBe(true);
  });

  it("descend le premier block d'une position via onChange", () => {
    const spec = buildSpec();
    const onChange = vi.fn();
    render(<ReportEditor spec={spec} onChange={onChange} />);

    fireEvent.click(screen.getByTestId("report-editor-down-b_kpi"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ReportSpec;
    expect(next.blocks.map((b) => b.id)).toEqual(["b_table", "b_kpi", "b_bar"]);
  });

  it("remonte le dernier block d'une position via onChange", () => {
    const spec = buildSpec();
    const onChange = vi.fn();
    render(<ReportEditor spec={spec} onChange={onChange} />);

    fireEvent.click(screen.getByTestId("report-editor-up-b_bar"));

    const next = onChange.mock.calls[0][0] as ReportSpec;
    expect(next.blocks.map((b) => b.id)).toEqual(["b_kpi", "b_bar", "b_table"]);
  });
});

describe("ReportEditor — reset", () => {
  it("le bouton Reset restaure le spec initial mémorisé au mount", () => {
    const spec = buildSpec();
    const onChange = vi.fn();
    const { rerender } = render(
      <ReportEditor spec={spec} onChange={onChange} />,
    );

    // Simule que le parent a appliqué une modification (toggle hidden).
    const modifiedSpec: ReportSpec = {
      ...spec,
      blocks: spec.blocks.map((b, i) =>
        i === 0 ? { ...b, hidden: true } : b,
      ),
    };
    rerender(<ReportEditor spec={modifiedSpec} onChange={onChange} />);

    fireEvent.click(screen.getByTestId("report-editor-reset"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const reset = onChange.mock.calls[0][0] as ReportSpec;
    // hidden n'est pas défini sur le spec initial → la copie reset ne porte
    // pas non plus hidden=true.
    expect(reset.blocks[0].hidden).toBeFalsy();
    expect(reset.blocks.map((b) => b.id)).toEqual(["b_kpi", "b_table", "b_bar"]);
  });
});

describe("ReportEditor — preview JSON", () => {
  it("le bouton Voir JSON affiche le spec sérialisé en pre", () => {
    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);

    // JSON masqué par défaut.
    expect(screen.queryByTestId("report-editor-json")).toBeNull();

    fireEvent.click(screen.getByTestId("report-editor-json-toggle"));

    const pre = screen.getByTestId("report-editor-json");
    expect(pre).toBeTruthy();
    expect(pre.textContent).toContain('"id": "00000000-0000-4000-8000-200000000001"');
    expect(pre.textContent).toContain('"b_kpi"');
    expect(pre.textContent).toContain('"b_table"');
    expect(pre.textContent).toContain('"b_bar"');
  });

  it("le bouton bascule à 'Masquer JSON' quand le panneau est ouvert", () => {
    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    const toggle = screen.getByTestId("report-editor-json-toggle");
    expect(toggle.textContent).toMatch(/Voir JSON/);
    fireEvent.click(toggle);
    expect(toggle.textContent).toMatch(/Masquer JSON/);
  });

  it("le pre JSON reflète l'ordre des blocks après réorder", () => {
    // On simule un parent qui contrôle le spec et applique le réorder.
    const initial = buildSpec();
    let current = initial;
    const onChange = (next: ReportSpec) => {
      current = next;
    };

    const { rerender } = render(
      <ReportEditor spec={current} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("report-editor-down-b_kpi"));
    rerender(<ReportEditor spec={current} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("report-editor-json-toggle"));

    const pre = screen.getByTestId("report-editor-json");
    const idxKpi = pre.textContent?.indexOf('"b_kpi"') ?? -1;
    const idxTable = pre.textContent?.indexOf('"b_table"') ?? -1;
    expect(idxTable).toBeGreaterThan(-1);
    expect(idxKpi).toBeGreaterThan(idxTable);
  });
});

describe("ReportEditor — close", () => {
  it("affiche le bouton Fermer si onClose est fourni", () => {
    const spec = buildSpec();
    const onClose = vi.fn();
    render(<ReportEditor spec={spec} onChange={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("report-editor-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ne rend pas le bouton Fermer si onClose absent", () => {
    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    expect(screen.queryByTestId("report-editor-close")).toBeNull();
  });
});
