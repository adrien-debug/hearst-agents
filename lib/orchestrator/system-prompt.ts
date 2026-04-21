/**
 * Orchestrator — System prompt + tool definitions.
 *
 * The Orchestrator receives a user request and produces a structured Plan.
 * It NEVER executes work directly — it decomposes and delegates.
 */

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
L'utilisateur a Google connecté (Drive + Gmail). Quand il demande :
- un document, fichier, résumé de fichier → KnowledgeRetriever avec retrieval_mode: "documents"
- ses emails, messages, résumé d'emails → KnowledgeRetriever avec retrieval_mode: "messages"
Tu DOIS TOUJOURS créer un plan avec au moins 1 step KnowledgeRetriever dans ces cas.
Ne réponds JAMAIS directement via text_response si la demande implique des données utilisateur.

HEURISTIQUE DE COMPLEXITÉ :
- Réponse directe (salut, merci, question simple) → 0 steps, répondre directement via text_response
- Question factuelle simple (quelle heure, quel jour) → 0 steps, répondre directement
- Recherche de fichier/email → 1 step minimum (KnowledgeRetriever avec retrieval_mode)
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
