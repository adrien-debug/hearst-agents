/**
 * Finance Agent — Specialized agent for financial operations
 *
 * Architecture Finale alignment: lib/agents/specialized/finance.ts
 * Domain: Stripe, QuickBooks, Xero, Plaid, Wise...
 * Current: Stripe implementation (Phase B)
 */

import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { StepActor } from "@/lib/engine/runtime/engine/types";
import { routeConnectorRequest } from "@/lib/connectors/router";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ───────────────────────────────────────────────────────

export interface StripeAgentInput {
  operation: "list_payments" | "get_payment" | "list_invoices" | "get_invoice" | "list_subscriptions" | "get_subscription" | "get_balance" | "list_customers" | "summarize";
  params?: {
    id?: string;
    limit?: number;
    status?: string;
    customerEmail?: string;
    startDate?: string;
    endDate?: string;
  };
}

export interface StripeAgentOutput {
  success: boolean;
  data?: unknown;
  summary?: string;
  error?: string;
  operation: string;
  meta: {
    latencyMs: number;
    source: "stripe-pack" | "cache" | "none";
    recordCount?: number;
  };
}

export interface PaymentSummary {
  totalAmount: number;
  currency: string;
  count: number;
  successfulCount: number;
  failedCount: number;
  refundedCount: number;
}

export interface InvoiceSummary {
  totalAmount: number;
  currency: string;
  count: number;
  paidCount: number;
  openCount: number;
  overdueCount: number;
}

export interface SubscriptionMetrics {
  totalActive: number;
  totalCanceled: number;
  mrrEstimate: number;
  currency: string;
}

// ── Service ──────────────────────────────────────────────────────

interface RouterContext { db: SupabaseClient; tenantId: string; userId: string; }

export async function executeStripeAgent(input: StripeAgentInput, context: RouterContext): Promise<StripeAgentOutput> {
  const start = Date.now();
  try {
    switch (input.operation) {
      case "list_payments": return await listPayments(input, context, start);
      case "get_payment": return await getPayment(input, context, start);
      case "list_invoices": return await listInvoices(input, context, start);
      case "get_invoice": return await getInvoice(input, context, start);
      case "list_subscriptions": return await listSubscriptions(input, context, start);
      case "get_subscription": return await getSubscription(input, context, start);
      case "get_balance": return await getBalance(context, start);
      case "list_customers": return await listCustomers(input, context, start);
      case "summarize": return await summarizeFinance(context, start);
      default: return { success: false, error: `Unknown: ${input.operation}`, operation: input.operation, meta: { latencyMs: Date.now() - start, source: "none" } };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), operation: input.operation, meta: { latencyMs: Date.now() - start, source: "none" } };
  }
}

async function listPayments(input: StripeAgentInput, ctx: RouterContext, t: number): Promise<StripeAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; amount: number; currency: string; status: string; customerEmail?: string; createdAt: string }>>("stripe", "list", { resource: "payments", limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_payments", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_payments", meta: { latencyMs: Date.now() - t, source: "stripe-pack", recordCount: r.data?.length } };
}

async function getPayment(input: StripeAgentInput, ctx: RouterContext, t: number): Promise<StripeAgentOutput> {
  if (!input.params?.id) return { success: false, error: "ID required", operation: "get_payment", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; amount: number; currency: string; status: string }>("stripe", "get", { resource: "charge", id: input.params.id }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_payment", meta: { latencyMs: Date.now() - t, source: r.success ? "stripe-pack" : "none" } };
}

async function listInvoices(input: StripeAgentInput, ctx: RouterContext, t: number): Promise<StripeAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; amount: number; currency: string; status: string }>>("stripe", "list", { resource: "invoices", limit: input.params?.limit ?? 10, status: input.params?.status }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_invoices", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_invoices", meta: { latencyMs: Date.now() - t, source: "stripe-pack", recordCount: r.data?.length } };
}

