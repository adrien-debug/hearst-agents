/**
 * @vitest-environment jsdom
 *
 * Tests des primitives charts. Vérifie : rendu, accessibilité, edge cases
 * (vide, valeurs nulles), formatage. Pas de snapshot — assertion explicite
 * sur DOM structure pour rester robuste aux refactors visuels.
 */

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { KpiTile } from "@/lib/reports/blocks/KpiTile";
import { Sparkline } from "@/lib/reports/blocks/Sparkline";
import { Bar } from "@/lib/reports/blocks/Bar";
import { Table } from "@/lib/reports/blocks/Table";
import { Funnel } from "@/lib/reports/blocks/Funnel";
import { Waterfall } from "@/lib/reports/blocks/Waterfall";
import { CohortTriangle } from "@/lib/reports/blocks/CohortTriangle";
import { Heatmap } from "@/lib/reports/blocks/Heatmap";
import { Sankey } from "@/lib/reports/blocks/Sankey";
import { Bullet } from "@/lib/reports/blocks/Bullet";
import { Radar } from "@/lib/reports/blocks/Radar";
import { Gantt } from "@/lib/reports/blocks/Gantt";
import {
  sankeyPropsSchema,
  bulletPropsSchema,
  radarPropsSchema,
  ganttPropsSchema,
} from "@/lib/reports/spec/schema";

