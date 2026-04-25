/**
 * Stripe Connector — Public API
 *
 * Usage:
 *   import { StripeApiService, mapStripeChargeToPayment } from "./stripe";
 */

export * from "./schemas";
export * from "./mappers";
export { StripeApiService, StripeApiError } from "./services/api";

// Convenience exports for unified interface
export {
  mapStripeChargeToPayment,
  mapStripeInvoiceToInvoice,
  mapStripeSubscriptionToSubscription,
  mapStripeChargesToPayments,
  mapStripeInvoicesToInvoices,
  mapStripeSubscriptionsToSubscriptions,
} from "./mappers";
