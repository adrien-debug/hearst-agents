/**
 * Backend Selector — Routing intelligent multi-critères
 *
 * Analyse la requête utilisateur et sélectionne automatiquement
 * le backend optimal parmi tous les backends disponibles.
 *
 * Critères de décision:
 * - Complexité de la tâche (simple vs multi-step)
 * - Besoin de persistance (contexte conversationnel)
 * - Tools requis (search, code interpreter, custom tools)
 * - Vision/UI automation nécessaire
 * - Coût vs latence vs qualité
 * - Disponibilité des backends
 */

import type {
  AgentBackendV2,
  BackendCapabilities,
  BackendSelectionInput,
  BackendSelectionResult,
  HybridExecutionPlan,
  HybridStep,
  ManagedSessionConfig,
} from "./types";
import { BACKEND_CAPABILITIES } from "./types";

// ── Types ───────────────────────────────────────────────────

export interface SelectorConfig {
  /** Priorité: "cost" | "speed" | "quality" | "balanced" (défaut) */
  priority?: "cost" | "speed" | "quality" | "balanced";
  /** Budget max en USD (approximatif) */
  maxCostUsd?: number;
  /** Timeout max en ms */
  maxLatencyMs?: number;
  /** Forcer un backend spécifique (désactive la sélection) */
  forceBackend?: string;
  /** Liste des backends disponibles (défaut: tous) */
  availableBackends?: string[];
}

export interface TaskAnalysis {
  /** Complexité estimée 0-100 */
  complexity: number;
  /** Nécessite un contexte persistant */
  needsPersistence: boolean;
  /** Nécessite des tools */
  needsTools: boolean;
  /** Nécessite la recherche de fichiers */
  needsFileSearch: boolean;
  /** Nécessite l'exécution de code */
  needsCodeInterpreter: boolean;
  /** Nécessite la vision (images) */
  needsVision: boolean;
  /** Nécessite le contrôle UI (clics, scroll) */
  needsComputerUse: boolean;
  /** Est une simple question/réponse */
  isSimpleQa: boolean;
  /** Est une conversation multi-turn */
  isConversation: boolean;
  /** Nécessite des données temps réel */
  needsRealtimeData: boolean;
}

export interface BackendScore {
  backend: AgentBackendV2;
  score: number;
  confidence: number; // 0-1
  reasons: string[];
  estimatedCostUsd: number;
  estimatedLatencyMs: number;
  warnings: string[];
}

// ── Keywords pour l'analyse ─────────────────────────────────

const KEYWORDS = {
  fileSearch: [
    "fichier", "file", "document", "doc", "pdf", "recherche", "search",
    "trouve", "find", "liste", "list", "dossier", "folder",
  ],
  codeInterpreter: [
    "code", "python", "javascript", "calcule", "calculate", "compute",
    "analyse", "analyze", "data", "données", "csv", "excel", "json",
    "math", "equation", "plot", "graph", "chart",
  ],
  vision: [
    "image", "photo", "picture", "screenshot", "capture", "écran",
    "screen", "voir", "look", "visual", "visuel", "dessin", "drawing",
  ],
  computerUse: [
    "clique", "click", "navigue", "navigate", "ouvre", "open", "scroll",
    "tape", "type", "remplis", "fill", "form", "formulaire", "ui",
    "bouton", "button", "test", "automate", "automation",
  ],
  simpleQa: [
    "quoi", "what", "qui", "who", "quand", "when", "où", "where",
    "pourquoi", "why", "comment", "how", "?", "explain", "explique",
  ],
  conversation: [
    "conversation", "discute", "chat", "parle", "talk", "continue",
    "souviens", "remember", "contexte", "context", "avant", "before",
  ],
  realtime: [
    "temps réel", "realtime", "actualité", "news", "aujourd'hui", "today",
    "météo", "weather", "bourse", "stock", "prix", "price",
  ],
};

// ── Analyse de la requête ───────────────────────────────────

/**
 * Analyse la requête utilisateur pour détecter les besoins.
 */
