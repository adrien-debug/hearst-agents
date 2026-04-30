/**
 * @vitest-environment jsdom
 *
 * Block — détection de type + rendu conditionnel + mode édition.
 *
 * Couvre :
 *   - parsing markdown léger (heading / list / paragraph / insight / action_items)
 *   - render conditional editable (toggle vers BlockEditor au clic Éditer)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Block, detectBlockType } from "@/app/(user)/components/chat/Block";

describe("detectBlockType", () => {
  it("détecte un section_heading via `#`", () => {
    expect(detectBlockType("# Titre principal")).toBe("section_heading");
  });

  it("détecte un subsection_heading via `##`", () => {
    expect(detectBlockType("## Sous-titre")).toBe("subsection_heading");
  });

  it("détecte un insight via **Insight** en tête", () => {
    expect(detectBlockType("**Insight** : focus sur la rétention.")).toBe("insight");
    expect(detectBlockType("**Recommandation** : prioriser le P0.")).toBe("insight");
  });

  it("détecte une list quand toutes les lignes sont des bullets", () => {
    expect(detectBlockType("- un\n- deux\n- trois".replace(/\\n/g, "\n"))).toBe("list");
    expect(detectBlockType(["- un", "- deux", "- trois"].join("\n"))).toBe("list");
    expect(detectBlockType(["• un", "• deux"].join("\n"))).toBe("list");
  });

  it("détecte action_items quand toutes les lignes sont `[ ]` / `[x]`", () => {
    expect(detectBlockType(["[ ] tâche A", "[x] tâche B"].join("\n"))).toBe("action_items");
  });

  it("retombe sur paragraph sinon", () => {
    expect(detectBlockType("Un texte normal sur une ligne.")).toBe("paragraph");
    expect(detectBlockType("")).toBe("paragraph");
  });

  it("ne détecte pas une list quand mélangée avec du paragraphe", () => {
    expect(detectBlockType(["intro", "- item"].join("\n"))).toBe("paragraph");
  });
});

describe("Block — rendu", () => {
  it("rend un section_heading en h2", () => {
    const { container } = render(<Block content="# Hello" />);
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2?.textContent).toContain("Hello");
  });

  it("rend une list comme <ul> avec puces", () => {
    const { container } = render(<Block content={"- A\n- B\n- C"} />);
    const ul = container.querySelector("ul");
    expect(ul).not.toBeNull();
    expect(ul?.querySelectorAll("li").length).toBe(3);
  });

  it("rend un insight avec label cykan", () => {
    render(<Block content="**Insight** : truc important" />);
    expect(screen.getByText("Insight")).toBeTruthy();
  });

  it("rend des action_items avec checkboxes", () => {
    const { container } = render(
      <Block content={"[ ] première\n[x] deuxième"} />,
    );
    const checkboxes = container.querySelectorAll("input[type='checkbox']");
    expect(checkboxes.length).toBe(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
  });

  it("rend du markdown inline (gras, code, lien)", () => {
    const { container } = render(
      <Block content="Voici **gras** et `code` et [lien](https://x.test)" />,
    );
    expect(container.querySelector("strong")).not.toBeNull();
    expect(container.querySelector("code")).not.toBeNull();
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://x.test");
  });

  it("expose data-block-type sur le wrapper", () => {
    render(<Block content="# Titre" />);
    const wrapper = screen.getByTestId("chat-block");
    expect(wrapper.getAttribute("data-block-type")).toBe("section_heading");
  });

  it("toggle vers BlockEditor quand on clique Éditer", () => {
    render(<Block content="texte initial" editable />);
    expect(screen.queryByTestId("block-editor")).toBeNull();
    fireEvent.click(screen.getByTestId("block-action-edit"));
    expect(screen.getByTestId("block-editor")).toBeTruthy();
  });

  it("appelle onSave quand l'éditeur enregistre", () => {
    const onSave = vi.fn();
    render(<Block content="initial" editable onSave={onSave} />);
    fireEvent.click(screen.getByTestId("block-action-edit"));
    fireEvent.click(screen.getByTestId("block-editor-save"));
    expect(onSave).toHaveBeenCalledWith("initial");
  });

  it("revient en lecture après Annuler", () => {
    render(<Block content="initial" editable />);
    fireEvent.click(screen.getByTestId("block-action-edit"));
    expect(screen.getByTestId("block-editor")).toBeTruthy();
    fireEvent.click(screen.getByTestId("block-editor-cancel"));
    expect(screen.queryByTestId("block-editor")).toBeNull();
  });

  it("propage les actions non-edit via onAction", () => {
    const onAction = vi.fn();
    render(<Block content="hello" onAction={onAction} />);
    fireEvent.click(screen.getByTestId("block-action-expand"));
    expect(onAction).toHaveBeenCalledWith("expand");
  });
});
