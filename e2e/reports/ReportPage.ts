/**
 * ReportPage — Page Object Playwright pour le flow report.
 *
 * Encapsule les locators et actions fréquentes pour éviter la duplication
 * dans les specs. Suit le pattern déjà implicitement utilisé dans
 * suggestion-flow.spec.ts (sans classe formelle).
 */

import type { Page, Locator } from "@playwright/test";
import { SPEC_ID } from "./fixtures";

export class ReportPage {
  readonly page: Page;

  // ── Locators principaux ──────────────────────────────────────
  readonly reportLayout: Locator;
  readonly kpiLabels: Locator;
  readonly kpiValues: Locator;

  // Suggestion dans le right-panel
  readonly suggestion: Locator;

  // Header actions
  readonly editToggleBtn: Locator;
  readonly historyToggleBtn: Locator;

  // Editor
  readonly reportEditor: Locator;
  readonly resetBtn: Locator;
  readonly jsonToggleBtn: Locator;
  readonly jsonPreview: Locator;
  readonly blockList: Locator;

  // Export & Share (dans ReportActions)
  readonly exportBtn: Locator;
  readonly shareBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.reportLayout      = page.locator('[data-testid="report-layout"]');
    this.kpiLabels         = page.locator('[data-testid="kpi-label"]');
    this.kpiValues         = page.locator('[data-testid="kpi-value"]');
    this.suggestion        = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);

    this.editToggleBtn     = page.locator('[data-testid="report-layout-edit-toggle"]');
    this.historyToggleBtn  = page.locator('[data-testid="report-layout-history-toggle"]');

    this.reportEditor      = page.locator('[data-testid="report-editor"]');
    this.resetBtn          = page.locator('[data-testid="report-editor-reset"]');
    this.jsonToggleBtn     = page.locator('[data-testid="report-editor-json-toggle"]');
    this.jsonPreview       = page.locator('[data-testid="report-editor-json"]');
    this.blockList         = page.locator('[data-testid="report-editor-block-list"]');

    // ReportActions — boutons textuels (pas de data-testid dessus, OK par spec)
    this.exportBtn         = page.getByRole("button", { name: "Exporter" });
    this.shareBtn          = page.getByRole("button", { name: "Partager" });
  }

  // ── Actions ──────────────────────────────────────────────────

  async goto() {
    await this.page.goto("/");
  }

  /** Attend que la suggestion soit visible puis clique dessus. */
  async clickSuggestion(timeout = 8000) {
    await this.suggestion.waitFor({ state: "visible", timeout });
    await this.suggestion.click();
  }

  /** Attend que le ReportLayout soit chargé. */
  async waitForReport(timeout = 15_000) {
    await this.reportLayout.waitFor({ state: "visible", timeout });
  }

  /** Ouvre le panneau d'édition (nécessite que spec+onSpecChange soient fournis côté composant). */
  async openEditor(timeout = 5000) {
    await this.editToggleBtn.waitFor({ state: "visible", timeout });
    await this.editToggleBtn.click();
    await this.reportEditor.waitFor({ state: "visible", timeout });
  }

  /** Toggle la visibilité d'un bloc par son id. */
  async toggleBlock(blockId: string) {
    const checkbox = this.page.locator(`[data-testid="report-editor-toggle-${blockId}"]`);
    await checkbox.click();
  }

  /** Clique le bouton ↑ d'un bloc. */
  async moveBlockUp(blockId: string) {
    await this.page.locator(`[data-testid="report-editor-up-${blockId}"]`).click();
  }

  /** Clique le bouton ↓ d'un bloc. */
  async moveBlockDown(blockId: string) {
    await this.page.locator(`[data-testid="report-editor-down-${blockId}"]`).click();
  }

  /** Retourne les ids de blocks dans l'ordre affiché dans l'éditeur. */
  async getBlockOrder(): Promise<string[]> {
    const rows = this.blockList.locator("li");
    const count = await rows.count();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const checkbox = rows.nth(i).locator('input[type="checkbox"]');
      const testid = await checkbox.getAttribute("data-testid");
      if (testid) {
        ids.push(testid.replace("report-editor-toggle-", ""));
      }
    }
    return ids;
  }
}
