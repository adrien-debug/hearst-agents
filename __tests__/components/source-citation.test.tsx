/**
 * @vitest-environment jsdom
 *
 * SourceCitation — détecte les markers `<sup data-source-id>` et expose
 * un tooltip au hover. fmtCitation produit la string HTML attendue.
 */

import { describe, it, expect } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { SourceCitation } from "@/app/(user)/components/SourceCitation";
import { fmtCitation } from "@/lib/reports/blocks/format";

describe("fmtCitation", () => {
  it("produit une balise <sup> avec data-source-id", () => {
    expect(fmtCitation("s1", 1)).toBe('<sup data-source-id="s1">[1]</sup>');
  });

  it("escape les caractères dangereux", () => {
    expect(fmtCitation('"<>"', 1)).toContain("&quot;");
  });
});

describe("SourceCitation", () => {
  const sources = [
    { id: "s1", url: "https://example.com", label: "Example", fetchedAt: 1700000000000 },
  ];

  it("rend ses children", () => {
    render(
      <SourceCitation sources={sources}>
        <p data-testid="content">Hello</p>
      </SourceCitation>,
    );
    expect(screen.getByTestId("content").textContent).toBe("Hello");
  });

  it("attache un tooltip au hover sur un sup avec data-source-id", () => {
    const html = `Texte avec citation${fmtCitation("s1", 1)} fin.`;
    render(
      <SourceCitation sources={sources}>
        <div data-testid="rendered" dangerouslySetInnerHTML={{ __html: html }} />
      </SourceCitation>,
    );
    const sup = document.querySelector('sup[data-source-id="s1"]');
    expect(sup).toBeTruthy();
    if (!sup) return;
    fireEvent.mouseEnter(sup);
    expect(screen.getByTestId("source-citation-tooltip")).toBeTruthy();
    expect(screen.getByTestId("source-citation-tooltip").textContent).toContain("Example");
  });

  it("ne crash pas avec un sourceId inconnu", () => {
    render(
      <SourceCitation sources={sources}>
        <div dangerouslySetInnerHTML={{ __html: '<sup data-source-id="unknown">[?]</sup>' }} />
      </SourceCitation>,
    );
    const sup = document.querySelector('sup[data-source-id="unknown"]');
    expect(sup).toBeTruthy();
    if (!sup) return;
    fireEvent.mouseEnter(sup);
    expect(screen.queryByTestId("source-citation-tooltip")).toBeNull();
  });
});
