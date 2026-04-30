/**
 * @vitest-environment jsdom
 *
 * Tests — page admin /admin/metrics
 *
 * Stratégie : on mock fetch() pour simuler les réponses API,
 * puis on vérifie le rendu des KPIs et des badges circuit breaker.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import MetricsPage from "../../app/admin/metrics/page";
import type { MetricsSnapshot } from "@/lib/llm/metrics";
import type { CustomWebhook } from "@/lib/webhooks/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SNAPSHOT: MetricsSnapshot = {
  generatedAt: new Date().toISOString(),
  uptimeSeconds: 3600,
  providers: [
    {
      provider: "anthropic",
      totalCalls: 42,
      totalErrors: 2,
      errorRate: 0.0455,
      errorsByCode: { RATE_LIMIT_EXCEEDED: 2 },
      latency: { samples: 42, p50: 320, p95: 850, p99: 1200 },
      cost: { totalUsd: 0.1234, avgPerCallUsd: 0.0029 },
      tokens: {
        totalIn: 50000,
        totalOut: 12000,
        cacheReadTokens: 20000,
        cacheCreationTokens: 5000,
        cacheHitRate: 0.48,
      },
    },
    {
      provider: "openai",
      totalCalls: 10,
      totalErrors: 6,
      errorRate: 0.6,
      errorsByCode: { LLM_TIMEOUT: 6 },
      latency: { samples: 10, p50: 400, p95: 1100, p99: null },
      cost: { totalUsd: 0.05, avgPerCallUsd: 0.005 },
      tokens: {
        totalIn: 8000,
        totalOut: 2000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        cacheHitRate: null,
      },
    },
  ],
  counters: {
    circuitBreakerTrips: 3,
    rateLimitHits: 5,
    toolLoopsDetected: 1,
  },
};

const MOCK_WEBHOOKS: CustomWebhook[] = [
  {
    id: "wh-1",
    tenantId: "tenant-abc",
    name: "Slack prod",
    url: "https://hooks.slack.com/services/T00/B00/xxxxx",
    events: ["report.generated", "mission.completed"],
    active: true,
    createdAt: new Date().toISOString(),
    lastTriggeredAt: new Date(Date.now() - 120_000).toISOString(),
    lastStatus: "success",
  },
  {
    id: "wh-2",
    tenantId: "tenant-abc",
    name: "PagerDuty",
    url: "https://events.pagerduty.com/v2/enqueue",
    events: ["mission.failed"],
    active: true,
    createdAt: new Date().toISOString(),
    lastTriggeredAt: new Date(Date.now() - 3600_000).toISOString(),
    lastStatus: "failed",
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function mockFetch(snapshot: MetricsSnapshot, webhooks: CustomWebhook[]) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes("llm-metrics")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(snapshot),
      });
    }
    if (String(url).includes("webhooks-status")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ webhooks }),
      });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MetricsPage — rendu sans crash", () => {
  it("affiche l'état de chargement puis le contenu", async () => {
    mockFetch(MOCK_SNAPSHOT, MOCK_WEBHOOKS);

    await act(async () => {
      render(<MetricsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Métriques système")).toBeTruthy();
    });
  });
});

describe("MetricsPage — KPIs LLM", () => {
  it("affiche le cache hit rate du provider anthropic", async () => {
    mockFetch(MOCK_SNAPSHOT, MOCK_WEBHOOKS);

    await act(async () => {
      render(<MetricsPage />);
    });

    await waitFor(() => {
      // 0.48 → "48.0 %" (apparaît dans la KPI + tableau coûts)
      const hits = screen.getAllByText("48.0 %");
      expect(hits.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("affiche le coût total cumulé", async () => {
    mockFetch(MOCK_SNAPSHOT, MOCK_WEBHOOKS);

    await act(async () => {
      render(<MetricsPage />);
    });

    await waitFor(() => {
      // 0.1234 + 0.05 = 0.1734
      expect(screen.getByText("$0.1734")).toBeTruthy();
    });
  });

  it("affiche les compteurs circuit breaker, rate limit, tool loops", async () => {
    mockFetch(MOCK_SNAPSHOT, MOCK_WEBHOOKS);

    await act(async () => {
      render(<MetricsPage />);
    });

    await waitFor(() => {
      // trips = 3, rate limit = 5, tool loops = 1 — chaque compteur a son propre KpiCard
      expect(screen.getByText("3")).toBeTruthy();
      expect(screen.getByText("5")).toBeTruthy();
      expect(screen.getByText("1")).toBeTruthy();
    });
  });
});

describe("MetricsPage — badges circuit breaker", () => {
  it("affiche CLOSED pour anthropic (errorRate 4.5 %)", async () => {
    mockFetch(MOCK_SNAPSHOT, MOCK_WEBHOOKS);

    await act(async () => {
      render(<MetricsPage />);
    });

    await waitFor(() => {
      const badges = screen.getAllByText("CLOSED");
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("affiche OPEN pour openai (errorRate 60 %)", async () => {
    mockFetch(MOCK_SNAPSHOT, MOCK_WEBHOOKS);

    await act(async () => {
      render(<MetricsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("OPEN")).toBeTruthy();
    });
  });
});

describe("MetricsPage — tableau webhooks", () => {
  it("affiche les noms de webhooks", async () => {
    mockFetch(MOCK_SNAPSHOT, MOCK_WEBHOOKS);

    await act(async () => {
      render(<MetricsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Slack prod")).toBeTruthy();
      expect(screen.getByText("PagerDuty")).toBeTruthy();
    });
  });

  it("badge success vert pour Slack prod", async () => {
    mockFetch(MOCK_SNAPSHOT, MOCK_WEBHOOKS);

    await act(async () => {
      render(<MetricsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("success")).toBeTruthy();
    });
  });

  it("badge failed rouge pour PagerDuty", async () => {
    mockFetch(MOCK_SNAPSHOT, MOCK_WEBHOOKS);

    await act(async () => {
      render(<MetricsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("failed")).toBeTruthy();
    });
  });
});

describe("MetricsPage — état erreur", () => {
  it("affiche un message d'erreur si l'API renvoie 401", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "unauthorized" }),
    });

    await act(async () => {
      render(<MetricsPage />);
    });

    await waitFor(() => {
      const el = document.querySelector(".text-danger");
      expect(el).toBeTruthy();
    });
  });
});
