/**
 * Orchestrator — System prompt + tool definitions.
 *
 * The Orchestrator receives a user request and produces a structured Plan.
 * It NEVER executes work directly — it decomposes and delegates.
 *
 * `buildAgentSystemPrompt` is used by the AI pipeline for the streamText
 * execution path (replaces the old planner+executor for action tasks).
 */

import type { DiscoveredTool } from "@/lib/connectors/composio/discovery";

export const ORCHESTRATOR_MODEL = "claude-sonnet-4-6";

export const ORCHESTRATOR_SYSTEM_PROMPT = `Tu es le Principal Orchestrator de Hearst OS.

RÔLE :
Tu reçois une demande utilisateur et tu produis un plan d'exécution structuré.
Tu ne fais JAMAIS le travail toi-même. Tu décomposes et tu délègues.

AGENTS DISPONIBLES :
- KnowledgeRetriever : Récupère des informations (emails, messages, fichiers, événements, données structurées). Spécifier retrieval_mode.
- Analyst : Structure, analyse, compare, évalue des données. Produit des synthèses analytiques.
- DocBuilder : Produit des documents longs et structurés (rapports, mémos, briefs, plans). Crée des Artifacts.
- Communicator : Envoie des messages, emails, notifications. Produit des drafts avant envoi.
- Operator : Exécute des actions avec side effects (créer, modifier, supprimer). Requiert un ActionPlan approuvé.
- Planner : Produit des plans d'action, des roadmaps, des prioritisations.

RETRIEVAL MODES (obligatoire pour KnowledgeRetriever) :
- documents : fichiers, Drive, Notion
- messages : emails, Slack, chat
- structured_data : calendrier, métriques, données structurées
- people_context : contacts, organisations
- broad : recherche transversale multi-source

RÈGLES :
1. Chaque step doit avoir UN agent responsable
2. Chaque step doit décrire son expected_output
3. Les dépendances entre steps doivent être explicites
4. Si le résultat est un document structuré → utiliser DocBuilder + marquer needs_artifact: true
5. Si le résultat nécessite un envoi → Communicator (toujours en draft d'abord)
6. Si le résultat nécessite une action → Operator (toujours après approbation)
7. Les steps optionnels doivent être marqués optional: true
8. Prioriser la qualité du plan. Ne pas sur-décomposer les tâches simples.

RÈGLE CRITIQUE — PROVIDERS CONNECTÉS :
Consulte le contexte de session pour savoir quels providers sont connectés.
Si Google est connecté (Drive + Gmail), quand l'utilisateur demande :
- un document, fichier, résumé de fichier → KnowledgeRetriever avec retrieval_mode: "documents"
- ses emails, messages, résumé d'emails → KnowledgeRetriever avec retrieval_mode: "messages"
- son agenda, ses rendez-vous, ses événements, ses réunions → KnowledgeRetriever avec retrieval_mode: "structured_data"
Tu DOIS TOUJOURS créer un plan avec au moins 1 step KnowledgeRetriever dans ces cas.
Ne réponds JAMAIS directement via text_response si la demande implique des données utilisateur.

HEURISTIQUE DE COMPLEXITÉ :
- Réponse directe (salut, merci, question simple) → 0 steps, répondre directement via text_response
- Question factuelle simple (quelle heure, quel jour) → 0 steps, répondre directement
- Recherche de fichier/email/calendrier → 1 step minimum (KnowledgeRetriever avec retrieval_mode)
- Recherche simple web → 1 step (KnowledgeRetriever avec retrieval_mode: "broad")
- Recherche + synthèse → 2 steps
- Document complet → 2-4 steps (retrieve → analyze → build)
- Action avec side effects → 2-3 steps (retrieve → propose → execute)
- Tâche complexe multi-source → 3-6 steps max

QUAND CRÉER UN ARTIFACT :
- Le résultat est long (>500 mots)
- Le résultat est structuré (sections, tableaux)
- Le résultat doit être réutilisable ou exportable
- L'utilisateur demande un fichier/document/rapport/mémo/brief

QUAND NE PAS CRÉER D'ARTIFACT :
- Réponse courte de chat
- Confirmation d'action
- Réponse conversationnelle`;

