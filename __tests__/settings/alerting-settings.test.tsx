/**
 * @vitest-environment jsdom
 *
 * Tests unitaires — AlertingSettings component.
 *
 * On mock fetch globalement pour éviter tout appel réseau.
 * Les tests couvrent : render, ajout webhook, suppression, test signal, save.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AlertingSettings } from "@/app/(user)/components/settings/AlertingSettings";
import type { AlertingPreferences } from "@/lib/notifications/schema";

// ── Setup ─────────────────────────────────────────────────────────────────────

const DEFAULT_PREFS: AlertingPreferences = {
  webhooks: [],
};

const PREFS_WITH_WEBHOOK: AlertingPreferences = {
  webhooks: [{ url: "https://hook.example.com/test", signalTypes: ["*"] }],
  slack: { webhookUrl: "https://hooks.slack.com/services/T/B/x", signalTypes: ["*"] },
};

function mockFetch(prefsOverride?: AlertingPreferences) {
  const prefs = prefsOverride ?? DEFAULT_PREFS;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url !== "string") throw new Error("bad url type");

      // GET /api/settings/alerting
      if (!init?.method || init.method === "GET") {
        return {
          ok: true,
          json: async () => ({ prefs }),
        };
      }

      // PUT /api/settings/alerting
      if (init.method === "PUT") {
        const body = JSON.parse(init.body as string) as AlertingPreferences;
        return {
          ok: true,
          json: async () => ({ ok: true, prefs: body }),
        };
      }

      // POST /api/settings/alerting/test
      if (url.includes("/test") && init.method === "POST") {
        return {
          ok: true,
          json: async () => ({ ok: true, result: {} }),
        };
      }

      return { ok: false, json: async () => ({}) };
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AlertingSettings — rendu", () => {
  it("affiche le loader pendant le chargement puis le titre", async () => {
    mockFetch();
    render(<AlertingSettings />);

    // Loader visible initialement
    expect(screen.getByText(/chargement des préférences/i)).toBeTruthy();

    // Puis le titre principal
    await waitFor(() => {
      expect(screen.getByText("Alerting")).toBeTruthy();
    });
  });

  it("affiche les sections Webhooks, Email, Slack, Signal Types", async () => {
    mockFetch();
    render(<AlertingSettings />);

    await waitFor(() => {
      expect(screen.getByText("Alerting")).toBeTruthy();
    });

    // Sections (en majuscules via CSS mais text content brut)
    expect(screen.getByText("Webhooks")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByText("Slack")).toBeTruthy();
    expect(screen.getByText(/types de signaux/i)).toBeTruthy();
  });

  it("affiche un webhook existant avec URL + boutons Tester / Supprimer", async () => {
    mockFetch(PREFS_WITH_WEBHOOK);
    render(<AlertingSettings />);

    await waitFor(() => {
      expect(screen.getByText("https://hook.example.com/test")).toBeTruthy();
    });

    const testBtns = screen.getAllByText("Tester");
    expect(testBtns.length).toBeGreaterThan(0);
    expect(screen.getByText("Supprimer")).toBeTruthy();
  });
});

describe("AlertingSettings — ajout webhook", () => {
  it("affiche le formulaire après clic sur Ajouter un webhook", async () => {
    mockFetch();
    render(<AlertingSettings />);

    await waitFor(() => screen.getByText("Alerting"));

    const addBtn = screen.getByText("+ Ajouter un webhook");
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/https:\/\/hook\.example/i)).toBeTruthy();
    });
  });

  it("ajoute un webhook valide et masque le formulaire", async () => {
    mockFetch();
    render(<AlertingSettings />);

    await waitFor(() => screen.getByText("Alerting"));

    fireEvent.click(screen.getByText("+ Ajouter un webhook"));

    await waitFor(() => screen.getByPlaceholderText(/https:\/\/hook\.example/i));

    const urlInput = screen.getByPlaceholderText(/https:\/\/hook\.example/i);
    fireEvent.change(urlInput, { target: { value: "https://hook.example.com/new" } });

    const ajouterBtn = screen.getByText("Ajouter");
    fireEvent.click(ajouterBtn);

    await waitFor(() => {
      expect(screen.getByText("https://hook.example.com/new")).toBeTruthy();
    });
  });

  it("annule l'ajout via Annuler", async () => {
    mockFetch();
    render(<AlertingSettings />);

    await waitFor(() => screen.getByText("Alerting"));

    fireEvent.click(screen.getByText("+ Ajouter un webhook"));
    await waitFor(() => screen.getByText("Annuler"));
    fireEvent.click(screen.getByText("Annuler"));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/https:\/\/hook\.example/i)).toBeNull();
    });
  });
});

describe("AlertingSettings — suppression webhook", () => {
  it("supprime le webhook de la liste", async () => {
    mockFetch(PREFS_WITH_WEBHOOK);
    render(<AlertingSettings />);

    await waitFor(() => screen.getByText("https://hook.example.com/test"));

    fireEvent.click(screen.getByText("Supprimer"));

    await waitFor(() => {
      expect(screen.queryByText("https://hook.example.com/test")).toBeNull();
    });
  });
});

describe("AlertingSettings — test signal", () => {
  it("appelle l'endpoint test et affiche Connecté", async () => {
    mockFetch(PREFS_WITH_WEBHOOK);
    render(<AlertingSettings />);

    await waitFor(() => screen.getByText("https://hook.example.com/test"));

    // Le premier bouton Tester correspond au webhook (avant le Slack)
    const testBtns = screen.getAllByText("Tester");
    fireEvent.click(testBtns[0]);

    await waitFor(() => {
      expect(screen.getByText("Connecté")).toBeTruthy();
    });
  });
});

describe("AlertingSettings — sauvegarde", () => {
  it("clique sur Enregistrer → appelle PUT et affiche Enregistré", async () => {
    mockFetch();
    render(<AlertingSettings />);

    await waitFor(() => screen.getByText("Alerting"));

    fireEvent.click(screen.getByText("Enregistrer"));

    await waitFor(() => {
      expect(screen.getByText("Enregistré")).toBeTruthy();
    });
  });

  it("affiche Erreur si le PUT échoue", async () => {
    mockFetch();
    // Override PUT pour échouer
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.method || init.method === "GET") {
          return { ok: true, json: async () => ({ prefs: DEFAULT_PREFS }) };
        }
        if (init.method === "PUT") {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "Erreur serveur" }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );

    render(<AlertingSettings />);
    await waitFor(() => screen.getByText("Alerting"));

    fireEvent.click(screen.getByText("Enregistrer"));

    await waitFor(() => {
      expect(screen.getByText(/erreur serveur/i)).toBeTruthy();
    });
  });
});
