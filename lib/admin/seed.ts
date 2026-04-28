/**
 * Admin dev seed — populates agents / tools / datasets / workflows / skills
 * with realistic Hearst-flavoured data so the admin pages aren't empty out
 * of the box.
 *
 * Idempotent: each row is keyed by `slug` (or `name` for tables without a
 * slug column). Re-running the seed is safe and only inserts rows that are
 * missing.
 *
 * Used by:
 *   - `scripts/seed-admin-data.ts` (CLI: `npm run seed:admin`)
 *   - `POST /api/admin/seed/[resource]` (UI button on empty list pages)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type DB = SupabaseClient<Database>;

export type SeedResource =
  | "agents"
  | "tools"
  | "datasets"
  | "workflows"
  | "skills"
  | "all";

export interface SeedReport {
  resource: SeedResource;
  inserted: number;
  skipped: number;
  errors: string[];
}

// ─── Source data ─────────────────────────────────────────────────────────

const AGENTS = [
  {
    slug: "email-assistant",
    name: "Email Assistant",
    description:
      "Triage Gmail, suggère des réponses, met en forme les drafts. Travaille en mode preview-then-confirm sur les write actions.",
    model_provider: "anthropic",
    model_name: "claude-sonnet-4-6",
    system_prompt:
      "Tu es l'assistant email d'Adrien. Tu lis Gmail, tu rédiges des réponses dans son style (concis, direct, français pro), et tu utilises le pattern preview/confirm pour tout envoi.",
    temperature: 0.3,
    max_tokens: 4096,
    top_p: 1.0,
    status: "active",
    metadata: {},
  },
  {
    slug: "calendar-keeper",
    name: "Calendar Keeper",
    description:
      "Surveille Google Calendar, propose des slots, anticipe les conflits, prépare les briefs avant chaque meeting.",
    model_provider: "anthropic",
    model_name: "claude-sonnet-4-6",
    system_prompt:
      "Tu es le gardien d'agenda. Tu connais les contraintes d'Adrien (focus du matin, pas de meetings le vendredi PM) et tu protèges son temps.",
    temperature: 0.2,
    max_tokens: 2048,
    top_p: 1.0,
    status: "active",
    metadata: {},
  },
  {
    slug: "research-analyst",
    name: "Research Analyst",
    description:
      "Branche déterministe pour les requêtes recherche / rapport. Web search → structuration → asset PDF.",
    model_provider: "anthropic",
    model_name: "claude-sonnet-4-6",
    system_prompt:
      "Tu produis des rapports factuels, sourcés, structurés. Format brief (300 mots) ou report (1500+) selon la demande.",
    temperature: 0.3,
    max_tokens: 8192,
    top_p: 1.0,
    status: "active",
    metadata: {},
  },
  {
    slug: "slack-replier",
    name: "Slack Replier",
    description:
      "Lit les threads Slack, propose des réponses dans le ton de la conversation, alerte sur les mentions critiques.",
    model_provider: "anthropic",
    model_name: "claude-sonnet-4-6",
    system_prompt:
      "Tu réponds dans Slack en respectant la culture de chaque channel. Sois bref dans #ops, plus pédagogique dans #product.",
    temperature: 0.4,
    max_tokens: 1024,
    top_p: 1.0,
    status: "active",
    metadata: {},
  },
] as const;

const TOOLS = [
  {
    slug: "gmail-fetch-emails",
    name: "Gmail Fetch Emails",
    description: "Récupère les derniers emails Gmail avec filtres (label, query, max).",
    endpoint_url: "https://api.composio.dev/v1/actions/gmail_fetch_emails/execute",
    http_method: "POST" as const,
    auth_type: "oauth" as const,
    timeout_ms: 30000,
  },
  {
    slug: "gmail-send-email",
    name: "Gmail Send Email",
    description: "Envoie un email Gmail. Pattern preview/confirm via _preview=true.",
    endpoint_url: "https://api.composio.dev/v1/actions/gmail_send_email/execute",
    http_method: "POST" as const,
    auth_type: "oauth" as const,
    timeout_ms: 30000,
  },
  {
    slug: "slack-send-message",
    name: "Slack Send Message",
    description: "Poste un message dans un channel ou DM Slack.",
    endpoint_url: "https://api.composio.dev/v1/actions/slack_send_message/execute",
    http_method: "POST" as const,
    auth_type: "oauth" as const,
    timeout_ms: 20000,
  },
  {
    slug: "gcal-create-event",
    name: "Google Calendar — Create Event",
    description: "Crée un événement avec invités, fuseau horaire, conférence Meet.",
    endpoint_url: "https://api.composio.dev/v1/actions/googlecalendar_events_insert/execute",
    http_method: "POST" as const,
    auth_type: "oauth" as const,
    timeout_ms: 30000,
  },
  {
    slug: "gcal-list-events",
    name: "Google Calendar — List Events",
    description: "Récupère les événements d'une plage temporelle pour un calendrier.",
    endpoint_url: "https://api.composio.dev/v1/actions/googlecalendar_events_list/execute",
    http_method: "GET" as const,
    auth_type: "oauth" as const,
    timeout_ms: 20000,
  },
  {
    slug: "notion-search",
    name: "Notion Search",
    description: "Recherche full-text dans les pages Notion accessibles à l'intégration.",
    endpoint_url: "https://api.composio.dev/v1/actions/notion_search/execute",
    http_method: "POST" as const,
    auth_type: "oauth" as const,
    timeout_ms: 20000,
  },
  {
    slug: "web-search",
    name: "Web Search",
    description: "Recherche web indépendante (Tavily/Brave). Utilisée par la branche Research.",
    endpoint_url: "https://api.tavily.com/search",
    http_method: "POST" as const,
    auth_type: "api_key" as const,
    timeout_ms: 30000,
  },
  {
    slug: "pdf-extract-text",
    name: "PDF Extract Text",
    description: "Extrait le texte structuré d'un PDF stocké en URL ou base64.",
    endpoint_url: "https://api.composio.dev/v1/actions/file_pdf_extract_text/execute",
    http_method: "POST" as const,
    auth_type: "api_key" as const,
    timeout_ms: 60000,
  },
] as const;

const SKILLS = [
  {
    slug: "summarize",
    name: "Summarize",
    category: "writing",
    description: "Résume un texte long en 3-5 puces clés.",
    prompt_template:
      "Résume le texte suivant en 3-5 puces clés. Garde le ton de l'auteur. Texte :\n\n{{input}}",
  },
  {
    slug: "draft-email",
    name: "Draft Email",
    category: "communication",
    description: "Rédige un brouillon d'email à partir d'une intention courte.",
    prompt_template:
      "Rédige un email pour {{recipient}}. Intention : {{intent}}. Ton : {{tone}}. Signe par « Adrien ».",
  },
  {
    slug: "schedule-meeting",
    name: "Schedule Meeting",
    category: "calendar",
    description: "Propose 3 créneaux libres compatibles avec les contraintes données.",
    prompt_template:
      "Propose 3 créneaux pour un meeting de {{duration}} avec {{participants}}. Évite : {{blockers}}.",
  },
  {
    slug: "search-web",
    name: "Search Web",
    category: "research",
    description: "Recherche web et synthèse en 200 mots avec sources.",
    prompt_template:
      "Cherche sur le web : {{query}}. Synthétise en 200 mots maximum, cite les 3 meilleures sources.",
  },
  {
    slug: "analyze-document",
    name: "Analyze Document",
    category: "analysis",
    description: "Extrait les points clés, risques et recommandations d'un document.",
    prompt_template:
      "Analyse le document suivant. Sortie : 1) résumé 80 mots, 2) 3 points forts, 3) 3 risques, 4) recommandation.\n\nDocument :\n{{document}}",
  },
] as const;

const DATASETS = [
  {
    name: "eval-email-tone",
    description: "Évalue la cohérence du ton sur les drafts d'emails.",
    entries: [
      { input: "Réponds à Marc qui annule son meeting", expected_output: "Pas de souci Marc, on reprogramme la semaine prochaine. — Adrien" },
      { input: "Annonce le délai au client", expected_output: "On va devoir décaler la livraison de 5 jours. Je t'envoie un planning révisé d'ici demain." },
      { input: "Refuse une nouvelle demande de meeting", expected_output: "Je ne peux pas cette semaine — peux-tu m'envoyer la question par écrit ? Je reviens vers toi avant vendredi." },
      { input: "Confirme une réservation", expected_output: "Confirmé pour le 12 à 14h. Je t'envoie l'adresse 1h avant." },
      { input: "Relance après silence", expected_output: "Hey, je reviens vers toi sur le sujet X — tu as 5 min cette semaine ?" },
    ],
  },
  {
    name: "eval-research-quality",
    description: "Mesure la qualité des rapports produits par la branche research.",
    entries: [
      { input: "Marché de l'IA conversationnelle B2B en 2026", expected_output: "Rapport de 1500+ mots, 5+ sources, structure : marché / acteurs / signaux faibles / recommandation." },
      { input: "Brief sur la régulation EU AI Act", expected_output: "Brief 300 mots, 3 sources officielles minimum, focus implications pour les startups SaaS." },
      { input: "Tendances design system 2026", expected_output: "Rapport 800 mots, exemples de Linear / Vercel / Stripe, 3 takeaways concrets." },
      { input: "Comparaison Composio vs Pipedream", expected_output: "Tableau comparatif, 4 dimensions (price, integrations, DX, observability), verdict argumenté." },
      { input: "État de Next.js 16", expected_output: "Brief 500 mots : changelog clé, breaking changes, migration tips depuis Next 15." },
    ],
  },
  {
    name: "eval-calendar-conflicts",
    description: "Détecte les conflits de calendrier et propose des alternatives.",
    entries: [
      { input: "Meeting client mardi 10h vs review interne mardi 10h", expected_output: "Conflit détecté. Proposer : déplacer la review à mercredi 10h ou jeudi 16h." },
      { input: "Focus 9h-12h vs urgence dev qui tombe à 10h", expected_output: "Préserver le focus jusqu'à 12h. Proposer un slot 14h-15h pour l'urgence." },
      { input: "Vendredi PM = no-meeting policy + demande externe", expected_output: "Refuser poliment et proposer 3 slots lundi/mardi matin." },
    ],
  },
] as const;

const WORKFLOWS = [
  {
    name: "Morning Briefing",
    description: "Génère le briefing du matin : emails prioritaires, agenda du jour, blockers.",
    trigger_type: "schedule" as const,
    status: "active" as const,
    steps: [
      { step_order: 0, action_type: "tool_call" as const, agentSlug: "email-assistant", config: { tool: "gmail_fetch_emails", filter: "is:unread newer_than:1d" } },
      { step_order: 1, action_type: "tool_call" as const, agentSlug: "calendar-keeper", config: { tool: "googlecalendar_events_list", range: "today" } },
      { step_order: 2, action_type: "chat" as const, agentSlug: "email-assistant", config: { prompt: "Synthétise le briefing en 5 puces." } },
    ],
  },
  {
    name: "Weekly Recap",
    description: "Récap hebdomadaire : runs, KPIs, alertes, points d'attention.",
    trigger_type: "schedule" as const,
    status: "active" as const,
    steps: [
      { step_order: 0, action_type: "tool_call" as const, agentSlug: "research-analyst", config: { tool: "runs_aggregate", range: "7d" } },
      { step_order: 1, action_type: "tool_call" as const, agentSlug: "research-analyst", config: { tool: "audit_log_diff", range: "7d" } },
      { step_order: 2, action_type: "chat" as const, agentSlug: "research-analyst", config: { prompt: "Produis le recap en format brief." } },
      { step_order: 3, action_type: "tool_call" as const, agentSlug: "slack-replier", config: { tool: "slack_send_message", channel: "#weekly" } },
    ],
  },
] as const;

// ─── Seed implementation ────────────────────────────────────────────────

async function seedAgents(db: DB): Promise<SeedReport> {
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;
  for (const agent of AGENTS) {
    const { data: existing } = await db.from("agents").select("id").eq("slug", agent.slug).maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }
    const { error } = await db.from("agents").insert(agent);
    if (error) {
      errors.push(`${agent.slug}: ${error.message}`);
    } else {
      inserted += 1;
    }
  }
  return { resource: "agents", inserted, skipped, errors };
}

async function seedTools(db: DB): Promise<SeedReport> {
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;
  for (const tool of TOOLS) {
    const { data: existing } = await db.from("tools").select("id").eq("slug", tool.slug).maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }
    const { error } = await db.from("tools").insert(tool);
    if (error) {
      errors.push(`${tool.slug}: ${error.message}`);
    } else {
      inserted += 1;
    }
  }
  return { resource: "tools", inserted, skipped, errors };
}

async function seedSkills(db: DB): Promise<SeedReport> {
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;
  for (const skill of SKILLS) {
    const { data: existing } = await db.from("skills").select("id").eq("slug", skill.slug).maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }
    const { error } = await db.from("skills").insert(skill);
    if (error) {
      errors.push(`${skill.slug}: ${error.message}`);
    } else {
      inserted += 1;
    }
  }
  return { resource: "skills", inserted, skipped, errors };
}

async function seedDatasets(db: DB): Promise<SeedReport> {
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;
  for (const dataset of DATASETS) {
    const { data: existing } = await db
      .from("datasets")
      .select("id")
      .eq("name", dataset.name)
      .maybeSingle();
    let datasetId = existing?.id;
    if (!datasetId) {
      const { data: created, error } = await db
        .from("datasets")
        .insert({ name: dataset.name, description: dataset.description })
        .select("id")
        .single();
      if (error || !created) {
        errors.push(`dataset ${dataset.name}: ${error?.message ?? "no row returned"}`);
        continue;
      }
      datasetId = created.id;
      inserted += 1;
    } else {
      skipped += 1;
    }

    for (const entry of dataset.entries) {
      const { error } = await db.from("dataset_entries").insert({
        dataset_id: datasetId,
        input: entry.input,
        expected_output: entry.expected_output,
      });
      if (error && !error.message.includes("duplicate")) {
        errors.push(`entry ${dataset.name}: ${error.message}`);
      }
    }
  }
  return { resource: "datasets", inserted, skipped, errors };
}

async function seedWorkflows(db: DB): Promise<SeedReport> {
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  // Resolve agent slugs → ids once.
  const { data: agentRows } = await db.from("agents").select("id, slug");
  const agentBySlug = new Map<string, string>();
  for (const row of agentRows ?? []) {
    if (row.slug) agentBySlug.set(row.slug, row.id);
  }

  for (const wf of WORKFLOWS) {
    const { data: existing } = await db
      .from("workflows")
      .select("id")
      .eq("name", wf.name)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }
    const { data: created, error } = await db
      .from("workflows")
      .insert({
        name: wf.name,
        description: wf.description,
        trigger_type: wf.trigger_type,
        status: wf.status,
      })
      .select("id")
      .single();
    if (error || !created) {
      errors.push(`workflow ${wf.name}: ${error?.message ?? "no row returned"}`);
      continue;
    }
    inserted += 1;

    for (const step of wf.steps) {
      const { error: stepErr } = await db.from("workflow_steps").insert({
        workflow_id: created.id,
        step_order: step.step_order,
        action_type: step.action_type,
        agent_id: agentBySlug.get(step.agentSlug) ?? null,
        config: step.config,
      });
      if (stepErr) errors.push(`step ${wf.name}#${step.step_order}: ${stepErr.message}`);
    }
  }
  return { resource: "workflows", inserted, skipped, errors };
}

const SEEDERS: Record<Exclude<SeedResource, "all">, (db: DB) => Promise<SeedReport>> = {
  agents: seedAgents,
  tools: seedTools,
  skills: seedSkills,
  datasets: seedDatasets,
  workflows: seedWorkflows,
};

/**
 * Seed one or all resources. Workflows depends on agents (they reference
 * `agent_id`), so when seeding `all` we always run agents first.
 */
export async function runSeed(db: DB, resource: SeedResource): Promise<SeedReport[]> {
  if (resource === "all") {
    const order: Exclude<SeedResource, "all">[] = [
      "agents",
      "tools",
      "skills",
      "datasets",
      "workflows",
    ];
    const reports: SeedReport[] = [];
    for (const r of order) {
      reports.push(await SEEDERS[r](db));
    }
    return reports;
  }
  return [await SEEDERS[resource](db)];
}
