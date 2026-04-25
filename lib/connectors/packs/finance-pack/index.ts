/**
 * Finance Pack — Public API
 *
 * Architecture Finale: lib/connectors/packs/finance-pack/
 * Provides: Stripe, QuickBooks, Xero, Plaid, Wise connectors
 * Current: Stripe implementation (Phase B)
 */

// Schemas
export * from "./schemas/stripe";

// Mappers
export {
  mapStripeChargeToPayment,
  mapStripeInvoiceToInvoice,
  mapStripeSubscriptionToSubscription,
  mapStripeChargesToPayments,
  mapStripeInvoicesToInvoices,
  mapStripeSubscriptionsToSubscriptions,
} from "./mappers/stripe";

// Services
export { StripeApiService, StripeApiError } from "./services/stripe";

// Auth (stub)
export { initiateStripeOAuth, handleStripeCallback } from "./auth/stripe";