describe("KpiTile", () => {
  it("affiche label, valeur et delta", () => {
    render(
      <KpiTile
        data={{ value: 12345, delta: 0.123 }}
        label="MRR"
        format="currency"
      />,
    );
    expect(screen.getByText(/MRR/i)).toBeTruthy();
    // valeur formatée FR
    expect(screen.getByText(/12\s345/)).toBeTruthy();
    // delta positif → cykan, le texte contient "+"
    expect(screen.getByText(/\+12,3 %/)).toBeTruthy();
  });

  it("gère value null avec '—'", () => {
    render(<KpiTile data={{ value: null }} label="Pipeline" />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("affiche un suffixe optionnel", () => {
    render(<KpiTile data={{ value: 7 }} label="TTL" suffix="j" />);
    expect(screen.getByText("j")).toBeTruthy();
  });

  it("rend une sparkline si data.sparkline présent", () => {
    const { container } = render(
      <KpiTile
        data={{ value: 100, sparkline: [10, 20, 15, 30, 25] }}
        label="Trend"
      />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("Sparkline", () => {
  it("rend un SVG avec un path", () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 4, 5]} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.querySelectorAll("path").length).toBeGreaterThanOrEqual(1);
  });

  it("affiche un fallback si <2 points", () => {
    render(<Sparkline values={[42]} label="Trop court" />);
    expect(screen.getByText(/insuffisante/i)).toBeTruthy();
  });

  it("respecte aria-label custom", () => {
    const { container } = render(
      <Sparkline values={[1, 2, 3]} label="Tendance MRR" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Tendance MRR");
  });
});

describe("Bar", () => {
  it("rend N barres triées descendant", () => {
    const data = [
      { name: "A", value: 30 },
      { name: "B", value: 10 },
      { name: "C", value: 50 },
    ];
    render(<Bar data={data} labelField="name" valueField="value" />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    // Premier item = C (top descendant)
    expect(within(items[0]).getByText("C")).toBeTruthy();
  });

  it("limite le nombre de barres", () => {
    const data = Array.from({ length: 20 }, (_, i) => ({
      name: `n${i}`,
      value: i,
    }));
    render(<Bar data={data} limit={5} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("affiche fallback sur data vide", () => {
    render(<Bar data={[]} />);
    expect(screen.getByText(/Aucune donn/i)).toBeTruthy();
  });
});

describe("Table", () => {
  it("rend les headers et rows", () => {
    const data = [
      { name: "Alice", score: 95 },
      { name: "Bob", score: 80 },
    ];
    render(<Table data={data} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    // Score column header
    expect(screen.getByText(/^score/i)).toBeTruthy();
  });

  it("limite à `limit` rows", () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const { container } = render(<Table data={data} limit={20} />);
    // 20 rows tbody + 1 header
    expect(container.querySelectorAll("tbody tr").length).toBe(20);
    // Footer "20 / 100 rows"
    expect(screen.getByText(/20 \/ 100/)).toBeTruthy();
  });

  it("affiche fallback sur data vide", () => {
    render(<Table data={[]} />);
    expect(screen.getByText(/Aucune donn/i)).toBeTruthy();
  });
});

describe("Funnel", () => {
  it("rend les étapes avec conversion %", () => {
    const data = [
      { stage: "Visites", count: 1000 },
      { stage: "Inscriptions", count: 200 },
      { stage: "Conversions", count: 50 },
    ];
    render(<Funnel data={data} labelField="stage" valueField="count" />);
    expect(screen.getByText("Visites")).toBeTruthy();
    expect(screen.getByText("Inscriptions")).toBeTruthy();
    // Conversion vs étape précédente : 200/1000 = 20%
    expect(screen.getByText(/20,0 %/)).toBeTruthy();
  });

  it("première étape n'a pas de conv vs précédente", () => {
    const data = [{ stage: "Top", count: 100 }];
    render(<Funnel data={data} labelField="stage" valueField="count" />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("Waterfall", () => {
  it("rend les barres et les labels d'un P&L nominal", () => {
    const data = [
      { label: "Revenue", value: 100_000, type: "start" as const },
      { label: "COGS", value: -32_000, type: "delta" as const },
      { label: "Opex", value: -28_000, type: "delta" as const },
      { label: "Net", value: 40_000, type: "total" as const },
    ];
    const { container } = render(
      <Waterfall data={data} format="currency" currency="EUR" />,
    );
    // 4 rectangles → 4 étapes
    expect(container.querySelectorAll("rect").length).toBe(4);
    // labels visibles
    expect(screen.getByText("Revenue")).toBeTruthy();
    expect(screen.getByText("COGS")).toBeTruthy();
    expect(screen.getByText("Net")).toBeTruthy();
  });

  it("préfixe les deltas positifs avec un '+' et négatifs avec '-'", () => {
    const data = [
      { label: "Start", value: 100, type: "start" as const },
      { label: "Plus", value: 50, type: "delta" as const },
      { label: "Moins", value: -30, type: "delta" as const },
      { label: "End", value: 120, type: "total" as const },
    ];
    render(<Waterfall data={data} format="number" />);
    // delta positif : préfixé "+"
    expect(screen.getByText(/\+50/)).toBeTruthy();
    // delta négatif : le signe natif "−"/"-" est porté par fmtNumber, on cherche -30
    expect(screen.getByText(/-30|−30/)).toBeTruthy();
  });

  it("affiche fallback sur data vide", () => {
    render(<Waterfall data={[]} />);
    expect(screen.getByText(/Aucune donn/i)).toBeTruthy();
  });

  it("ignore les valeurs non finies sans crasher", () => {
    const data = [
      { label: "OK", value: 10, type: "start" as const },
      { label: "NaN", value: Number.NaN, type: "delta" as const },
    ];
    const { container } = render(<Waterfall data={data} format="number" />);
    // 2 rects rendus malgré NaN
    expect(container.querySelectorAll("rect").length).toBe(2);
  });
});

describe("CohortTriangle", () => {
  it("rend une grille triangulaire avec en-têtes de période", () => {
    const cohorts = [
      { label: "2026-01", values: [1, 0.6, 0.45, 0.4] },
      { label: "2026-02", values: [1, 0.62, 0.5] },
      { label: "2026-03", values: [1, 0.55] },
      { label: "2026-04", values: [1] },
    ];
    render(<CohortTriangle cohorts={cohorts} />);
    // En-têtes M0..M3
    expect(screen.getByText("M0")).toBeTruthy();
    expect(screen.getByText("M3")).toBeTruthy();
    // Labels cohortes
    expect(screen.getByText("2026-01")).toBeTruthy();
    expect(screen.getByText("2026-04")).toBeTruthy();
  });

  it("affiche fallback si cohortes vides", () => {
    render(<CohortTriangle cohorts={[]} />);
    expect(screen.getByText(/Aucune donn/i)).toBeTruthy();
  });

  it("affiche fallback si toutes les cohortes ont values vides", () => {
    render(
      <CohortTriangle
        cohorts={[
          { label: "C1", values: [] },
          { label: "C2", values: [] },
        ]}
      />,
    );
    expect(screen.getByText(/Aucune donn/i)).toBeTruthy();
  });

  it("supporte le mode brut (asPercent=false)", () => {
    const cohorts = [{ label: "C1", values: [120, 80, 50] }];
    render(<CohortTriangle cohorts={cohorts} asPercent={false} />);
    // Les valeurs brutes apparaissent
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("80")).toBeTruthy();
  });

  it("respecte un periodPrefix custom", () => {
    const cohorts = [{ label: "C1", values: [1, 0.5] }];
    render(<CohortTriangle cohorts={cohorts} periodPrefix="W" />);
    expect(screen.getByText("W0")).toBeTruthy();
    expect(screen.getByText("W1")).toBeTruthy();
  });
});

describe("Heatmap", () => {
  it("rend une grille xLabels × yLabels avec valeurs cliquables (title)", () => {
    const xLabels = ["00h", "06h", "12h", "18h"];
    const yLabels = ["Lun", "Mar", "Mer"];
    const values = [
      [0, 5, 12, 8],
      [1, 7, 15, 9],
      [0, 3, 10, 6],
    ];
    render(
      <Heatmap xLabels={xLabels} yLabels={yLabels} values={values} showValues />,
    );
    // En-têtes
    expect(screen.getByText("00h")).toBeTruthy();
    expect(screen.getByText("18h")).toBeTruthy();
    expect(screen.getByText("Lun")).toBeTruthy();
    // Une valeur centrale (fmtNumber FR : "15,00")
    const cells = screen.getAllByText(/15,00/);
    expect(cells.length).toBeGreaterThan(0);
  });

  it("affiche fallback si xLabels vide", () => {
    render(<Heatmap xLabels={[]} yLabels={["Lun"]} values={[[]]} />);
    expect(screen.getByText(/Aucune donn/i)).toBeTruthy();
  });

  it("affiche fallback si yLabels vide", () => {
    render(<Heatmap xLabels={["00h"]} yLabels={[]} values={[]} />);
    expect(screen.getByText(/Aucune donn/i)).toBeTruthy();
  });

  it("traite les cellules manquantes/non-finies comme zéro", () => {
    const xLabels = ["A", "B"];
    const yLabels = ["R1"];
    // Row partielle + NaN
    const values = [[Number.NaN]];
    const { container } = render(
      <Heatmap xLabels={xLabels} yLabels={yLabels} values={values} />,
    );
    // 2 cellules rendues (une par x)
    expect(container.querySelectorAll('[role="cell"]').length).toBe(2);
  });
});

describe("Sankey", () => {
  it("rend nodes et links pour un flow nominal", () => {
    const nodes = [
      { id: "src_a", label: "Source A" },
      { id: "src_b", label: "Source B" },
      { id: "landing", label: "Landing" },
      { id: "convert", label: "Convert" },
    ];
    const links = [
      { source: "src_a", target: "landing", value: 600 },
      { source: "src_b", target: "landing", value: 400 },
      { source: "landing", target: "convert", value: 320 },
    ];
    const { container } = render(<Sankey nodes={nodes} links={links} />);
    // 4 rectangles nodes + au moins 3 paths links
    expect(container.querySelectorAll("rect").length).toBe(4);
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(3);
    // Labels visibles (présents au moins une fois — SVG <title> + légende)
    expect(screen.getAllByText("Source A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Convert").length).toBeGreaterThan(0);
  });

  it("affiche fallback sur nodes vides", () => {
    render(<Sankey nodes={[]} links={[]} />);
    expect(screen.getByText(/Aucune donn/i)).toBeTruthy();
  });

  it("supporte value=0 sans crasher", () => {
    const nodes = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    const links = [{ source: "a", target: "b", value: 0 }];
    const { container } = render(<Sankey nodes={nodes} links={links} />);
    expect(container.querySelectorAll("rect").length).toBe(2);
  });

  it("Zod : refuse un link vers un node inconnu", () => {
    const result = sankeyPropsSchema.safeParse({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      links: [{ source: "a", target: "missing_node", value: 10 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /missing_node/.test(i.message)),
      ).toBe(true);
    }
  });

  it("Zod : refuse les ids node dupliqués", () => {
    const result = sankeyPropsSchema.safeParse({
      nodes: [
        { id: "a", label: "A1" },
        { id: "a", label: "A2" },
      ],
      links: [{ source: "a", target: "a", value: 1 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("Bullet", () => {
  it("rend chaque item avec actual et target", () => {
    const items = [
      {
        label: "Revenue Q1",
        actual: 78_000,
        target: 100_000,
        ranges: { bad: 50_000, ok: 80_000, good: 110_000 },
      },
      {
        label: "Pipeline",
        actual: 45,
        target: 60,
        ranges: { bad: 30, ok: 50, good: 70 },
      },
    ];
    render(<Bullet items={items} />);
    expect(screen.getByRole("list")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Revenue Q1")).toBeTruthy();
    expect(screen.getByText("Pipeline")).toBeTruthy();
  });

  it("gère un actual qui dépasse good", () => {
    const items = [
      {
        label: "Over",
        actual: 200,
        target: 100,
        ranges: { bad: 30, ok: 60, good: 100 },
      },
    ];
    const { container } = render(<Bullet items={items} />);
    expect(container.querySelectorAll('[role="listitem"]').length).toBe(1);
    // Pas de NaN/crasher : le wrapper de la barre est rendu.
    expect(screen.getByText("Over")).toBeTruthy();
  });

  it("tolère des ranges désordonnés (tri interne)", () => {
    const items = [
      {
        label: "Mixed",
        actual: 50,
        target: 75,
        // ranges donnés dans le désordre — le composant doit les trier.
        ranges: { bad: 80, ok: 30, good: 50 },
      },
    ];
    const { container } = render(<Bullet items={items} />);
    expect(container.querySelectorAll('[role="listitem"]').length).toBe(1);
  });

  it("affiche fallback sur items vides", () => {
    render(<Bullet items={[]} />);
    expect(screen.getByText(/Aucune donn/i)).toBeTruthy();
  });

  it("Zod : valide une structure correcte", () => {
    const result = bulletPropsSchema.safeParse({
      items: [
        {
          label: "Test",
          actual: 50,
          target: 75,
          ranges: { bad: 30, ok: 60, good: 90 },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("Zod : refuse un item sans ranges", () => {
    const result = bulletPropsSchema.safeParse({
      items: [
        { label: "Test", actual: 50, target: 75 },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("Radar", () => {
  it("rend axes et un polygone par série", () => {
    const axes = ["Vélocité", "Qualité", "DX", "Sécurité", "Coût"];
    const series = [
      { label: "Q1", values: [0.8, 0.7, 0.6, 0.5, 0.9] },
    ];
    const { container } = render(<Radar axes={axes} series={series} />);
    // 1 polygone (path avec 'M ... Z')
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(1);
    // Labels axes visibles
    expect(screen.getByText("Vélocité")).toBeTruthy();
    expect(screen.getByText("Coût")).toBeTruthy();
  });

  it("rend plusieurs séries avec légende", () => {
    const axes = ["A", "B", "C"];
    const series = [
      { label: "Avant", values: [0.4, 0.5, 0.6] },
      { label: "Après", values: [0.7, 0.8, 0.9] },
    ];
    render(<Radar axes={axes} series={series} />);
    // Légende visible quand >1 série (le label apparaît aussi en <title> SVG)
    expect(screen.getAllByText("Avant").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Après").length).toBeGreaterThan(0);
  });

  it("affiche fallback si axes vide", () => {
    render(<Radar axes={[]} series={[]} />);
    expect(screen.getByText(/Aucune donn/i)).toBeTruthy();
  });

  it("affiche fallback si série vide", () => {
    render(<Radar axes={["A", "B", "C"]} series={[]} />);
    expect(screen.getByText(/Aucune donn/i)).toBeTruthy();
  });

  it("Zod : refuse un mismatch axes / values count", () => {
    const result = radarPropsSchema.safeParse({
      axes: ["A", "B", "C"],
      series: [{ label: "S1", values: [0.5, 0.6] }], // 2 vs 3 axes
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /axes\.length/.test(i.message)),
      ).toBe(true);
    }
  });

  it("Zod : refuse moins de 3 axes", () => {
    const result = radarPropsSchema.safeParse({
      axes: ["A", "B"],
      series: [{ label: "S1", values: [0.5, 0.6] }],
    });
    expect(result.success).toBe(false);
  });

  it("Zod : valide une structure correcte", () => {
    const result = radarPropsSchema.safeParse({
      axes: ["A", "B", "C"],
      series: [
        { label: "S1", values: [0.5, 0.6, 0.7] },
        { label: "S2", values: [0.8, 0.9, 1.0] },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("Gantt", () => {
  it("rend les barres et labels d'une roadmap nominale", () => {
    const range = { start: "2026-05-01", end: "2026-06-30" };
    const tasks = [
      {
        id: "spec",
        label: "Spec technique",
        start: "2026-05-01",
        end: "2026-05-10",
        progress: 1,
      },
      {
        id: "build",
        label: "Implémentation core",
        start: "2026-05-11",
        end: "2026-06-05",
        progress: 0.6,
        dependsOn: ["spec"],
      },
    ];
    const { container } = render(<Gantt range={range} tasks={tasks} />);
    // Au moins 1 SVG, des rect (barres + progress) et 1 marker pour la flèche.
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    // Labels visibles (présents au moins une fois — text + title SVG)
    expect(screen.getAllByText("Spec technique").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Implémentation core").length).toBeGreaterThan(0);
    // Au moins une dépendance rendue (path pointillé)
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(1);
  });

  it("affiche fallback si range non défini", () => {
    render(
      <Gantt
        range={{ start: "", end: "" }}
        tasks={[]}
      />,
    );
    expect(screen.getByText(/Aucune période/i)).toBeTruthy();
  });

  it("affiche un message vide pour la zone tâches quand tasks=[]", () => {
    const { container } = render(
      <Gantt
        range={{ start: "2026-05-01", end: "2026-05-31" }}
        tasks={[]}
      />,
    );
    // Le SVG est rendu avec axe + message vide, pas de rect tâche.
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.getByText(/Aucune tâche/i)).toBeTruthy();
  });

  it("Zod : valide une structure correcte", () => {
    const result = ganttPropsSchema.safeParse({
      range: { start: "2026-05-01", end: "2026-06-30" },
      tasks: [
        {
          id: "t1",
          label: "Task 1",
          start: "2026-05-02",
          end: "2026-05-10",
          progress: 0.5,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("Zod : refuse une tâche en dehors du range", () => {
    const result = ganttPropsSchema.safeParse({
      range: { start: "2026-05-01", end: "2026-05-31" },
      tasks: [
        {
          id: "t1",
          label: "Outside",
          start: "2026-04-15", // avant range.start
          end: "2026-05-10",
          progress: 0.3,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /hors range/.test(i.message)),
      ).toBe(true);
    }
  });

  it("Zod : refuse une dépendance vers une task inconnue", () => {
    const result = ganttPropsSchema.safeParse({
      range: { start: "2026-05-01", end: "2026-05-31" },
      tasks: [
        {
          id: "t1",
          label: "Solo",
          start: "2026-05-02",
          end: "2026-05-10",
          progress: 0.5,
          dependsOn: ["unknown_task"],
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /unknown_task/.test(i.message)),
      ).toBe(true);
    }
  });

  it("Zod : refuse progress > 1", () => {
    const result = ganttPropsSchema.safeParse({
      range: { start: "2026-05-01", end: "2026-05-31" },
      tasks: [
        {
          id: "t1",
          label: "Over",
          start: "2026-05-02",
          end: "2026-05-10",
          progress: 1.5, // > 1
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("Zod : refuse end <= start sur une tâche", () => {
    const result = ganttPropsSchema.safeParse({
      range: { start: "2026-05-01", end: "2026-05-31" },
      tasks: [
        {
          id: "t1",
          label: "Inverted",
          start: "2026-05-10",
          end: "2026-05-05",
          progress: 0.1,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