export function analyzeTask(
  input: BackendSelectionInput,
  history?: Array<{ role: string; content: string }>,
): TaskAnalysis {
  const content = input.prompt.toLowerCase();
  const hasHistory = (history?.length ?? 0) > 0;

  // Détection par keywords
  const hasKeywords = (keywords: string[]): boolean =>
    keywords.some(kw => content.includes(kw.toLowerCase()));

  const needsFileSearch = hasKeywords(KEYWORDS.fileSearch);
  const needsCodeInterpreter = hasKeywords(KEYWORDS.codeInterpreter);
  const needsVision = hasKeywords(KEYWORDS.vision);
  const needsComputerUse = hasKeywords(KEYWORDS.computerUse);
  const isSimpleQa = hasKeywords(KEYWORDS.simpleQa) && !hasHistory;
  const isConversation = hasKeywords(KEYWORDS.conversation) || hasHistory;
  const needsRealtimeData = hasKeywords(KEYWORDS.realtime);

  // Détection de la complexité
  const complexity = calculateComplexity(content, {
    needsFileSearch,
    needsCodeInterpreter,
    needsVision,
    needsComputerUse,
    isConversation,
  });

  // Besoin de persistance si conversation ou multi-step
  const needsPersistence = isConversation || complexity > 50;

  // Besoin de tools si file search, code interpreter, ou computer use
  const needsTools = needsFileSearch || needsCodeInterpreter || needsComputerUse;

  return {
    complexity,
    needsPersistence,
    needsTools,
    needsFileSearch,
    needsCodeInterpreter,
    needsVision,
    needsComputerUse,
    isSimpleQa,
    isConversation,
    needsRealtimeData,
  };
}

function calculateComplexity(
  content: string,
  features: {
    needsFileSearch: boolean;
    needsCodeInterpreter: boolean;
    needsVision: boolean;
    needsComputerUse: boolean;
    isConversation: boolean;
  },
): number {
  let score = 0;

  // Base sur la longueur
  score += Math.min(content.length / 50, 20);

  // Features avancées augmentent la complexité
  if (features.needsFileSearch) score += 25;
  if (features.needsCodeInterpreter) score += 20;
  if (features.needsVision) score += 15;
  if (features.needsComputerUse) score += 30;
  if (features.isConversation) score += 10;

  // Détection de tâches multi-step
  const stepIndicators = [
    "puis", "then", "ensuite", "next", "après", "after",
    "d'abord", "first", "étape", "step", "phase",
  ];
  const steps = stepIndicators.filter(s => content.includes(s)).length;
  score += steps * 5;

  return Math.min(score, 100);
}

// ── Scoring des backends ────────────────────────────────────

/**
 * Score chaque backend selon les critères et la tâche.
 */
