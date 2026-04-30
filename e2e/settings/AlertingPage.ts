/**
 * AlertingPage — Page Object Playwright pour /settings/alerting.
 *
 * Encapsule les locators et actions fréquentes.
 * Suit le même pattern que ReportPage.ts.
 */

import type { Page, Locator } from "@playwright/test";

export class AlertingPage {
  readonly page: Page;

  // ── En-tête ────────────────────────────────────────────────────────────
  readonly heading: Locator;
  readonly saveBtn: Locator;
  readonly saveConfirmation: Locator;
  readonly saveError: Locator;

  // ── Webhooks ───────────────────────────────────────────────────────────
  readonly addWebhookBtn: Locator;
  /** Formulaire d'ajout webhook (visible après clic + Ajouter) */
  readonly newWebhookForm: Locator;
  readonly webhookUrlInput: Locator;
  readonly webhookAddConfirmBtn: Locator;
  readonly webhookCancelBtn: Locator;
  /** Toutes les cartes webhook affichées dans la liste */
  readonly webhookCards: Locator;

  // ── Email ──────────────────────────────────────────────────────────────
  readonly emailToggle: Locator;
  readonly emailRecipientsInput: Locator;
  readonly emailTestBtn: Locator;

  // ── Slack ──────────────────────────────────────────────────────────────
  readonly slackToggle: Locator;
  readonly slackUrlInput: Locator;
  readonly slackTestBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading         = page.getByRole("heading", { name: /alerting/i });
    this.saveBtn         = page.getByRole("button", { name: /enregistrer/i });
    this.saveConfirmation = page.getByText(/enregistré/i);
    this.saveError       = page.locator("span").filter({ hasText: /erreur/i });

    // Webhooks
    this.addWebhookBtn       = page.getByRole("button", { name: /\+ ajouter un webhook/i });
    this.newWebhookForm      = page.locator("input[type='url']").first();
    this.webhookUrlInput     = page.locator("input[placeholder*='https://hook']");
    this.webhookAddConfirmBtn = page.getByRole("button", { name: /^ajouter$/i });
    this.webhookCancelBtn    = page.getByRole("button", { name: /annuler/i });
    this.webhookCards        = page.locator('[class*="flex"][class*="items-center"][class*="justify-between"]')
      .filter({ has: page.getByRole("button", { name: /tester/i }) });

    // Email
    this.emailToggle         = page.getByRole("switch", { name: /activer les alertes email/i });
    this.emailRecipientsInput = page.locator("input[placeholder*='alice@example']");
    this.emailTestBtn        = page.getByRole("button", { name: /tester l.envoi/i });

    // Slack
    this.slackToggle         = page.getByRole("switch", { name: /activer les alertes slack/i });
    this.slackUrlInput       = page.locator("input[placeholder*='hooks.slack.com']");
    this.slackTestBtn        = page.getByRole("button", { name: /tester la connexion/i });
  }

  // ── Actions ────────────────────────────────────────────────────────────

  /** Navigue vers /settings/alerting. */
  async goto() {
    await this.page.goto("/settings/alerting");
  }

  /** Attend que la page soit chargée (heading visible + pas de spinner). */
  async waitForLoaded(timeout = 8000) {
    await this.heading.waitFor({ state: "visible", timeout });
    // Attendre la disparition du spinner "Chargement des préférences…"
    await this.page.waitForFunction(
      () => !document.body.textContent?.includes("Chargement des préférences…"),
      { timeout },
    );
  }

  /**
   * Ouvre le formulaire et ajoute un webhook avec l'URL donnée.
   * Ne sauvegarde PAS (il faut appeler saveBtn.click() séparément).
   */
  async addWebhook(url: string) {
    await this.addWebhookBtn.click();
    await this.webhookUrlInput.waitFor({ state: "visible", timeout: 3000 });
    await this.webhookUrlInput.fill(url);
    await this.webhookAddConfirmBtn.click();
  }

  /**
   * Active le toggle email et retourne vrai si l'état a changé.
   */
  async enableEmailToggle() {
    const checked = await this.emailToggle.getAttribute("aria-checked");
    if (checked !== "true") {
      await this.emailToggle.click();
    }
  }

  /** Active le toggle Slack. */
  async enableSlackToggle() {
    const checked = await this.slackToggle.getAttribute("aria-checked");
    if (checked !== "true") {
      await this.slackToggle.click();
    }
  }
}
