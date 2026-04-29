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
 *   - save template : formulaire, confirm → POST fetch, feedback
 *   - load template : liste, sélection → GET fetch spec, onChange
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

// ── Template save/load ──────────────────────────────────────

const SAVED_TEMPLATE_RESPONSE = {
  template: {
    id: "tpl-uuid-1",
    tenantId: "t1",
    createdBy: "00000000-0000-4000-8000-000000000001",
    name: "Mon template",
    domain: "founder",
    isPublic: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

const TEMPLATE_LIST_RESPONSE = {
  templates: [
    {
      id: "tpl-uuid-1",
      tenantId: "t1",
      createdBy: "00000000-0000-4000-8000-000000000001",
      name: "Mon template",
      description: "Description du template",
      domain: "founder",
      isPublic: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
};

describe("ReportEditor — save template", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("affiche le bouton 'Sauvegarder template' par défaut", () => {
    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    expect(screen.getByTestId("report-editor-save-template")).toBeTruthy();
  });

  it("ouvre le formulaire au clic sur 'Sauvegarder template'", () => {
    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("report-editor-save-template"));
    expect(screen.getByTestId("report-editor-save-form")).toBeTruthy();
    expect(screen.getByTestId("report-editor-save-name")).toBeTruthy();
  });

  it("le champ nom est pré-rempli avec spec.meta.title", () => {
    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("report-editor-save-template"));
    const input = screen.getByTestId("report-editor-save-name") as HTMLInputElement;
    expect(input.value).toBe("Demo report");
  });

  it("Annuler ferme le formulaire sans appeler fetch", () => {
    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("report-editor-save-template"));
    fireEvent.click(screen.getByTestId("report-editor-save-cancel"));
    expect(screen.queryByTestId("report-editor-save-form")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Confirmer appelle POST /api/reports/templates avec le bon body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => SAVED_TEMPLATE_RESPONSE,
    });

    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("report-editor-save-template"));

    const nameInput = screen.getByTestId("report-editor-save-name");
    fireEvent.change(nameInput, { target: { value: "Mon template" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-editor-save-confirm"));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/templates",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.name).toBe("Mon template");
    expect(body.spec.id).toBe(spec.id);
  });

  it("affiche le feedback 'Template sauvegardé' après succès", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => SAVED_TEMPLATE_RESPONSE,
    });

    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("report-editor-save-template"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-editor-save-confirm"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("report-editor-save-feedback").textContent).toMatch(
        /template sauvegardé/i,
      );
    });
  });

  it("affiche le feedback d'erreur si fetch échoue", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });

    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("report-editor-save-template"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-editor-save-confirm"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("report-editor-save-feedback").textContent).toMatch(
        /erreur/i,
      );
    });
  });
});

describe("ReportEditor — load template", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("affiche le bouton 'Charger template' par défaut", () => {
    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);
    expect(screen.getByTestId("report-editor-load-template")).toBeTruthy();
  });

  it("charge la liste des templates au clic", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => TEMPLATE_LIST_RESPONSE,
    });

    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-editor-load-template"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("report-editor-load-list")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/reports/templates");
  });

  it("affiche 'Aucun template' si liste vide", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ templates: [] }),
    });

    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-editor-load-template"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("report-editor-load-empty")).toBeTruthy();
    });
  });

  it("charger un template appelle GET /api/reports/templates/:id et émet onChange", async () => {
    const specForTemplate = buildSpec();
    specForTemplate.meta.title = "Spec depuis template";

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => TEMPLATE_LIST_RESPONSE,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spec: specForTemplate }),
      });

    const onChange = vi.fn();
    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={onChange} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-editor-load-template"));
    });

    await waitFor(() => screen.getByTestId("report-editor-load-list"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-editor-load-item-tpl-uuid-1"));
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
      const loaded = onChange.mock.calls[0][0] as ReportSpec;
      expect(loaded.meta.title).toBe("Spec depuis template");
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/reports/templates/tpl-uuid-1");
  });

  it("ferme la liste au clic 'Fermer'", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => TEMPLATE_LIST_RESPONSE,
    });

    const spec = buildSpec();
    render(<ReportEditor spec={spec} onChange={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("report-editor-load-template"));
    });

    await waitFor(() => screen.getByTestId("report-editor-load-list"));

    fireEvent.click(screen.getByTestId("report-editor-load-cancel"));
    expect(screen.queryByTestId("report-editor-load-list")).toBeNull();
  });
});
