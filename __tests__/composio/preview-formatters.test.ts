/**
 * Composio preview formatters — un test par formatter pour valider que
 * le draft retourné contient les params essentiels lisibles + footer
 * "confirmer / annuler".
 */

import { describe, it, expect } from "vitest";
import {
  formatGmailSendEmail,
  formatGmailReply,
  formatSlackSendMessage,
  formatNotionCreatePage,
  formatLinearCreateIssue,
  formatCalendarCreateEvent,
  formatHubspotCreateContact,
  formatHubspotUpdateDeal,
  formatStripeCreateInvoice,
  formatStripeRefund,
  formatAsanaCreateTask,
  formatTrelloCreateCard,
  formatAirtableCreateRecord,
  formatWhatsappSendMessage,
  getFormatterForAction,
  listRegisteredActions,
} from "@/lib/connectors/composio/preview-formatters";

describe("Gmail formatters", () => {
  it("formatGmailSendEmail surface to/subject/body avec preview cap 200", () => {
    const out = formatGmailSendEmail({
      to: "marie@example.com",
      subject: "Update Q2",
      body: "x".repeat(500),
      cc: "boss@example.com",
    });
    expect(out).toContain("GMAIL");
    expect(out).toContain("marie@example.com");
    expect(out).toContain("Update Q2");
    expect(out).toContain("Cc");
    expect(out).toContain("boss@example.com");
    expect(out).toContain("…"); // truncated
    expect(out).toMatch(/x{1,200}/);
    expect(out).not.toContain("x".repeat(300));
    expect(out.toLowerCase()).toContain("confirmer");
  });

  it("formatGmailReply surface thread + body preview", () => {
    const out = formatGmailReply({ thread_id: "t-123", body: "Bien noté !" });
    expect(out).toContain("t-123");
    expect(out).toContain("Bien noté");
    expect(out.toLowerCase()).toContain("confirmer");
  });
});

describe("Slack formatter", () => {
  it("formatSlackSendMessage prepends # to channel + preview text", () => {
    const out = formatSlackSendMessage({ channel: "dev", text: "Deploy done" });
    expect(out).toContain("#dev");
    expect(out).toContain("Deploy done");
    expect(out.toLowerCase()).toContain("confirmer");
  });

  it("garde @ pour les DMs", () => {
    const out = formatSlackSendMessage({ channel: "@adrien", text: "ping" });
    expect(out).toContain("@adrien");
  });
});

describe("Notion formatter", () => {
  it("formatNotionCreatePage surface title + parent + N blocks", () => {
    const out = formatNotionCreatePage({
      parent: { database_id: "db-abc" },
      title: "Note Q2",
      properties: { title: "Note Q2", priority: "high", owner: "adrien" },
      children: [{ type: "paragraph" }, { type: "heading_1" }],
    });
    expect(out).toContain("Note Q2");
    expect(out).toContain("db-abc");
    expect(out).toContain("2 bloc");
    expect(out.toLowerCase()).toContain("confirmer");
  });
});

describe("Linear formatter", () => {
  it("formatLinearCreateIssue surface team/title/priority FR", () => {
    const out = formatLinearCreateIssue({
      team_id: "team-eng",
      title: "Fix auth bug",
      description: "Race condition sur OAuth callback",
      priority: 1,
      labels: ["bug", "urgent"],
    });
    expect(out).toContain("team-eng");
    expect(out).toContain("Fix auth bug");
    expect(out).toContain("Race condition");
    expect(out).toContain("Urgente");
    expect(out).toContain("bug");
    expect(out).toContain("urgent");
  });
});

describe("Google Calendar formatter", () => {
  it("formatCalendarCreateEvent format date FR + attendees emails", () => {
    const out = formatCalendarCreateEvent({
      summary: "Sync hebdo",
      start: { dateTime: "2026-05-15T10:00:00+02:00" },
      end: { dateTime: "2026-05-15T11:00:00+02:00" },
      location: "Salle Atlas",
      attendees: [{ email: "adrien@hearst.io" }, { email: "marie@hearst.io" }],
    });
    expect(out).toContain("Sync hebdo");
    expect(out).toContain("Salle Atlas");
    expect(out).toContain("adrien@hearst.io");
    expect(out).toContain("marie@hearst.io");
    // Date FR should appear
    expect(out.toLowerCase()).toContain("mai");
  });

  it("accepte string ISO direct pour start/end", () => {
    const out = formatCalendarCreateEvent({
      summary: "Quick call",
      start: "2026-05-15T14:00:00Z",
      end: "2026-05-15T14:30:00Z",
      attendees: ["someone@example.com"],
    });
    expect(out).toContain("Quick call");
    expect(out).toContain("someone@example.com");
  });
});

