/**
 * Stripe Connector — Mappers
 *
 * Transformations Stripe API → Unified types.
 */

import type {
  StripeCustomer,
  StripeCharge,
  StripeInvoice,
  StripeSubscription,
} from "./schemas";
import type {
  UnifiedPayment,
  UnifiedInvoice,
  UnifiedSubscription,
} from "./schemas";

/**
 * Convertit un timestamp Unix Stripe en Date
 */
function stripeTimestampToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Map Stripe Charge → Unified Payment
 */
export function mapStripeChargeToPayment(
  charge: StripeCharge,
  customer?: StripeCustomer
): UnifiedPayment {
  return {
    id: `stripe_charge_${charge.id}`,
    provider: "stripe",
    amount: charge.amount / 100, // Stripe uses cents
    currency: charge.currency.toUpperCase(),
    status: mapChargeStatus(charge.status),
    customerEmail: customer?.email,
    customerName: customer?.name,
    description: charge.description,
    receiptUrl: charge.receipt_url,
    createdAt: stripeTimestampToDate(charge.created),
    metadata: charge.metadata || {},
  };
}

function mapChargeStatus(
  status: "succeeded" | "pending" | "failed"
): UnifiedPayment["status"] {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "pending":
      return "pending";
    case "failed":
      return "failed";
    default:
      return "failed";
  }
}

/**
 * Map Stripe Invoice → Unified Invoice
 */
export function mapStripeInvoiceToInvoice(
  invoice: StripeInvoice,
  customer?: StripeCustomer
): UnifiedInvoice {
  return {
    id: `stripe_invoice_${invoice.id}`,
    provider: "stripe",
    customerEmail: customer?.email,
    customerName: customer?.name,
    status: invoice.status,
    total: invoice.total / 100,
    currency: invoice.currency.toUpperCase(),
    pdfUrl: invoice.invoice_pdf,
    hostedUrl: invoice.hosted_invoice_url,
    dueDate: invoice.due_date
      ? stripeTimestampToDate(invoice.due_date)
      : undefined,
    createdAt: stripeTimestampToDate(invoice.created),
    metadata: invoice.metadata || {},
  };
}

/**
 * Map Stripe Subscription → Unified Subscription
 */
export function mapStripeSubscriptionToSubscription(
  subscription: StripeSubscription,
  customer?: StripeCustomer
): UnifiedSubscription {
  const item = subscription.items.data[0];
  const price = item?.price;

  return {
    id: `stripe_subscription_${subscription.id}`,
    provider: "stripe",
    customerEmail: customer?.email,
    status: subscription.status,
    planName: price?.product || "Unknown Plan",
    planAmount: price ? price.unit_amount / 100 : 0,
    currency: price?.currency.toUpperCase() || "USD",
    currentPeriodStart: stripeTimestampToDate(
      subscription.current_period_start
    ),
    currentPeriodEnd: stripeTimestampToDate(subscription.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at
      ? stripeTimestampToDate(subscription.canceled_at)
      : undefined,
    metadata: subscription.metadata || {},
  };
}

/**
 * Map multiple items
 */
export function mapStripeChargesToPayments(
  charges: StripeCharge[],
  customers?: Map<string, StripeCustomer>
): UnifiedPayment[] {
  return charges.map((charge) =>
    mapStripeChargeToPayment(
      charge,
      charge.customer ? customers?.get(charge.customer) : undefined
    )
  );
}

export function mapStripeInvoicesToInvoices(
  invoices: StripeInvoice[],
  customers?: Map<string, StripeCustomer>
): UnifiedInvoice[] {
  return invoices.map((invoice) =>
    mapStripeInvoiceToInvoice(
      invoice,
      customers?.get(invoice.customer)
    )
  );
}

export function mapStripeSubscriptionsToSubscriptions(
  subscriptions: StripeSubscription[],
  customers?: Map<string, StripeCustomer>
): UnifiedSubscription[] {
  return subscriptions.map((sub) =>
    mapStripeSubscriptionToSubscription(
      sub,
      customers?.get(sub.customer)
    )
  );
}
