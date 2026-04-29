/**
 * Canvas topology — source de vérité unique pour les positions des nœuds et les edges.
 *
 * Mappe le pipeline runtime (lib/engine/orchestrator/index.ts) sur un layout SVG
 * déterministe (flux horizontal gauche → droite). Les coordonnées sont absolues
 * dans le viewBox du canvas.
 */

export type NodeId =
  | "entry"
  | "router"
  | "safety"
  | "intent"
  | "preflight"
  | "tools"
  | "agent"
  | "research"
  | "pipeline"
  | "complete";

export type StageKind =
  | "entry"
  | "router"
  | "gate"
  | "intent"
  | "check"
  | "tools"
  | "search"
  | "llm"
  | "agent"
  | "complete";

export interface CanvasNode {
  id: NodeId;
  kind: StageKind;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  toggleable?: boolean;
  flagKey?: string;
  fileHint: string;
  description: string;
  inputs: string;
  outputs: string;
  events: string[];
  branches?: string[];
}

export interface CanvasEdge {
  id: string;
  from: NodeId;
  to: NodeId;
  branch?: "research" | "retrieval" | "pipeline" | "agent";
  ports?: { out: PortDir; in: PortDir };
}

export const VIEWBOX = { width: 1920, height: 1080 } as const;

export const NODE_SIZE = { w: 220, h: 180 } as const;

const Y_TOP = 260;
const Y_MID = 540;
const Y_BOT = 820;

const X = [130, 370, 610, 850, 1090, 1330, 1570, 1810] as const;

export const KIND_COLOR: Record<StageKind, string> = {
  entry: "var(--cykan)",
  router: "var(--cykan)",
  gate: "var(--warn)",
  intent: "var(--cykan)",
  check: "var(--cykan)",
  tools: "var(--cykan)",
  search: "var(--accent-llm)",
  llm: "var(--accent-llm)",
  agent: "var(--accent-agent)",
  complete: "var(--color-success)",
};

export const PIPELINE_GRID_STEP_PX = 40 as const;
export const PIPELINE_DOT_STEP_PX = 20 as const;