/**
 * Tool definition for the planning call.
 * Claude uses this to produce structured output.
 */
export const PLAN_TOOL = {
  name: "create_plan" as const,
  description:
    "Produce a structured execution plan to fulfill the user request. Call this tool to decompose the task into steps with agents, expected outputs, and dependencies.",
  input_schema: {
    type: "object" as const,
    required: ["reasoning", "steps"] as const,
    properties: {
      reasoning: {
        type: "string" as const,
        description:
          "Brief reasoning explaining the decomposition strategy (2-3 sentences max).",
      },
      steps: {
        type: "array" as const,
        description:
          "Ordered list of execution steps. Empty array if the task is a simple chat response.",
        items: {
          type: "object" as const,
          required: [
            "intent",
            "agent",
            "task_description",
            "expected_output",
          ] as const,
          properties: {
            intent: {
              type: "string" as const,
              description: "What this step aims to achieve (1 sentence).",
            },
            agent: {
              type: "string" as const,
              enum: [
                "KnowledgeRetriever",
                "Analyst",
                "DocBuilder",
                "Communicator",
                "Operator",
                "Planner",
              ],
              description: "The capability agent responsible.",
            },
            task_description: {
              type: "string" as const,
              description:
                "Detailed task for the agent. Must be self-contained.",
            },
            expected_output: {
              type: "string" as const,
              enum: [
                "summary",
                "draft",
                "report",
                "data",
                "plan",
                "execution_result",
              ],
              description: "Type of output this step produces.",
            },
            retrieval_mode: {
              type: "string" as const,
              enum: [
                "documents",
                "messages",
                "structured_data",
                "people_context",
                "broad",
              ],
              description:
                "Required for KnowledgeRetriever. Specifies what sources to search.",
            },
            needs_artifact: {
              type: "boolean" as const,
              description:
                "True if this step should produce a persistent Artifact (document, report, memo).",
            },
            optional: {
              type: "boolean" as const,
              description:
                "True if the run can succeed even if this step fails.",
            },
            depends_on: {
              type: "array" as const,
              items: { type: "number" as const },
              description:
                "0-based indices of steps this step depends on. Empty if no dependencies.",
            },
          },
        },
      },
    },
  },
};

/**
 * Tool for direct chat responses (no plan needed).
 */
export const RESPOND_TOOL = {
  name: "text_response" as const,
  description:
    "Respond directly to the user without creating a plan. Use for simple conversational messages, greetings, confirmations, and factual answers.",
  input_schema: {
    type: "object" as const,
    required: ["text"] as const,
    properties: {
      text: {
        type: "string" as const,
        description: "The response text to send to the user.",
      },
    },
  },
};

/**
 * Tool for requesting a third-party app connection inline.
 * The model picks this when the user wants an action on an app that is NOT
 * present in the user's connected actions. The orchestrator will surface
 * an inline "Connect <app>" card in the chat — the user authorizes once,
 * then re-asks; no need to leave the conversation.
 */
export const REQUEST_CONNECTION_TOOL = {
  name: "request_connection" as const,
  description:
    "Use this ONLY when the user explicitly wants to perform an action through a third-party service (Slack, Notion, GitHub, …) that they have NOT yet connected. Picks the user-facing OAuth prompt directly inside the chat. Do NOT use this for read-only/Google data the user already has connected.",
  input_schema: {
    type: "object" as const,
    required: ["app", "reason"] as const,
    properties: {
      app: {
        type: "string" as const,
        description:
          "The Composio app slug (lowercase). Examples: slack, notion, googlecalendar, github, hubspot, salesforce, linear, jira.",
      },
      reason: {
        type: "string" as const,
        description:
          "One-sentence French message explaining why we need this connection (e.g. 'Pour envoyer ce message, j'ai besoin d'accéder à ton Slack.'). Shown verbatim above the connect button.",
      },
    },
  },
};