describe("HubSpot formatters", () => {
  it("formatHubspotCreateContact surface nom + email + company", () => {
    const out = formatHubspotCreateContact({
      properties: {
        firstname: "Marie",
        lastname: "Dupont",
        email: "marie@acme.io",
        company: "Acme",
      },
    });
    expect(out).toContain("Marie Dupont");
    expect(out).toContain("marie@acme.io");
    expect(out).toContain("Acme");
  });

  it("formatHubspotUpdateDeal surface deal_id + stage + amount", () => {
    const out = formatHubspotUpdateDeal({
      deal_id: "deal-42",
      properties: { dealstage: "qualified", amount: 50000, closedate: "2026-06-01" },
    });
    expect(out).toContain("deal-42");
    expect(out).toContain("qualified");
    expect(out).toContain("50000");
    expect(out).toContain("2026-06-01");
  });
});

describe("Stripe formatters", () => {
  it("formatStripeCreateInvoice format montant + currency + warning", () => {
    const out = formatStripeCreateInvoice({
      customer: "cus_abc",
      amount: 12500, // cents
      currency: "eur",
      description: "Setup fee",
    });
    expect(out).toContain("cus_abc");
    expect(out).toContain("125.00 EUR");
    expect(out).toContain("Setup fee");
    expect(out.toUpperCase()).toContain("ATTENTION");
  });

  it("formatStripeRefund inclut warning irréversible", () => {
    const out = formatStripeRefund({
      charge: "ch_abc",
      amount: 5000,
      currency: "usd",
      reason: "duplicate",
    });
    expect(out).toContain("ch_abc");
    expect(out).toContain("50.00 USD");
    expect(out).toContain("duplicate");
    expect(out.toLowerCase()).toContain("irréversible");
  });
});

describe("Asana formatter", () => {
  it("formatAsanaCreateTask surface name + project + assignee + due", () => {
    const out = formatAsanaCreateTask({
      name: "Préparer démo board",
      project: "proj-42",
      assignee: "adrien",
      due_on: "2026-05-10",
      tags: ["demo", "board"],
    });
    expect(out).toContain("Préparer démo board");
    expect(out).toContain("proj-42");
    expect(out).toContain("adrien");
    expect(out).toContain("2026-05-10");
    expect(out).toContain("demo");
  });
});

describe("Trello formatter", () => {
  it("formatTrelloCreateCard surface name + list + members", () => {
    const out = formatTrelloCreateCard({
      name: "Fix CSS regression",
      idList: "list-abc",
      desc: "ContextRail border collapse",
      idMembers: ["mem-1", "mem-2"],
    });
    expect(out).toContain("Fix CSS regression");
    expect(out).toContain("list-abc");
    expect(out).toContain("ContextRail border collapse");
    expect(out).toContain("mem-1");
  });
});

describe("Airtable formatter", () => {
  it("formatAirtableCreateRecord surface base/table/fields count", () => {
    const out = formatAirtableCreateRecord({
      base_id: "appXYZ",
      table_id: "Leads",
      fields: { name: "Marie", email: "marie@x.io", status: "qualified" },
    });
    expect(out).toContain("appXYZ");
    expect(out).toContain("Leads");
    expect(out).toContain("3 champ");
    expect(out).toContain("name=");
  });
});

describe("WhatsApp formatter", () => {
  it("formatWhatsappSendMessage surface to + text preview", () => {
    const out = formatWhatsappSendMessage({
      to: "+33612345678",
      text: "Bonjour, votre commande est prête.",
    });
    expect(out).toContain("+33612345678");
    expect(out).toContain("commande");
    expect(out).toContain("WHATSAPP");
  });
});

describe("Registry — getFormatterForAction", () => {
  it("résout les noms canoniques exact", () => {
    expect(getFormatterForAction("GMAIL_SEND_EMAIL")).not.toBeNull();
    expect(getFormatterForAction("SLACK_SEND_MESSAGE")).not.toBeNull();
    expect(getFormatterForAction("NOTION_CREATE_PAGE")).not.toBeNull();
    expect(getFormatterForAction("LINEAR_CREATE_ISSUE")).not.toBeNull();
    expect(getFormatterForAction("STRIPE_CREATE_INVOICE")).not.toBeNull();
    expect(getFormatterForAction("WHATSAPP_SEND_MESSAGE")).not.toBeNull();
  });

  it("résout les variantes par fragments (APP + 2 segments)", () => {
    // Variante hypothétique : Composio change parfois la nomenclature
    expect(getFormatterForAction("HUBSPOT_CREATE_NEW_CONTACT")).not.toBeNull();
  });

  it("retourne null pour action inconnue", () => {
    expect(getFormatterForAction("UNKNOWN_DO_THING")).toBeNull();
    expect(getFormatterForAction("FIGMA_GET_FILE")).toBeNull();
  });

  it("registry contient au moins 10 actions canoniques distinctes", () => {
    const actions = listRegisteredActions();
    // 10+ apps couvertes (Gmail, Slack, Notion, Linear, Calendar,
    // HubSpot, Stripe, Asana, Trello, Airtable, WhatsApp)
    const apps = new Set(actions.map((a) => a.split("_")[0]));
    expect(apps.size).toBeGreaterThanOrEqual(10);
  });
});