export const NODES: CanvasNode[] = [
  {
    id: "entry",
    kind: "entry",
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
    kind: "router",
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
    kind: "gate",
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
    kind: "intent",
    label: "Intents",
    sublabel: "détection pré-LLM",
    x: X[3],
    y: Y_MID,
    fileHint: "lib/engine/orchestrator/{schedule,research}-intent.ts",
    description:
      "Deux détecteurs heuristiques pré-LLM : isScheduleIntent (« tous les matins », « chaque vendredi ») injecte une directive prioritaire dans le system prompt pour forcer create_scheduled_mission ; isResearchIntent / isReportIntent (« cherche », « rapport sur ») route vers le path déterministe research. Toutes les autres intents (write, lecture, multi-étapes) passent par le pipeline IA — c'est au model de choisir les bons tools.",
    inputs: "message",
    outputs: "flags { schedule, research } + directive optionnelle",
    events: ["— (pré-LLM, pas d'event SSE direct)"],
    branches: [
      "schedule → scheduleDirective injectée dans le prompt",
      "research → branche Research deterministic",
      "défaut → Préflight + Surface outils",
    ],
  },
  {
    id: "preflight",
    kind: "check",
    label: "Préflight",
    sublabel: "providers",
    x: X[4],
    y: Y_MID,
    fileHint: "lib/connectors/control-plane/preflight.ts",
    description:
      "Vérifie que les providers requis par le scope ont des tokens OAuth valides. Si l'utilisateur a explicitement nommé l'app (« envoie un Slack ») et qu'elle n'est pas connectée → émet app_connect_required (carte OAuth inline). Si le routing l'a juste inféré sans mention explicite → fallthrough vers le pipeline IA (le model peut clarifier ou appeler request_connection).",
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
    id: "tools",
    kind: "tools",
    label: "Surface outils",
    sublabel: "tiers + meta",
    x: X[5],
    y: Y_MID,
    fileHint: "lib/connectors/composio/discovery.ts + to-ai-tools.ts",
    description:
      "Discovery par user via composio.tools.get(userId, { toolkits, limit: 100 }). Filtré par domaine via filterToolsByDomain (cap 40 outils). C'est ICI que le model trouve les actions de lecture ET d'écriture (gmail_fetch, slack_send, etc.) — il n'y a plus de pré-fetch orchestrator. Ajoute deux meta-tools : request_connection (carte OAuth inline) et create_scheduled_mission (preview/confirm). Les write-actions reçoivent un paramètre _preview pour forcer le pattern 2-étapes.",
    inputs: "userId, domain, toolkits ACTIVE",
    outputs: "AiToolMap { tools + request_connection + scheduler }",
    events: ["tool_surface"],
    branches: [
      "mode custom_agent → Agent custom",
      "défaut → AI pipeline streamText",
    ],
  },
  {
    id: "research",
    kind: "search",
    label: "Research",
    sublabel: "déterministe",
    x: X[6],
    y: Y_TOP,
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
    kind: "llm",
    label: "AI pipeline",
    sublabel: "streamText",
    x: X[6],
    y: Y_MID,
    fileHint: "lib/engine/orchestrator/ai-pipeline.ts",
    description:
      "streamText() Anthropic claude-sonnet-4-6 avec system prompt unifié (une seule section OUTILS read+write), tool map (provider tools + request_connection + create_scheduled_mission), stopWhen=stepCountIs(10), maxOutputTokens=8000, temperature=0.3. Quand le model a besoin d'une donnée tierce, il appelle l'outil correspondant (gmail_fetch_emails, googlecalendar_events_list, etc.) — c'est lui qui décide. Auto-trigger app_connect_required sur AUTH_REQUIRED. Sentinel refusalPattern logge si le model émet une variante de refus textuel au lieu d'appeler request_connection.",
    inputs: "system prompt + messages + AiToolMap",
    outputs: "text_delta stream + tool calls",
    events: ["tool_call_started", "tool_call_completed", "text_delta", "app_connect_required"],
    branches: [
      "tool call → exécution provider ou meta tool",
      "stream end → Run terminé",
    ],
  },
  {
    id: "agent",
    kind: "agent",
    label: "Agent custom",
    sublabel: "informational",
    x: X[6],
    y: Y_BOT,
    fileHint: "lib/agents/agent-selector.ts",
    description:
      "Sélection d'un agent dédié (toolContext-based) pour mode CUSTOM_AGENT. Aujourd'hui purement informational : surface l'identité agent dans le right panel UI. L'exécution réelle continue toujours via streamText (AI pipeline) — il n'y a plus d'agent runtime séparé après la suppression du planner+executor.",
    inputs: "toolContext",
    outputs: "agent_selected event",
    events: ["agent_selected"],
    branches: ["→ AI pipeline (toujours)"],
  },
  {
    id: "complete",
    kind: "complete",
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

export const EDGES: CanvasEdge[] = [
  { id: "entry-router", from: "entry", to: "router" },
  { id: "router-safety", from: "router", to: "safety" },
  { id: "safety-intent", from: "safety", to: "intent" },
  { id: "intent-preflight", from: "intent", to: "preflight" },
  { id: "intent-research", from: "intent", to: "research", branch: "research" },
  { id: "preflight-tools", from: "preflight", to: "tools" },
  { id: "tools-agent", from: "tools", to: "agent", branch: "agent" },
  { id: "tools-research", from: "tools", to: "research", branch: "research" },
  { id: "tools-pipeline", from: "tools", to: "pipeline", branch: "pipeline" },
  { id: "agent-complete",    from: "agent",    to: "complete", ports: { out: "right", in: "bottom" } },
  { id: "research-complete", from: "research", to: "complete", ports: { out: "right", in: "top"    } },
  { id: "pipeline-complete", from: "pipeline", to: "complete" },
];

const NODE_BY_ID = new Map<NodeId, CanvasNode>(NODES.map((n) => [n.id, n]));

export function getNode(id: NodeId): CanvasNode {
  const node = NODE_BY_ID.get(id);
  if (!node) throw new Error(`Unknown node: ${id}`);
  return node;
}

export type PortDir = "right" | "left" | "top" | "bottom";

export function portAt(node: CanvasNode, dir: PortDir): { x: number; y: number } {
  const halfW = NODE_SIZE.w / 2;
  const halfH = NODE_SIZE.h / 2;
  switch (dir) {
    case "right":
      return { x: node.x + halfW, y: node.y };
    case "left":
      return { x: node.x - halfW, y: node.y };
    case "top":
      return { x: node.x, y: node.y - halfH };
    case "bottom":
      return { x: node.x, y: node.y + halfH };
  }
}

export function edgePorts(from: CanvasNode, to: CanvasNode): {
  out: PortDir;
  in: PortDir;
} {
  const sameY = Math.abs(from.y - to.y) < 2;
  if (sameY) return { out: "right", in: "left" };

  const goingUp = to.y < from.y;
  const goingRight = to.x > from.x;

  if (goingUp) {
    return goingRight
      ? { out: "top", in: "left" }
      : { out: "top", in: "right" };
  }
  return goingRight
    ? { out: "bottom", in: "left" }
    : { out: "bottom", in: "right" };
}

/**
 * Chemin orthogonal avec un seul coin arrondi.
 * Supporte les 4 cas canoniques du pipeline (right→left, top→left,
 * bottom→left, right→top, right→bottom).
 */
export function bezierPath(
  a: { x: number; y: number },
  aDir: PortDir,
  b: { x: number; y: number },
  bDir: PortDir,
): string {
  if (aDir === "right" && bDir === "left" && Math.abs(a.y - b.y) < 2) {
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }
  if (aDir === "top" || aDir === "bottom") {
    const r = Math.min(16, Math.abs(a.y - b.y) / 2, Math.abs(a.x - b.x) / 2);
    const dirX = b.x > a.x ? 1 : -1;
    const dirY = b.y > a.y ? 1 : -1;
    return `M ${a.x} ${a.y} L ${a.x} ${b.y - r * dirY} Q ${a.x} ${b.y} ${a.x + r * dirX} ${b.y} L ${b.x} ${b.y}`;
  }
  if (aDir === "right" && (bDir === "top" || bDir === "bottom")) {
    const r = Math.min(16, Math.abs(a.y - b.y) / 2, Math.abs(a.x - b.x) / 2);
    const dirX = b.x > a.x ? 1 : -1;
    const dirY = b.y > a.y ? 1 : -1;
    return `M ${a.x} ${a.y} L ${b.x - r * dirX} ${a.y} Q ${b.x} ${a.y} ${b.x} ${a.y + r * dirY} L ${b.x} ${b.y}`;
  }
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}