export function scoreBackends(
  analysis: TaskAnalysis,
  capabilities: Record<string, BackendCapabilities>,
  config: SelectorConfig,
): BackendScore[] {
  const scores: BackendScore[] = [];
  // Exclude hearst_runtime from automatic selection (it's for internal workflows, not LLM tasks)
  const allBackends = Object.keys(capabilities).filter(id => id !== "hearst_runtime");
  const available = config.availableBackends ?? allBackends;

  for (const backendId of available) {
    const cap = capabilities[backendId];
    if (!cap) continue;

    const score: BackendScore = {
      backend: backendId as AgentBackendV2,
      score: 0,
      confidence: 0,
      reasons: [],
      estimatedCostUsd: 0,
      estimatedLatencyMs: 0,
      warnings: [],
    };

    // === SCORING LOGIC ===

    // 1. Compatibilité features (0-40 points)
    let featureScore = 0;

    if (analysis.needsFileSearch && cap.supportsFileSearch) {
      featureScore += 20;
      score.reasons.push("✅ File search supported");
    } else if (analysis.needsFileSearch && !cap.supportsFileSearch) {
      featureScore -= 30;
      score.warnings.push("❌ Requires file search, not supported");
    }

    if (analysis.needsCodeInterpreter && cap.supportsCodeInterpreter) {
      featureScore += 15;
      score.reasons.push("✅ Code interpreter supported");
    } else if (analysis.needsCodeInterpreter && !cap.supportsCodeInterpreter) {
      featureScore -= 25;
      score.warnings.push("❌ Requires code interpreter, not supported");
    }

    if (analysis.needsComputerUse && cap.supportsComputerUse) {
      featureScore += 25;
      score.reasons.push("✅ Computer use supported");
    } else if (analysis.needsComputerUse && !cap.supportsComputerUse) {
      featureScore -= 35;
      score.warnings.push("❌ Requires computer use, not supported");
    }

    if (analysis.needsVision && cap.supportsVision) {
      featureScore += 10;
      score.reasons.push("✅ Vision supported");
    }

    if (analysis.needsPersistence && cap.supportsPersistence) {
      featureScore += 10;
      score.reasons.push("✅ Persistence supported");
    } else if (analysis.needsPersistence && !cap.supportsPersistence) {
      featureScore -= 15;
      score.warnings.push("⚠️ No persistence, context may be lost");
    }

    if (analysis.needsTools && cap.supportsTools) {
      featureScore += 10;
      score.reasons.push("✅ Tools supported");
    } else if (analysis.needsTools && !cap.supportsTools) {
      featureScore -= 15;
      score.warnings.push("⚠️ Tools required but not supported");
    }

    score.score += Math.max(featureScore, -40);

    // 2. Priorité utilisateur (0-30 points)
    const priority = config.priority ?? "balanced";
    switch (priority) {
      case "cost":
        if (cap.costLevel === "low") {
          score.score += 20;
          score.reasons.push("💰 Low cost (priority)");
        } else if (cap.costLevel === "medium") {
          score.score += 10;
        }
        break;
      case "speed":
        if (cap.latencyProfile === "fast") {
          score.score += 20;
          score.reasons.push("⚡ Fast latency (priority)");
        } else if (cap.latencyProfile === "medium") {
          score.score += 10;
        }
        break;
      case "quality":
        if (cap.reasoningLevel === "high") {
          score.score += 20;
          score.reasons.push("🧠 High quality (priority)");
        } else if (cap.reasoningLevel === "medium") {
          score.score += 10;
        }
        break;
      case "balanced":
        // Bonus équilibré
        if (cap.costLevel === "low" && cap.latencyProfile === "fast") {
          score.score += 15;
          score.reasons.push("⚖️ Balanced cost/speed");
        }
        break;
    }

    // 3. Complexité matching (0-20 points)
    if (analysis.complexity < 30 && cap.reasoningLevel === "low") {
      score.score += 15;
      score.reasons.push("🎯 Simple task → simple backend");
    } else if (analysis.complexity > 60 && cap.reasoningLevel === "high") {
      score.score += 15;
      score.reasons.push("🎯 Complex task → advanced backend");
    }

    // 4. Estimations
    score.estimatedCostUsd = estimateCost(analysis, cap);
    score.estimatedLatencyMs = estimateLatency(analysis, cap);

    // Vérifier les contraintes
    if (config.maxCostUsd && score.estimatedCostUsd > config.maxCostUsd) {
      score.score -= 25;
      score.warnings.push(`💸 May exceed cost limit ($${config.maxCostUsd})`);
    }
    if (config.maxLatencyMs && score.estimatedLatencyMs > config.maxLatencyMs) {
      score.score -= 25;
      score.warnings.push(`⏱️ May exceed latency limit (${config.maxLatencyMs}ms)`);
    }

    // 5. Calcul de confiance
    const hasWarnings = score.warnings.length;
    const hasPositives = score.reasons.length;
    score.confidence = Math.min(
      0.3 + (hasPositives * 0.15) - (hasWarnings * 0.1),
      0.95,
    );

    scores.push(score);
  }

  // Trier par score décroissant
  return scores.sort((a, b) => b.score - a.score);
}

function estimateCost(analysis: TaskAnalysis, cap: BackendCapabilities): number {
  // Estimation très approximative
  const baseCost = {
    low: 0.001,
    medium: 0.005,
    high: 0.02,
  }[cap.costLevel] ?? 0.005;

  const complexityMultiplier = 1 + (analysis.complexity / 100);
  return baseCost * complexityMultiplier;
}

function estimateLatency(analysis: TaskAnalysis, cap: BackendCapabilities): number {
  // Estimation en ms
  const baseLatency = {
    fast: 500,
    medium: 2000,
    slow: 5000,
  }[cap.latencyProfile] ?? 2000;

  const complexityMultiplier = 1 + (analysis.complexity / 200);
  return Math.round(baseLatency * complexityMultiplier);
}

// ── Sélection principale ────────────────────────────────────

/**
 * Sélectionne le meilleur backend pour la tâche.
 */