async function getInvoice(input: StripeAgentInput, ctx: RouterContext, t: number): Promise<StripeAgentOutput> {
  if (!input.params?.id) return { success: false, error: "ID required", operation: "get_invoice", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; amount: number; currency: string; status: string }>("stripe", "get", { resource: "invoice", id: input.params.id }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_invoice", meta: { latencyMs: Date.now() - t, source: r.success ? "stripe-pack" : "none" } };
}

async function listSubscriptions(input: StripeAgentInput, ctx: RouterContext, t: number): Promise<StripeAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; status: string; planAmount: number; currency: string }>>("stripe", "list", { resource: "subscriptions", limit: input.params?.limit ?? 10, status: input.params?.status }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_subscriptions", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_subscriptions", meta: { latencyMs: Date.now() - t, source: "stripe-pack", recordCount: r.data?.length } };
}

async function getSubscription(input: StripeAgentInput, ctx: RouterContext, t: number): Promise<StripeAgentOutput> {
  if (!input.params?.id) return { success: false, error: "ID required", operation: "get_subscription", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; status: string; planAmount: number; currency: string }>("stripe", "get", { resource: "subscription", id: input.params.id }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_subscription", meta: { latencyMs: Date.now() - t, source: r.success ? "stripe-pack" : "none" } };
}

async function getBalance(ctx: RouterContext, t: number): Promise<StripeAgentOutput> {
  const r = await routeConnectorRequest<{ available: Array<{ amount: number; currency: string }> }>("stripe", "list", { resource: "balance" }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_balance", meta: { latencyMs: Date.now() - t, source: r.success ? "stripe-pack" : "none" } };
}

async function listCustomers(input: StripeAgentInput, ctx: RouterContext, t: number): Promise<StripeAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; email: string; name?: string }>>("stripe", "list", { resource: "customers", limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_customers", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_customers", meta: { latencyMs: Date.now() - t, source: "stripe-pack", recordCount: r.data?.length } };
}

async function summarizeFinance(ctx: RouterContext, t: number): Promise<StripeAgentOutput> {
  const [pR, iR, sR] = await Promise.all([
    routeConnectorRequest<Array<{ id: string; amount: number; currency: string; status: string }>>("stripe", "list", { resource: "payments", limit: 100 }, ctx),
    routeConnectorRequest<Array<{ id: string; amount: number; currency: string; status: string }>>("stripe", "list", { resource: "invoices", limit: 100 }, ctx),
    routeConnectorRequest<Array<{ id: string; status: string; planAmount: number; currency: string }>>("stripe", "list", { resource: "subscriptions", limit: 100 }, ctx),
  ]);
  const payments = pR.success ? pR.data || [] : [];
  const invoices = iR.success ? iR.data || [] : [];
  const subs = sR.success ? sR.data || [] : [];
  const ps: PaymentSummary = { totalAmount: payments.reduce((s, p) => s + p.amount, 0), currency: payments[0]?.currency || "usd", count: payments.length, successfulCount: payments.filter(p => p.status === "succeeded").length, failedCount: payments.filter(p => p.status === "failed").length, refundedCount: payments.filter(p => p.status === "refunded").length };
  const is: InvoiceSummary = { totalAmount: invoices.reduce((s, i) => s + i.amount, 0), currency: invoices[0]?.currency || "usd", count: invoices.length, paidCount: invoices.filter(i => i.status === "paid").length, openCount: invoices.filter(i => i.status === "open").length, overdueCount: invoices.filter(i => i.status === "uncollectible").length };
  const sm: SubscriptionMetrics = { totalActive: subs.filter(s => s.status === "active").length, totalCanceled: subs.filter(s => s.status === "canceled").length, mrrEstimate: subs.filter(s => s.status === "active").reduce((sum, s) => sum + s.planAmount, 0), currency: subs[0]?.currency || "usd" };
  const summary = `## Résumé Financier Stripe\n\n### Paiements\n- **Total**: ${(ps.totalAmount / 100).toFixed(2)} ${ps.currency.toUpperCase()}\n- **Transactions**: ${ps.count} (${ps.successfulCount} réussies, ${ps.failedCount} échouées, ${ps.refundedCount} remboursées)\n\n### Factures\n- **Montant total**: ${(is.totalAmount / 100).toFixed(2)} ${is.currency.toUpperCase()}\n- **Statut**: ${is.paidCount} payées, ${is.openCount} ouvertes, ${is.overdueCount} en retard\n\n### Abonnements\n- **Actifs**: ${sm.totalActive}\n- **Annulés**: ${sm.totalCanceled}\n- **MRR estimé**: ${(sm.mrrEstimate / 100).toFixed(2)} ${sm.currency.toUpperCase()}`;
  return { success: true, data: { payments: ps, invoices: is, subscriptions: sm }, summary, operation: "summarize", meta: { latencyMs: Date.now() - t, source: "stripe-pack", recordCount: payments.length + invoices.length + subs.length } };
}

// ── Runtime Wrapper ─────────────────────────────────────────────

export async function executeStripeAgentInRuntime(
  engine: RunEngine,
  task: string,
): Promise<StripeAgentOutput> {
  const step = await engine.steps.create({
    run_id: engine.id,
    parent_step_id: null,
    type: "delegate",
    actor: "FinanceAgent" as StepActor,
    title: `Stripe: ${task.slice(0, 100)}`,
    input: { task },
  });

  await engine.steps.transition(step.id, "running");
  engine.events.emit({
    type: "step_started",
    run_id: engine.id,
    step_id: step.id,
    agent: "FinanceAgent" as StepActor,
    title: `Stripe: ${task.slice(0, 100)}`,
  });

  try {
    const input = parseTaskToStripeInput(task);
    const context = {
      db: engine.db,
      tenantId: engine.userId?.split("@")[1] || "default",
      userId: engine.userId || "system",
    };

    const result = await executeStripeAgent(input, context);

    if (result.success) {
      await engine.steps.complete(step.id, { output: result as unknown as Record<string, unknown> });
      engine.events.emit({
        type: "step_completed",
        run_id: engine.id,
        step_id: step.id,
        agent: "FinanceAgent" as StepActor,
      });

      if (result.summary) {
        engine.events.emit({
          type: "text_delta",
          run_id: engine.id,
          delta: result.summary,
        });
      }
    } else {
      await engine.steps.fail(step.id, {
        code: "STRIPE_ERROR",
        message: result.error || "Unknown Stripe error",
        retryable: false,
      });
      engine.events.emit({
        type: "step_failed",
        run_id: engine.id,
        step_id: step.id,
        error: result.error || "Unknown",
      });
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[FinanceAgent] Fatal error on task "${task}":`, error);
    await engine.steps.fail(step.id, { code: "AGENT_FATAL", message: error, retryable: false });
    engine.events.emit({ type: "step_failed", run_id: engine.id, step_id: step.id, error });
    return {
      success: false,
      error,
      operation: "unknown",
      meta: { latencyMs: 0, source: "none" },
    };
  }
}

function parseTaskToStripeInput(task: string): StripeAgentInput {
  const t = task.toLowerCase();
  if (t.includes("résumé") || t.includes("summary") || t.includes("synthèse") || t.includes("overview")) {
    return { operation: "summarize" };
  }
  if (t.includes("balance") || t.includes("solde")) {
    return { operation: "get_balance" };
  }
  if (t.includes("customer") || t.includes("client")) {
    return { operation: "list_customers", params: { limit: 10 } };
  }
  if (t.includes("subscription") || t.includes("abonnement")) {
    const status = t.includes("actif") || t.includes("active") ? "active" : undefined;
    return { operation: "list_subscriptions", params: { limit: 10, status } };
  }
  if (t.includes("invoice") || t.includes("facture")) {
    const status = t.includes("impayée") || t.includes("open") ? "open" : t.includes("payée") || t.includes("paid") ? "paid" : undefined;
    return { operation: "list_invoices", params: { limit: 10, status } };
  }
  if (t.includes("payment") || t.includes("paiement") || t.includes("transaction")) {
    return { operation: "list_payments", params: { limit: 10 } };
  }
  return { operation: "summarize" };
}

// ── Task Detection ─────────────────────────────────────────────

export function isStripeTask(task: string): boolean {
  const t = task.toLowerCase();
  const keywords = ["stripe", "paiement", "payment", "facture", "invoice", "abonnement", "subscription", "solde", "balance", "mrr", "revenue"];
  return keywords.some(k => t.includes(k));
}
