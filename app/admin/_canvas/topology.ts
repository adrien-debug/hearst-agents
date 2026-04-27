/**
 * Canvas topology — single source of truth for node positions + edges.
 *
 * Maps the runtime pipeline (lib/engine/orchestrator/index.ts) onto a
 * deterministic SVG layout. Coordinates are absolute within the canvas
 * viewBox (0 0 1100 600).
 *
 * Adding a stage? Add it here, then map the relevant SSE event types in
 * event-reducer.ts. Visual rules / colors come from store.ts (NodeState).
 */

export type NodeId =
  | "entry"
  | "router"
  | "safety"
  | "intent"
  | "preflight"
  | "userdata"
  | "tools"
  | "agent"
  | "research"
  | "pipeline"
  | "complete";

export type SatelliteId = "memory" | "cost" | "logs" | "sse";

export interface CanvasNode {
  id: NodeId;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  toggleable?: boolean;
  flagKey?: string;
  fileHint: string;
  /** Paragraphe court — ce que fait ce stage exactement. */
  description: string;
  /** Inputs principaux du stage (court, max 6 mots). */
  inputs: string;
  /** Outputs / side-effects du stage (court). */
  outputs: string;
  /** SSE event types qui font passer ce node en `active` ou `success`. */
  events: string[];
  /** Branchements possibles depuis ce node (texte humain). */
  branches?: string[];
}

export interface CanvasSatellite {
  id: SatelliteId;
  label: string;
  x: number;
  y: number;
}

export interface CanvasEdge {
  id: string;
  from: NodeId;
  to: NodeId;
  branch?: "research" | "retrieval" | "pipeline" | "agent";
}

export const VIEWBOX = { width: 1500, height: 600 } as const;

export const NODE_SIZE = { w: 168, h: 80 } as const;

// Y-axis canon: top branch / main row / bottom branch
const Y_TOP = 180;
const Y_MID = 320;
const Y_BOT = 460;

// 8 columns, 180px gap between most nodes (final gap tighter to anchor `complete`).
const X = [110, 300, 490, 680, 870, 1060, 1250, 1400] as const;