export function selectBackend(
  input: BackendSelectionInput,
  config: SelectorConfig = {},
  history?: Array<{ role: string; content: string }>,
): BackendSelectionResult {
  const startTime = Date.now();

  // Forcer un backend spécifique ?
  if (config.forceBackend) {
    const backendId = config.forceBackend as AgentBackendV2;
    const cap = BACKEND_CAPABILITIES[backendId];
    if (!cap) {
      throw new Error(`Forced backend "${config.forceBackend}" not found`);
    }

    return {
      selectedBackend: backendId,
      confidence: 1.0,
      reasoning: [`Backend forcé: ${backendId}`],
      estimatedCostUsd: 0,
      estimatedLatencyMs: 0,
      fallbackChain: [],
      routingDecision: "forced",
    };
  }

  // Analyser la tâche
  const analysis = analyzeTask(input, history);

  // Scorer les backends
  const scores = scoreBackends(analysis, BACKEND_CAPABILITIES, config);

  if (scores.length === 0) {
    throw new Error("No backends available");
  }

  // Sélectionner le meilleur
  const winner = scores[0];

  // Construire la chaîne de fallback (backends 2ème et 3ème choix)
  const fallbackChain = scores
    .slice(1, 3)
    .filter(s => s.score > 0)
    .map(s => s.backend);

  // Raisonnement
  const reasoning = [
    `🏆 Winner: ${winner.backend} (score: ${winner.score.toFixed(1)})`,
    ...winner.reasons,
    ...(winner.warnings.length > 0 ? ["⚠️ Warnings:", ...winner.warnings] : []),
    "",
    "📊 Analyse:",
    `  Complexité: ${analysis.complexity}/100`,
    `  Persistance: ${analysis.needsPersistence ? "oui" : "non"}`,
    `  Tools: ${analysis.needsTools ? "oui" : "non"}`,
    `  Vision: ${analysis.needsVision ? "oui" : "non"}`,
    "",
    "🥈 Alternatives:",
    ...scores.slice(1, 4).map(
      (s, i) => `  ${i + 2}. ${s.backend} (${s.score.toFixed(1)} pts)`
    ),
  ];

  return {
    selectedBackend: winner.backend,
    confidence: winner.confidence,
    reasoning,
    estimatedCostUsd: winner.estimatedCostUsd,
    estimatedLatencyMs: winner.estimatedLatencyMs,
    fallbackChain,
    routingDecision: "auto",
    _meta: {
      analysis,
      allScores: scores,
      decisionTimeMs: Date.now() - startTime,
    },
  };
}

// ── Hybrid Execution Planner ─────────────────────────────────

/**
 * Planifie une exécution hybride qui combine plusieurs backends.
 * Utile pour les tâches complexes qui nécessitent différentes capacités.
 */
export function planHybridExecution(
  input: BackendSelectionInput,
  config: SelectorConfig = {},
): HybridExecutionPlan {
  const analysis = analyzeTask(input);
  const scores = scoreBackends(analysis, BACKEND_CAPABILITIES, config);

  const steps: HybridStep[] = [];

  // Étape 1: Si file search nécessaire → commencer par Assistants V2
  if (analysis.needsFileSearch) {
    const assistant = scores.find(s =>
      BACKEND_CAPABILITIES[s.backend].supportsFileSearch
    );
    if (assistant) {
      steps.push({
        backend: assistant.backend,
        task: "file_search",
        input: { query: input.prompt },
        dependsOn: null,
      });
    }
  }

  // Étape 2: Si computer use nécessaire → exécuter
  if (analysis.needsComputerUse) {
    const computer = scores.find(s =>
      BACKEND_CAPABILITIES[s.backend].supportsComputerUse
    );
    if (computer) {
      steps.push({
        backend: computer.backend,
        task: "computer_use",
        input: { instruction: input.prompt },
        dependsOn: steps.length > 0 ? steps[steps.length - 1].backend : null,
      });
    }
  }

  // Étape 3: Réponse finale (synthesis)
  // Utiliser le meilleur backend restant ou Responses par défaut
  const remaining = scores.find(s =>
    !steps.some(step => step.backend === s.backend)
  );
  steps.push({
    backend: remaining?.backend ?? "openai_responses",
    task: "synthesis",
    input: { prompt: input.prompt },
    dependsOn: steps.length > 0 ? steps[steps.length - 1].backend : null,
  });

  return {
    steps,
    totalEstimatedCostUsd: steps.reduce(
      (sum, step) => sum + estimateCost(analysis, BACKEND_CAPABILITIES[step.backend]),
      0,
    ),
    totalEstimatedLatencyMs: steps.reduce(
      (sum, step) => sum + estimateLatency(analysis, BACKEND_CAPABILITIES[step.backend]),
      0,
    ),
    fallbackStrategy: "sequential", // ou "parallel"
  };
}

