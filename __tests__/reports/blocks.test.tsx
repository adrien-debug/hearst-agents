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
