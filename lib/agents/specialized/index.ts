/**
 * Specialized Agents — Domain-specific capability agents
 *
 * Architecture Finale: lib/agents/specialized/
 */

export {
  executeStripeAgent,
  executeStripeAgentInRuntime,
  isStripeTask,
  type StripeAgentInput,
  type StripeAgentOutput,
  type PaymentSummary,
  type InvoiceSummary,
  type SubscriptionMetrics,
} from "./finance";