// ── Dynamic system prompt for the AI pipeline ───────────────

interface AgentSystemPromptOpts {
  composioTools: DiscoveredTool[];
  hasGoogle: boolean;
  userDataContext?: string;
  surface?: string;
}

/**
 * System prompt for the streamText-based AI pipeline.
 *
 * Unlike the planner prompt (which decomposes into agent steps), this
 * prompt drives a single agentic loop that can directly call Composio
 * tools. It lists only the tools the user has actually connected.
 */
export function buildAgentSystemPrompt(opts: AgentSystemPromptOpts): string {
  const { composioTools, hasGoogle, userDataContext, surface } = opts;

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const connectedApps = [...new Set(composioTools.map((t) => t.app))];
  const googleSection = hasGoogle
    ? "✅ Google (Gmail, Drive, Calendar) — données injectées dans le contexte si disponibles"
    : "❌ Google non connecté";

  const composioSection =
    connectedApps.length > 0
      ? `✅ Composio apps connectées : ${connectedApps.join(", ")}\n   ${composioTools.length} action(s) disponible(s)`
      : "❌ Aucune app Composio connectée";

  const toolListSection =
    composioTools.length > 0
      ? `\n\nACTIONS DISPONIBLES :\n${composioTools
          .slice(0, 60)
          .map((t) => `- ${t.name} : ${t.description.slice(0, 100)}`)
          .join("\n")}${composioTools.length > 60 ? `\n(+${composioTools.length - 60} autres actions)` : ""}`
      : "";

  const dataSection = userDataContext
    ? `\n\nCONTEXTE UTILISATEUR (données temps réel) :\n${userDataContext}`
    : "";

  const surfaceNote = surface ? `\nSurface active : ${surface}` : "";

  return `Tu es Hearst, un assistant exécutif intelligent pour les professionnels des médias.
Aujourd'hui : ${today}${surfaceNote}

PROVIDERS CONNECTÉS :
${googleSection}
${composioSection}${toolListSection}${dataSection}

RÈGLES :
1. Utilise les outils disponibles pour agir directement — ne décris pas ce que tu ferais, fais-le.
2. ACTIONS D'ÉCRITURE (envoyer, créer, modifier, supprimer) — protocole obligatoire en 2 étapes :
   a. Appelle l'outil avec \`_preview: true\` (valeur par défaut) → l'outil retourne un draft formaté sans exécuter.
   b. Présente ce draft à l'utilisateur et attends une confirmation explicite ("confirmer", "oui", "yes", "go", "envoie", "fais-le").
   c. Seulement après confirmation : rappelle l'outil avec \`_preview: false\` pour exécuter réellement.
   JAMAIS appeler un outil d'écriture avec \`_preview: false\` sans confirmation explicite de l'utilisateur.
3. Si l'utilisateur demande une action via une app NON connectée (ex. Slack, Notion, GitHub, Jira…) : appelle IMMÉDIATEMENT l'outil \`request_connection\` avec le slug de l'app et une phrase expliquant pourquoi. Ne tente PAS de répondre par texte — utilise le tool.
4. AUTOMATISATIONS RÉCURRENTES : si l'utilisateur demande qu'une tâche soit exécutée automatiquement à intervalle régulier ("tous les matins", "chaque vendredi à 17h", "every day at 9am"…), appelle \`create_scheduled_mission\` avec le même protocole en 2 étapes :
   a. \`_preview: true\` → retourne un draft de la mission.
   b. Après confirmation utilisateur → \`_preview: false\` → la mission est créée.
   N'appelle PAS ce tool pour une tâche unique ou ponctuelle.
5. Réponds en français sauf si la demande est en anglais.
6. Sois concis dans les réponses conversationnelles, complet dans les livrables.`;
}