export const NODES: CanvasNode[] = [
  {
    id: "entry",
    label: "Entrée",
    sublabel: "HTTP",
    x: X[0],
    y: Y_MID,
    fileHint: "app/api/orchestrate/route.ts",
    description:
      "Reçoit le POST /api/orchestrate, résout la session NextAuth (scope canonique : userId + tenantId + workspaceId), valide le body { message, conversation_id?, surface?, history? } puis lance orchestrateV2 dans un ReadableStream SSE.",
    inputs: "POST + cookie session",
    outputs: "ReadableStream SSE (text/event-stream)",
    events: ["run_started"],
    branches: ["→ Routeur capability (toujours)"],
  },
  {
    id: "router",
    label: "Routeur",
    sublabel: "capability",
    x: X[1],
    y: Y_MID,
    fileHint: "lib/capabilities/router.ts",
    description:
      "Map message + surface vers un CapabilityScope (domain, retrievalMode, providers requis, allowedTools, toolContext). Détermine ensuite l'ExecutionDecision (mode : direct_answer / tool_call / workflow / custom_agent / managed_agent + backend).",
    inputs: "message, surface, focal context",
    outputs: "CapabilityScope + ExecutionDecision",
    events: ["execution_mode_selected"],
    branches: ["→ Garde-fou (toujours)"],
  },
  {
    id: "safety",
    label: "Garde-fou",
    sublabel: "safety gate",
    x: X[2],
    y: Y_MID,
    toggleable: true,
    flagKey: "safety_gate_enabled",
    fileHint: "lib/engine/orchestrator/safety-gate.ts",
    description:
      "Refuse pré-LLM les intents hostiles (violence, harcèlement, illégal), les tentatives d'exfil de prompt système (« reveal your system prompt », « ignore previous instructions »), et les actions de masse (>50 destinataires = refuse, 11-50 = clarify). Cap ON par défaut, désactivable via le feature flag safety_gate_enabled.",
    inputs: "message + flag tenant",
    outputs: "verdict { ok | refuse | clarify }",
    events: ["capability_blocked", "orchestrator_log (Safety gate refuse|clarify)"],
    branches: [
      "ok → Détection intents",
      "refuse → text_delta + run_completed",
      "clarify → text_delta + run_completed",
    ],
  },
  {
    id: "intent",
    label: "Intents",
    sublabel: "détection pré-LLM",
    x: X[3],
    y: Y_MID,
    fileHint: "lib/engine/orchestrator/{write,schedule,research}-intent.ts",
    description:
      "Quatre détecteurs heuristiques en parallèle : isWriteIntent (envoyer/créer/supprimer), isScheduleIntent (« tous les matins », « chaque vendredi »), isResearchIntent / isReportIntent (« cherche », « rapport sur »), multiStepIntent (« puis », « ensuite »). Le résultat injecte des directives prioritaires dans _userDataContext et active bypassRetrieval pour court-circuiter la lecture synthétique.",
    inputs: "message",
    outputs: "flags { write, schedule, research, multistep } + directives",
    events: ["—  (pré-LLM, pas d'event SSE direct)"],
    branches: [
      "schedule → directive create_scheduled_mission",
      "write|multistep → bypass synthetic retrieval",
      "research → branche Research deterministic",
    ],
  },
  {
    id: "preflight",
    label: "Préflight",
    sublabel: "providers",
    x: X[4],
    y: Y_TOP,
    fileHint: "lib/connectors/control-plane/preflight.ts",
    description:
      "Vérifie que les providers requis par le scope ont des tokens OAuth valides. Si l'utilisateur a explicitement nommé l'app (« envoie un Slack ») et qu'elle n'est pas connectée → émet app_connect_required (carte OAuth inline). Si le routing l'a juste inféré sans mention explicite → fallthrough vers le pipeline IA (le model peut clarifier).",
    inputs: "providers requis, scope, userId",
    outputs: "carte OAuth | fallthrough",
    events: ["app_connect_required"],
    branches: [
      "providers ok → Surface outils",
      "explicite + non connecté → carte connect + run_completed",
      "inféré + non connecté → fallthrough Surface outils",
    ],
  },
  {
    id: "userdata",
    label: "Données user",
    sublabel: "context Google",
    x: X[4],
    y: Y_BOT,
    fileHint: "lib/connectors/data-retriever.ts",
    description:
      "Lecture native Calendar/Gmail/Drive via OAuth direct (pas via Composio). Active si Google connecté ET shouldInjectUserData(scope, message). Skip explicite si skipUserData=true (schedule intent). Le résultat formaté est injecté dans le system prompt sous CONTEXTE UTILISATEUR.",
    inputs: "Google access token, scope",
    outputs: "formattedForLLM (résumé Calendar+Gmail+Drive)",
    events: ["tool_call_started/completed (data_retrieve_*)"],
    branches: ["→ Surface outils"],
  },
  {
    id: "tools",
    label: "Surface outils",
    sublabel: "Composio + meta",
    x: X[5],
    y: Y_MID,
    fileHint: "lib/connectors/composio/discovery.ts + to-ai-tools.ts",
    description:
      "Discovery par user via composio.tools.get(userId, { toolkits, limit }). Filtré par domaine via filterToolsByDomain (cap 40 outils). Ajoute deux meta-tools : request_connection (carte OAuth inline) et create_scheduled_mission (preview/confirm). Les write-actions sont injectées avec un paramètre _preview pour forcer le pattern 2-étapes.",
    inputs: "userId, domain, toolkits ACTIVE",
    outputs: "AiToolMap { tools + request_connection + scheduler }",
    events: ["tool_surface"],
    branches: [
      "mode custom_agent → Agent custom",
      "research detected → Research deterministic",
      "défaut → AI pipeline streamText",
    ],
  },
  {
    id: "agent",
    label: "Agent custom",
    sublabel: "informational",
    x: X[6],
    y: Y_TOP,
    fileHint: "lib/agents/agent-selector.ts",
    description:
      "Sélection d'un agent dédié (toolContext-based) pour mode CUSTOM_AGENT. Aujourd'hui purement informational : surface l'identité agent dans le right panel UI. L'exécution réelle continue toujours via streamText (AI pipeline) — il n'y a plus d'agent runtime séparé après la suppression du planner+executor.",
    inputs: "toolContext",
    outputs: "agent_selected event",
    events: ["agent_selected"],
    branches: ["→ AI pipeline (toujours)"],
  },
  {
    id: "research",
    label: "Research",
    sublabel: "déterministe",
    x: X[6],
    y: Y_MID,
    fileHint: "lib/engine/orchestrator/run-research-report.ts",
    description:
      "Path déterministe pour intents recherche/rapport (« cherche », « fais-moi un rapport sur »). Pas de streamText : web search → structuration → asset_generated avec PDF optionnel via generatePdfArtifact. Output tier détecté (brief / report) selon longueur attendue.",
    inputs: "message, scope, threadId",
    outputs: "asset (brief|report) + focal_object_ready",
    events: ["step_started (research)", "asset_generated", "focal_object_ready"],
    branches: ["→ Run terminé"],
  },
  {
    id: "pipeline",
    label: "AI pipeline",
    sublabel: "streamText",
    x: X[6],
    y: Y_BOT,
    fileHint: "lib/engine/orchestrator/ai-pipeline.ts",
    description:
      "streamText() Anthropic claude-sonnet-4-6 avec system prompt dynamique (LECTURE / ACTIONS séparées), tool map (Composio + request_connection + create_scheduled_mission), stopWhen=stepCountIs(10), maxOutputTokens=8000, temperature=0.3. Auto-trigger app_connect_required sur AUTH_REQUIRED. Persiste turn structuré (user + assistant + tool calls/results) pour cross-turn confirmation.",
    inputs: "system prompt + messages + AiToolMap",
    outputs: "text_delta stream + tool calls",
    events: ["tool_call_started", "tool_call_completed", "text_delta", "app_connect_required"],
    branches: [
      "tool call → exécution Composio ou meta tool",
      "stream end → Run terminé",
    ],
  },
  {
    id: "complete",
    label: "Run terminé",
    sublabel: "complete | failed",
    x: X[7],
    y: Y_MID,
    fileHint: "lib/engine/runtime/engine + state/adapter.ts",
    description:
      "Termine le run : engine.complete() ou engine.fail(reason), persistance run_logs + runs.status, cleanup eventBus + SSE. Cost tracker enregistre input_tokens / output_tokens / tool_calls. La memory écrit le tour structuré (appendModelMessages) pour que le prochain message « confirmer » ait les tool args originaux.",
    inputs: "engine state final",
    outputs: "run_completed | run_failed + persist",
    events: ["run_completed", "run_failed"],
    branches: ["→ fin de stream SSE"],
  },
];

