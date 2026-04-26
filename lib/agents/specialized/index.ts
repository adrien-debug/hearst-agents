/**
 * Specialized Agents — Domain-specific capability agents
 *
 * Architecture Finale: lib/agents/specialized/
 */

export {
  executeStripeAgent,
  executeStripeAgentInRuntime,
  type StripeAgentInput,
  type StripeAgentOutput,
  type PaymentSummary,
  type InvoiceSummary,
  type SubscriptionMetrics,
} from "./finance";

export {
  executeCRMAgent,
  executeCRMAgentInRuntime,
  type CRMAgentInput,
  type CRMAgentOutput,
  type ContactSummary,
  type DealSummary,
} from "./crm";

export {
  executeProductivityAgent,
  executeProductivityAgentInRuntime,
  type ProductivityAgentInput,
  type ProductivityAgentOutput,
  type NotionSummary,
} from "./productivity";

export {
  executeDesignAgent,
  executeDesignAgentInRuntime,
  type DesignAgentInput,
  type DesignAgentOutput,
  type FigmaSummary,
} from "./design";

export {
  executeDeveloperAgent,
  executeDeveloperAgentInRuntime,
  type DeveloperAgentInput,
  type DeveloperAgentOutput,
  type RepoSummary,
  type IssueSummary,
  type PullRequestSummary,
} from "./developer";
