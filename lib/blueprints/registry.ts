export interface BlueprintMissionTemplate {
  name: string;
  input: string;
  schedule: string;
}

export interface Blueprint {
  id: string;
  title: string;
  description: string;
  category: "sales" | "finance" | "dev" | "marketing" | "legal";
  requiredConnectors: string[]; // IDs from registry
  capabilities: string[];
  missionTemplate: BlueprintMissionTemplate;
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
    missionTemplate: {
      name: "Pipeline de Vente Automatisé",
      input:
        "Chaque jour, analyser Salesforce, Gmail et Slack pour qualifier les nouveaux leads, signaler les opportunités prioritaires et proposer les prochaines actions commerciales.",
      schedule: "every day",
    },
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
    missionTemplate: {
      name: "Intelligence Financière",
      input:
        "Chaque jour, agréger Stripe, QuickBooks et Revolut pour détecter les anomalies, suivre le cash-flow et produire un signal financier exploitable.",
      schedule: "every day",
    },
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
    missionTemplate: {
      name: "DevOps Sentinel",
      input:
        "Toutes les heures, surveiller GitHub, Sentry, Vercel et Cloudflare pour détecter les incidents de déploiement, les régressions critiques et les signaux de risque opérationnel.",
      schedule: "every hour",
    },
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
    missionTemplate: {
      name: "Growth Marketing Engine",
      input:
        "Chaque semaine, analyser LinkedIn, Twitter, Mailchimp et Mixpanel pour identifier les contenus performants, suivre la conversion et recommander les prochaines actions growth.",
      schedule: "every week",
    },
    workflowId: "wf-mkt-001",
    color: "from-orange-500/20 to-red-500/20",
    icon: "📈",
  }
];
