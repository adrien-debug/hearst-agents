/**
 * NotificationsPage — Page Object Playwright pour la cloche de notification
 * et la page /notifications.
 *
 * Encapsule les locators et actions fréquentes pour éviter la duplication
 * dans les specs. Suit le même pattern que ReportPage.ts.
 */

import type { Page, Locator } from "@playwright/test";

export class NotificationsPage {
  readonly page: Page;

  // ── Cloche dans le header ──────────────────────────────────────────────
  /** Bouton cloche (aria-label "Notifications…") */
  readonly bellButton: Locator;

  /** Badge de compteur non-lu (aria-hidden, positionné sur la cloche) */
  readonly unreadBadge: Locator;

  // ── Dropdown ──────────────────────────────────────────────────────────
  /** Conteneur dialog dropdown ouvert */
  readonly dropdown: Locator;

  /** Bouton "Tout marquer lu" dans le dropdown */
  readonly markAllReadBtn: Locator;

  /** État vide "Aucune notification" */
  readonly emptyState: Locator;

  /** Toutes les lignes de notification dans le dropdown */
  readonly notifRows: Locator;

  // ── Page /notifications ────────────────────────────────────────────────
  /** Lien "Voir toutes les notifications →" dans le footer dropdown */
  readonly viewAllLink: Locator;

  constructor(page: Page) {
    this.page = page;

    this.bellButton   = page.getByRole("button", { name: /notifications/i });
    this.unreadBadge  = page.locator('[aria-label*="non lues"]').or(
      // Fallback : le span badge aria-hidden positionné sur la cloche
      page.locator('button[aria-label*="Notifications"] span[aria-hidden]'),
    );
    this.dropdown     = page.getByRole("dialog", { name: "Notifications" });
    this.markAllReadBtn = page.getByRole("button", { name: /tout marquer lu/i });
    this.emptyState   = page.getByText(/aucune notification/i);
    this.notifRows    = this.dropdown.getByRole("button").filter({ hasNot: page.getByRole("button", { name: /tout marquer lu/i }) });
    this.viewAllLink  = page.getByRole("link", { name: /voir toutes les notifications/i });
  }

  // ── Actions ────────────────────────────────────────────────────────────

  /** Navigue vers la racine de l'app (là où la cloche est affichée). */
  async goto() {
    await this.page.goto("/");
  }

  /** Navigue vers la page /notifications dédiée. */
  async gotoNotificationsPage() {
    await this.page.goto("/notifications");
  }

  /** Ouvre le dropdown en cliquant la cloche. */
  async openDropdown(timeout = 5000) {
    await this.bellButton.waitFor({ state: "visible", timeout });
    await this.bellButton.click();
    await this.dropdown.waitFor({ state: "visible", timeout });
  }

  /** Ferme le dropdown avec Escape. */
  async closeDropdown() {
    await this.page.keyboard.press("Escape");
  }

  /**
   * Retourne le compte non-lu tel qu'affiché dans le badge.
   * Retourne 0 si le badge n'est pas visible.
   */
  async getUnreadBadgeCount(): Promise<number> {
    const btn = this.bellButton;
    const label = await btn.getAttribute("aria-label").catch(() => null);
    if (!label) return 0;
    const match = label.match(/\((\d+)\s+non lues?\)/);
    if (match) return parseInt(match[1], 10);
    return 0;
  }
}
