import type { ConnectorMeta } from "./types";

export const CORE_CONNECTORS: ConnectorMeta[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Emails et messagerie",
    icon: "✉️",
    source: "core",
    category: "communication",
    provider: "google",
    connectAction: "google",
  },
  {
    id: "calendar",
    name: "Google Agenda",
    description: "Rendez-vous et planning",
    icon: "📅",
    source: "core",
    category: "productivity",
    provider: "google",
    connectAction: "google",
  },
  {
    id: "drive",
    name: "Google Drive",
    description: "Fichiers et documents",
    icon: "📁",
    source: "core",
    category: "storage",
    provider: "google",
    connectAction: "google",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Messages d'équipe",
    icon: "💬",
    source: "core",
    category: "communication",
    provider: "slack",
    connectAction: "slack",
  },
];

export const EXTERNAL_CONNECTORS: ConnectorMeta[] = [
  // --- PRODUCTIVITY & PROJECT MANAGEMENT ---
  { id: "notion", name: "Notion", description: "Notes et bases de données", icon: "📝", source: "external", category: "productivity" },
  { id: "linear", name: "Linear", description: "Gestion de projets", icon: "📐", source: "external", category: "project" },
  { id: "asana", name: "Asana", description: "Gestion de projets", icon: "✅", source: "external", category: "project" },
  { id: "trello", name: "Trello", description: "Tableaux de tâches", icon: "📋", source: "external", category: "project" },
  { id: "clickup", name: "ClickUp", description: "Productivité", icon: "⚡", source: "external", category: "project" },
  { id: "monday", name: "Monday.com", description: "Gestion de travail", icon: "🗂️", source: "external", category: "project" },
  { id: "jira", name: "Jira", description: "Suivi de tickets", icon: "🎫", source: "external", category: "project" },
  { id: "airtable", name: "Airtable", description: "Bases de données", icon: "📊", source: "external", category: "productivity" },
  { id: "confluence", name: "Confluence", description: "Documentation", icon: "📖", source: "external", category: "productivity" },
  { id: "miro", name: "Miro", description: "Tableaux collaboratifs", icon: "🖼️", source: "external", category: "productivity" },
  { id: "figma", name: "Figma", description: "Design et prototypes", icon: "🎨", source: "external", category: "productivity" },
  { id: "calendly", name: "Calendly", description: "Planification", icon: "📆", source: "external", category: "productivity" },
  { id: "docusign", name: "DocuSign", description: "Signatures", icon: "✍️", source: "external", category: "productivity" },
  { id: "zapier", name: "Zapier", description: "Automatisations", icon: "⚡", source: "external", category: "productivity" },
  { id: "make", name: "Make", description: "Workflows", icon: "🔄", source: "external", category: "productivity" },

  // --- CRM & SALES ---
  { id: "hubspot", name: "HubSpot", description: "CRM et contacts", icon: "🤝", source: "external", category: "crm" },
  { id: "salesforce", name: "Salesforce", description: "CRM et ventes", icon: "☁️", source: "external", category: "crm" },
  { id: "pipedrive", name: "Pipedrive", description: "Pipeline de vente", icon: "📈", source: "external", category: "crm" },
  { id: "intercom", name: "Intercom", description: "Support client", icon: "💬", source: "external", category: "communication" },
  { id: "zendesk", name: "Zendesk", description: "Support et tickets", icon: "🎧", source: "external", category: "communication" },
  { id: "apollo", name: "Apollo.io", description: "Prospection B2B", icon: "🚀", source: "external", category: "crm" },
  { id: "gong", name: "Gong", description: "Revenue Intelligence", icon: "🎤", source: "external", category: "crm" },
  { id: "outreach", name: "Outreach", description: "Sales Engagement", icon: "📧", source: "external", category: "crm" },

  // --- DEV & INFRA ---
  { id: "github", name: "GitHub", description: "Dépôts et PRs", icon: "🐙", source: "external", category: "dev" },
  { id: "gitlab", name: "GitLab", description: "DevOps", icon: "🦊", source: "external", category: "dev" },
  { id: "bitbucket", name: "Bitbucket", description: "Dépôts Git", icon: "🪣", source: "external", category: "dev" },
  { id: "vercel", name: "Vercel", description: "Frontend", icon: "▲", source: "external", category: "dev" },
  { id: "aws", name: "AWS", description: "Infrastructure", icon: "☁️", source: "external", category: "dev" },
  { id: "firebase", name: "Firebase", description: "Backend Google", icon: "🔥", source: "external", category: "dev" },
  { id: "supabase", name: "Supabase", description: "Backend OS", icon: "⚡", source: "external", category: "dev" },
  { id: "sentry", name: "Sentry", description: "Monitoring", icon: "🐛", source: "external", category: "dev" },
  { id: "datadog", name: "Datadog", description: "Observabilité", icon: "📈", source: "external", category: "analytics" },
  { id: "postman", name: "Postman", description: "API Testing", icon: "🚀", source: "external", category: "dev" },
  { id: "docker", name: "Docker", description: "Containers", icon: "🐳", source: "external", category: "dev" },
  { id: "kubernetes", name: "Kubernetes", description: "Orchestration", icon: "☸️", source: "external", category: "dev" },
  { id: "cloudflare", name: "Cloudflare", description: "Security & Edge", icon: "☁️", source: "external", category: "dev" },
  { id: "digitalocean", name: "DigitalOcean", description: "Cloud Hosting", icon: "🌊", source: "external", category: "dev" },
  { id: "heroku", name: "Heroku", description: "App Platform", icon: "🟣", source: "external", category: "dev" },

  // --- ANALYTICS & DATA ---
  { id: "mixpanel", name: "Mixpanel", description: "Analytics produit", icon: "📉", source: "external", category: "analytics" },
  { id: "amplitude", name: "Amplitude", description: "Analytics", icon: "📊", source: "external", category: "analytics" },
  { id: "google-analytics", name: "Google Analytics", description: "Web", icon: "📈", source: "external", category: "analytics" },
  { id: "snowflake", name: "Snowflake", description: "Data Warehouse", icon: "❄️", source: "external", category: "analytics" },
  { id: "bigquery", name: "BigQuery", description: "Analytics", icon: "🔍", source: "external", category: "analytics" },
  { id: "tableau", name: "Tableau", description: "Visualisation", icon: "📊", source: "external", category: "analytics" },
  { id: "power-bi", name: "Power BI", description: "BI", icon: "📊", source: "external", category: "analytics" },
  { id: "segment", name: "Segment", description: "Customer Data", icon: "🧩", source: "external", category: "analytics" },
  { id: "hotjar", name: "Hotjar", description: "Heatmaps", icon: "🔥", source: "external", category: "analytics" },

  // --- FINANCE & E-COMMERCE ---
  { id: "stripe", name: "Stripe", description: "Paiements", icon: "💳", source: "external", category: "analytics" },
  { id: "shopify", name: "Shopify", description: "E-commerce", icon: "🛍️", source: "external", category: "analytics" },
  { id: "quickbooks", name: "QuickBooks", description: "Comptabilité", icon: "🧾", source: "external", category: "analytics" },
  { id: "xero", name: "Xero", description: "Accounting", icon: "🟦", source: "external", category: "analytics" },
  { id: "revolut-business", name: "Revolut", description: "Banking", icon: "🏦", source: "external", category: "analytics" },
  { id: "paypal", name: "PayPal", description: "Payments", icon: "🅿️", source: "external", category: "analytics" },
  { id: "chargebee", name: "Chargebee", description: "Subscriptions", icon: "🐝", source: "external", category: "analytics" },

  // --- COMMUNICATION ---
  { id: "outlook", name: "Outlook", description: "Email", icon: "📧", source: "external", category: "communication" },
  { id: "teams", name: "Microsoft Teams", description: "Chat", icon: "👥", source: "external", category: "communication" },
  { id: "zoom", name: "Zoom", description: "Visio", icon: "🎥", source: "external", category: "communication" },
  { id: "discord", name: "Discord", description: "Chat", icon: "🎮", source: "external", category: "communication" },
  { id: "twilio", name: "Twilio", description: "SMS & Voice", icon: "📱", source: "external", category: "communication" },
  { id: "sendgrid", name: "SendGrid", description: "Email API", icon: "📨", source: "external", category: "communication" },
  { id: "mailchimp", name: "Mailchimp", description: "Marketing", icon: "🐵", source: "external", category: "communication" },
  { id: "loom", name: "Loom", description: "Vidéo", icon: "🎬", source: "external", category: "communication" },
  { id: "slack-enterprise", name: "Slack Enterprise", description: "Grid", icon: "🏢", source: "external", category: "communication" },

  // --- STORAGE ---
  { id: "dropbox", name: "Dropbox", description: "Stockage", icon: "📦", source: "external", category: "storage" },
  { id: "onedrive", name: "OneDrive", description: "Microsoft", icon: "💾", source: "external", category: "storage" },
  { id: "box", name: "Box", description: "Content Cloud", icon: "🟦", source: "external", category: "storage" },

  // --- AI & ML ---
  { id: "openai", name: "OpenAI", description: "LLM & Vision", icon: "🤖", source: "external", category: "dev" },
  { id: "anthropic", name: "Anthropic", description: "Claude", icon: "🧠", source: "external", category: "dev" },
  { id: "huggingface", name: "Hugging Face", description: "Models", icon: "🤗", source: "external", category: "dev" },
  { id: "pinecone", name: "Pinecone", description: "Vector DB", icon: "🌲", source: "external", category: "dev" },
  { id: "langchain", name: "LangChain", description: "AI Orchestration", icon: "🦜", source: "external", category: "dev" },

  // --- MARKETING & SOCIAL ---
  { id: "linkedin", name: "LinkedIn", description: "Social B2B", icon: "🟦", source: "external", category: "other" },
  { id: "twitter", name: "Twitter / X", description: "Social", icon: "𝕏", source: "external", category: "other" },
  { id: "instagram", name: "Instagram", description: "Social", icon: "📸", source: "external", category: "other" },
  { id: "facebook", name: "Facebook", description: "Social", icon: "👥", source: "external", category: "other" },
  { id: "tiktok", name: "TikTok", description: "Social", icon: "🎵", source: "external", category: "other" },
  { id: "canva", name: "Canva", description: "Design", icon: "🎨", source: "external", category: "other" },
  { id: "buffer", name: "Buffer", description: "Scheduling", icon: "⏳", source: "external", category: "other" },
  { id: "hootsuite", name: "Hootsuite", description: "Social Management", icon: "🦉", source: "external", category: "other" },

  // --- LEGAL & HR ---
  { id: "deel", name: "Deel", description: "Global HR", icon: "🌍", source: "external", category: "other" },
  { id: "gusto", name: "Gusto", description: "Payroll", icon: "💰", source: "external", category: "other" },
  { id: "bamboo-hr", name: "BambooHR", description: "HR Management", icon: "🎋", source: "external", category: "other" },
  { id: "rippling", name: "Rippling", description: "Employee Data", icon: "🌊", source: "external", category: "other" },
  { id: "clio", name: "Clio", description: "Legal Management", icon: "⚖️", source: "external", category: "other" },

  // --- SECURITY ---
  { id: "okta", name: "Okta", description: "Identity", icon: "🔑", source: "external", category: "dev" },
  { id: "auth0", name: "Auth0", description: "Authentication", icon: "🛡️", source: "external", category: "dev" },
  { id: "1password", name: "1Password", description: "Security", icon: "🔐", source: "external", category: "other" },
  { id: "snyk", name: "Snyk", description: "Security Scan", icon: "🐶", source: "external", category: "dev" },

  // --- CUSTOMER SUPPORT ---
  { id: "freshdesk", name: "Freshdesk", description: "Support", icon: "🍃", source: "external", category: "communication" },
  { id: "front", name: "Front", description: "Shared Inbox", icon: "📥", source: "external", category: "communication" },
  { id: "helpscout", name: "Help Scout", description: "Support", icon: "💌", source: "external", category: "communication" },

  // --- EDUCATION & KNOWLEDGE ---
  { id: "coursera", name: "Coursera", description: "Learning", icon: "🎓", source: "external", category: "other" },
  { id: "udemy", name: "Udemy", description: "Learning", icon: "📚", source: "external", category: "other" },
  { id: "medium", name: "Medium", description: "Publishing", icon: "✍️", source: "external", category: "other" },
  { id: "ghost", name: "Ghost", description: "Publishing", icon: "👻", source: "external", category: "other" },

];

export const ALL_CONNECTORS: ConnectorMeta[] = [...CORE_CONNECTORS, ...EXTERNAL_CONNECTORS];

export function getConnector(id: string): ConnectorMeta | undefined {
  return ALL_CONNECTORS.find((c) => c.id === id);
}
