import { ConnectorMeta } from "../connectors/types";

export interface Blueprint {
  id: string;
  title: string;
  description: string;
  category: "sales" | "finance" | "dev" | "marketing" | "legal";
  requiredConnectors: string[]; // IDs from registry
  capabilities: string[];
  workflowId: string; // The underlying workflow to trigger
  color: string;
  icon: string;
}

export const BLUEPRINT_REGISTRY: Blueprint[] = [
  {
    id: "automated-sales-pipeline",
    title: "Pipeline de Vente Automatisé",
    description: "Orchestration Salesforce + Slack + Gmail. Qualification automatique des leads et alertes instantanées.",
    category: "sales",
    requiredConnectors: ["salesforce", "slack", "gmail"],
    capabilities: ["Lead Scoring", "Auto-Reply", "Slack Alerts"],
    workflowId: "wf-sales-001",
    color: "from-blue-500/20 to-cyan-500/20",
    icon: "🚀",
  },
  {
    id: "finance-intelligence-hub",
    title: "Intelligence Financière",
    description: "Stripe + QuickBooks + Revolut. Analyse de churn, prévision de cash-flow et détection d'anomalies.",
    category: "finance",
    requiredConnectors: ["stripe", "quickbooks", "revolut-business"],
    capabilities: ["Churn Analysis", "Cash-flow Forecast", "Anomaly Detection"],
    workflowId: "wf-fin-001",
    color: "from-emerald-500/20 to-teal-500/20",
    icon: "💰",
  },
  {
    id: "devops-sentinel",
    title: "DevOps Sentinel",
    description: "GitHub + Sentry + Vercel + Cloudflare. Monitoring 360° de vos déploiements et sécurité edge.",
    category: "dev",
    requiredConnectors: ["github", "sentry", "vercel", "cloudflare"],
    capabilities: ["Auto-Rollback", "Security Audit", "Performance Tracking"],
    workflowId: "wf-dev-001",
    color: "from-purple-500/20 to-pink-500/20",
    icon: "🛡️",
  },
  {
    id: "growth-marketing-engine",
    title: "Growth Marketing Engine",
    description: "LinkedIn + Twitter + Mailchimp + Mixpanel. Automatisation de contenu et tracking de conversion.",
    category: "marketing",
    requiredConnectors: ["linkedin", "twitter", "mailchimp", "mixpanel"],
    capabilities: ["Content Scheduling", "Multi-channel Attribution", "A/B Testing"],
    workflowId: "wf-mkt-001",
    color: "from-orange-500/20 to-red-500/20",
    icon: "📈",
  }
];
