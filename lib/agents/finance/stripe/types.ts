/**
 * Stripe Agent Types
 */

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