// ── Helper functions ────────────────────────────────────────

/**
 * Vérifie si un backend est disponible.
 */
export function isBackendAvailable(backendId: string): boolean {
  const cap = BACKEND_CAPABILITIES[backendId as AgentBackendV2];
  if (!cap) return false;

  // TODO: Ajouter des vérifications runtime (clés API, quotas, etc.)
  return true;
}

/**
 * Liste tous les backends disponibles avec leurs scores.
 */
export function listAvailableBackends(): Array<{
  id: string;
  name: string;
  available: boolean;
  capabilities: BackendCapabilities;
}> {
  return Object.entries(BACKEND_CAPABILITIES).map(([id, cap]) => ({
    id,
    name: cap.name,
    available: isBackendAvailable(id),
    capabilities: cap,
  }));
}

/**
 * Recommande un backend pour un use case spécifique.
 */
export function recommendFor(useCase: string): BackendSelectionResult {
  const useCaseLower = useCase.toLowerCase();

  const recommendations: Record<string, AgentBackendV2> = {
    "simple question": "openai_responses",
    "quick response": "openai_responses",
    "chat": "openai_assistants",
    "conversation": "openai_assistants",
    "file search": "openai_assistants",
    "code": "openai_assistants",
    "automation": "openai_computer_use",
    "testing": "openai_computer_use",
    "ui": "openai_computer_use",
    "vision": "openai_computer_use",
    "multimodal": "openai_assistants",
  };

  const backend = recommendations[useCaseLower] ?? "openai_responses";

  return {
    selectedBackend: backend,
    confidence: 0.8,
    reasoning: [`Use case "${useCase}" → ${backend}`],
    estimatedCostUsd: 0,
    estimatedLatencyMs: 0,
    fallbackChain: [],
    routingDecision: "recommended",
  };
}

// ── Test functions ──────────────────────────────────────────

export async function testSelector(): Promise<{
  ok: boolean;
  tests: Array<{ name: string; passed: boolean; result?: unknown; error?: string }>;
}> {
  const tests: Array<{ name: string; passed: boolean; result?: unknown; error?: string }> = [];

  const testCases = [
    {
      name: "Simple QA",
      input: { prompt: "What is the capital of France?" },
      expected: "openai_responses",
    },
    {
      name: "File search",
      input: { prompt: "Search for documents about climate change" },
      expected: "openai_assistants",
    },
    {
      name: "Code task",
      input: { prompt: "Calculate the fibonacci sequence in Python" },
      expected: "openai_assistants",
    },
    {
      name: "UI automation",
      input: { prompt: "Click the login button and fill the form" },
      expected: "openai_computer_use",
    },
    {
      name: "Multi-turn conversation",
      input: { prompt: "Let's discuss this project" },
      history: [{ role: "user", content: "Hello" }],
      expected: "openai_assistants", // or "anthropic_sessions" — both support persistence
    },
  ];

  for (const tc of testCases) {
    try {
      const result = selectBackend(tc.input, {}, tc.history);
      // For conversation, accept either openai_assistants or anthropic_sessions
      const isConversationPass = tc.name === "Multi-turn conversation" &&
        (result.selectedBackend === "openai_assistants" || result.selectedBackend === "anthropic_sessions");
      const passed = isConversationPass || result.selectedBackend === tc.expected;

      tests.push({
        name: tc.name,
        passed,
        result: {
          selected: result.selectedBackend,
          expected: tc.expected,
          confidence: result.confidence,
        },
      });
    } catch (error) {
      tests.push({
        name: tc.name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: tests.every(t => t.passed),
    tests,
  };
}

export async function testHybridPlanning(): Promise<{
  ok: boolean;
  plan?: HybridExecutionPlan;
  error?: string;
}> {
  try {
    const plan = planHybridExecution({
      prompt: "Search for sales data files, analyze them with code, then click through the dashboard",
    });

    return {
      ok: plan.steps.length >= 2,
      plan,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