// Satellites removed in V1 — they were decorative noise. If we re-introduce
// them, expose interactive metrics (token count, retry stats) rather than
// static dots.
export const SATELLITES: CanvasSatellite[] = [];

export const EDGES: CanvasEdge[] = [
  { id: "entry-router", from: "entry", to: "router" },
  { id: "router-safety", from: "router", to: "safety" },
  { id: "safety-intent", from: "safety", to: "intent" },
  { id: "intent-preflight", from: "intent", to: "preflight" },
  { id: "intent-userdata", from: "intent", to: "userdata" },
  { id: "preflight-tools", from: "preflight", to: "tools" },
  { id: "userdata-tools", from: "userdata", to: "tools" },
  { id: "tools-agent", from: "tools", to: "agent", branch: "agent" },
  { id: "tools-research", from: "tools", to: "research", branch: "research" },
  { id: "tools-pipeline", from: "tools", to: "pipeline", branch: "pipeline" },
  { id: "agent-complete", from: "agent", to: "complete" },
  { id: "research-complete", from: "research", to: "complete" },
  { id: "pipeline-complete", from: "pipeline", to: "complete" },
];

const NODE_BY_ID = new Map<NodeId, CanvasNode>(NODES.map((n) => [n.id, n]));

export function getNode(id: NodeId): CanvasNode {
  const node = NODE_BY_ID.get(id);
  if (!node) throw new Error(`Unknown node: ${id}`);
  return node;
}

/** Right-edge port (out) and left-edge port (in) of a node center. */
export function ports(node: CanvasNode) {
  return {
    out: { x: node.x + NODE_SIZE.w / 2, y: node.y },
    in: { x: node.x - NODE_SIZE.w / 2, y: node.y },
  };
}

/** Cubic Bézier path string between two points, horizontal control handles. */
export function bezierPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
): string {
  const dx = Math.max(40, (b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}
