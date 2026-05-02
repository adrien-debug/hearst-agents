/**
 * Market data — données crypto + marchés traditionnels en temps réel.
 *
 * Branche deux capabilities natives à la pipeline IA :
 *   - get_crypto_prices : CoinGecko free /simple/price (no key)
 *   - get_stock_quotes  : Yahoo Finance v8 chart endpoint (no key)
 *
 * Comble le trou "fetch crypto / TradFi" pour les missions récurrentes type
 * « tous les matins, donne-moi les marchés ». Pas de provider abstraction
 * dédiée pour l'instant — un seul appel HTTP par tool, format texte simple
 * pour le LLM. Si on ajoute d'autres providers (Polygon, Alpha Vantage),
 * extraire dans lib/capabilities/providers/.
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiToolMap = Record<string, Tool<any, any>>;

const HTTP_TIMEOUT_MS = 8000;

async function fetchJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Hearst-OS/1.0" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Crypto (CoinGecko) ─────────────────────────────────────────

interface CryptoArgs {
  coins?: string[];
  vs_currency?: string;
}

type CoinGeckoEntry = Record<string, number | undefined>;
type CoinGeckoResponse = Record<string, CoinGeckoEntry>;

const DEFAULT_COINS = ["bitcoin", "ethereum", "solana"];

function formatCryptoPrices(data: CoinGeckoResponse, vs: string): string {
  const lines: string[] = [];
  lines.push(`Prix crypto (vs ${vs.toUpperCase()}) :`);
  for (const [coin, payload] of Object.entries(data)) {
    const price = payload[vs];
    const change = payload[`${vs}_24h_change`];
    if (typeof price !== "number") continue;
    const priceStr = price >= 1 ? price.toLocaleString("en-US", { maximumFractionDigits: 2 }) : price.toFixed(6);
    const changeStr = typeof change === "number" ? ` (${change >= 0 ? "+" : ""}${change.toFixed(2)}% sur 24h)` : "";
    lines.push(`- ${coin} : ${priceStr} ${vs.toUpperCase()}${changeStr}`);
  }
  return lines.join("\n");
}

// ── TradFi (Yahoo Finance) ─────────────────────────────────────

interface StockArgs {
  symbols: string[];
}

interface YahooChartResult {
  chart: {
    result?: Array<{
      meta: {
        symbol: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        currency?: string;
        exchangeName?: string;
        longName?: string;
        shortName?: string;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

interface QuoteSnapshot {
  symbol: string;
  name?: string;
  price: number;
  previousClose: number;
  changePct: number;
  currency: string;
}

async function fetchYahooQuote(symbol: string): Promise<QuoteSnapshot | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  const data = await fetchJson<YahooChartResult>(url);
  const r = data.chart.result?.[0];
  if (!r) return null;
  const meta = r.meta;
  const price = meta.regularMarketPrice;
  const prev = meta.previousClose ?? meta.chartPreviousClose;
  if (typeof price !== "number" || typeof prev !== "number" || prev === 0) return null;
  return {
    symbol: meta.symbol,
    name: meta.longName ?? meta.shortName,
    price,
    previousClose: prev,
    changePct: ((price - prev) / prev) * 100,
    currency: meta.currency ?? "USD",
  };
}

function formatStockQuotes(quotes: Array<QuoteSnapshot | { symbol: string; error: string }>): string {
  const lines: string[] = [];
  lines.push("Cotations marchés traditionnels :");
  for (const q of quotes) {
    if ("error" in q) {
      lines.push(`- ${q.symbol} : indisponible (${q.error})`);
      continue;
    }
    const priceStr = q.price.toLocaleString("en-US", { maximumFractionDigits: 2 });
    const changeStr = `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`;
    const label = q.name ? `${q.symbol} (${q.name})` : q.symbol;
    lines.push(`- ${label} : ${priceStr} ${q.currency} (${changeStr} vs clôture précédente)`);
  }
  return lines.join("\n");
}

export function buildMarketDataTools(): AiToolMap {
  const cryptoTool: Tool<CryptoArgs, string> = {
    description:
      "Récupère les prix crypto en temps réel via CoinGecko. Retourne prix actuel + variation 24h pour chaque coin demandé. Aucune clé API requise. Use this dès que le user demande des prix crypto, un récap marché crypto, ou inclut crypto dans une mission récurrente.",
    inputSchema: jsonSchema<CryptoArgs>({
      type: "object",
      properties: {
        coins: {
          type: "array",
          items: { type: "string" },
          description: "IDs CoinGecko en minuscules (ex: 'bitcoin', 'ethereum', 'solana', 'ripple', 'cardano'). Défaut : bitcoin + ethereum + solana.",
        },
        vs_currency: {
          type: "string",
          description: "Devise de référence (ex: 'usd', 'eur'). Défaut : 'usd'.",
        },
      },
    }),
    execute: async (args) => {
      const coins = args.coins && args.coins.length > 0 ? args.coins : DEFAULT_COINS;
      const vs = (args.vs_currency ?? "usd").toLowerCase();
      const ids = coins.map((c) => c.toLowerCase().trim()).join(",");
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true`;
      try {
        const data = await fetchJson<CoinGeckoResponse>(url);
        if (Object.keys(data).length === 0) {
          return `Aucun coin trouvé pour : ${ids}. Vérifie les IDs (ex: 'bitcoin' pas 'btc').`;
        }
        return formatCryptoPrices(data, vs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Échec de récupération des prix crypto : ${msg}`;
      }
    },
  };

  const stockTool: Tool<StockArgs, string> = {
    description:
      "Récupère les cotations boursières (actions, indices, ETF, devises, matières premières) via Yahoo Finance. Retourne prix actuel + variation vs clôture précédente. Aucune clé API requise. Use this dès que le user demande des cours bourse, indices (S&P, CAC, Dow), ETF, ou inclut marchés traditionnels dans une mission récurrente. Indices Yahoo : ^GSPC (S&P 500), ^DJI (Dow), ^IXIC (Nasdaq), ^FCHI (CAC 40), ^STOXX50E (EuroStoxx). Devises : EURUSD=X, GBPUSD=X. Or : GC=F. Pétrole : CL=F.",
    inputSchema: jsonSchema<StockArgs>({
      type: "object",
      required: ["symbols"],
      properties: {
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "Tickers Yahoo Finance (ex: 'AAPL', 'MSFT', '^GSPC', '^FCHI', 'EURUSD=X', 'GC=F'). Au moins 1 requis.",
        },
      },
    }),
    execute: async (args) => {
      if (!args.symbols || args.symbols.length === 0) {
        return "Aucun ticker fourni. Exemple : ['^GSPC', 'AAPL', 'EURUSD=X'].";
      }
      const results = await Promise.all(
        args.symbols.slice(0, 20).map(async (sym) => {
          try {
            const quote = await fetchYahooQuote(sym);
            if (!quote) return { symbol: sym, error: "ticker introuvable" };
            return quote;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { symbol: sym, error: msg };
          }
        }),
      );
      return formatStockQuotes(results);
    },
  };

  return {
    get_crypto_prices: cryptoTool,
    get_stock_quotes: stockTool,
  };
}
