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

export {
  executeCRMAgent,
  executeCRMAgentInRuntime,
  isCRMTask,
  type CRMAgentInput,
  type CRMAgentOutput,
  type ContactSummary,
  type DealSummary,
} from "./crm";

export {
  executeProductivityAgent,
  executeProductivityAgentInRuntime,
  isProductivityTask,
  type ProductivityAgentInput,
  type ProductivityAgentOutput,
  type NotionSummary,
} from "./productivity";

export {
  executeDesignAgent,
  executeDesignAgentInRuntime,
  isDesignTask,
  type DesignAgentInput,
  type DesignAgentOutput,
  type FigmaSummary,
} from "./design";

export {
  executeDeveloperAgent,
  executeDeveloperAgentInRuntime,
  isDeveloperTask,
  type DeveloperAgentInput,
  type DeveloperAgentOutput,
  type RepoSummary,
  type IssueSummary,
  type PullRequestSummary,
} from "./developer";
