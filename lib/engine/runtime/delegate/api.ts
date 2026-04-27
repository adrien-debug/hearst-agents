/**
 * delegate() — Dispatches work to Capability Agents.
 *
 * KnowledgeRetriever with retrieval_mode "documents", "messages" or "structured_data"
 * calls real Google connectors first, then sends the raw data to
 * Claude for synthesis. All other agents use LLM-only execution.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RunEngine } from "../engine";
import type { DelegateInput, DelegateResult } from "./types";
import type { StepActor } from "../engine/types";
import { getTokens } from "@/lib/platform/auth/tokens";
import { searchDriveFiles, readDriveFileContent } from "@/lib/connectors/google/drive";
import { searchEmails as searchGmail } from "@/lib/connectors/google/gmail";
import { getUpcomingEvents } from "@/lib/connectors/google/calendar";
import { capabilityGuard } from "@/lib/capabilities/guard";
import type { Domain } from "@/lib/capabilities/taxonomy";

export async function delegate(
  engine: RunEngine,
  input: DelegateInput,
): Promise<DelegateResult> {
  const step = await engine.steps.create({
    run_id: engine.id,
    parent_step_id: input.parent_step_id ?? null,
    type: "delegate",
    actor: input.agent as StepActor,
    title: input.task.slice(0, 120),
    input: {
      task: input.task,
      context: input.context,
      expected_output: input.expected_output,
      retrieval_mode: input.retrieval_mode,
      artifacts_in: input.artifacts_in,
    },
  });

  await engine.steps.transition(step.id, "running");
  engine.events.emit({
    type: "step_started",
    run_id: engine.id,
    step_id: step.id,
    agent: input.agent as StepActor,
    title: input.task.slice(0, 120),
  });

  try {
    // ── Capability guard: validate agent for domain ──────────
    const guardDomain = input.context.capability_domain as Domain | undefined;
    const guardResult = capabilityGuard({
      agent: input.agent,
      task: input.task,
      domain: guardDomain,
    });

    if (!guardResult.allowed) {
      const msg = `Capability guard blocked: ${guardResult.reason}`;
      console.warn(`[Delegate] ${msg}`);
      engine.events.emit({
        type: "runtime_warning",
        run_id: engine.id,
        message: msg,
      });
      await engine.steps.fail(step.id, {
        code: "PERMISSION_DENIED",
        message: msg,
        retryable: false,
      });
      engine.events.emit({
        type: "step_failed",
        run_id: engine.id,
        step_id: step.id,
        error: msg,
      });
      return {
        status: "error",
        step_id: step.id,
        error: {
          code: "PERMISSION_DENIED",
          message: msg,
          retryable: false,
        },
      };
    }

    // Domain-specific specialized agents have been removed in favor of
    // Composio's per-user action discovery. All non-retrieval work routes
    // through the generic LLM-driven agent path; retrieval modes (documents
    // / messages / structured_data) still pull live Google data below.
    void guardResult;

    const result = await executeAgentSync(engine, step.id, input);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Agent execution failed";
    await engine.steps.fail(step.id, {
      code: "AGENT_FAILED",
      message: msg,
      retryable: false,
    });
    engine.events.emit({
      type: "step_failed",
      run_id: engine.id,
      step_id: step.id,
      error: msg,
    });
    return {
      status: "error",
      step_id: step.id,
      error: { code: "AGENT_FAILED", message: msg, retryable: false },
    };
  }
}

const AGENTS_WITH_WEB_SEARCH = new Set(["KnowledgeRetriever", "Analyst", "DocBuilder"]);

// ── Provider data fetching ───────────────────────────────────────

async function fetchProviderData(
  userId: string,
  task: string,
  retrievalMode: string | undefined,
  engine: RunEngine,
): Promise<{ providerData: string; providerUsed: string } | null> {
  if (retrievalMode === "documents") {
    return fetchDriveData(userId, task, engine);
  }
  if (retrievalMode === "messages") {
    return fetchGmailData(userId, task, engine);
  }
  if (retrievalMode === "structured_data") {
    return fetchCalendarData(userId, task);
  }
  return null;
}

async function fetchDriveData(
  userId: string,
  task: string,
  engine: RunEngine,
): Promise<{ providerData: string; providerUsed: string } | null> {
  void engine;
  try {
    const keywords = extractSearchKeywords(task);
    const files = await searchDriveFiles(userId, keywords, 5);

    if (files.length === 0) {
      return null; // Pas de données = pas d'injection
    }

    const file = files[0];
    let content: string;
    try {
      content = await readDriveFileContent(userId, file.id);
    } catch (readErr) {
      console.error("[Delegate/Drive] read error:", readErr);
      content = `[Erreur de lecture du fichier ${file.name}]`;
    }

    const truncated = content.slice(0, 8000);
    const providerData = [
      `[Google Drive] Fichier trouvé : "${file.name}" (${file.mimeType})`,
      `Dernière modification : ${file.modifiedTime}`,
      file.webViewLink ? `Lien : ${file.webViewLink}` : "",
      `\n--- Contenu du document ---\n${truncated}`,
      content.length > 8000 ? "\n[... contenu tronqué ...]" : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { providerData, providerUsed: "google_drive" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "not_authenticated" || msg === "token_revoked") {
      return {
        providerData: "[Google Drive] Accès non autorisé — veuillez reconnecter Google.",
        providerUsed: "google_drive",
      };
    }
    console.error("[Delegate/Drive] error:", msg);
    return null; // Error = silent fail
  }
}

async function fetchGmailData(
  userId: string,
  task: string,
  engine: RunEngine,
): Promise<{ providerData: string; providerUsed: string } | null> {
  void engine;
  try {
    const senderMatch = task.match(/(?:de|from)\s+(\w+)/i);
    const query = senderMatch ? `from:${senderMatch[1]}` : undefined;
    const emails = await searchGmail(userId, query, 10);

    if (emails.length === 0) {
      return null; // Pas de données = pas d'injection dans le prompt
    }

    const summaries = emails.map(
      (e, i) =>
        `Email ${i + 1}:\n  De: ${e.sender}\n  Sujet: ${e.subject}\n  Date: ${e.date}\n  Extrait: ${e.body.slice(0, 300)}`,
    );

    return {
      providerData: `[Gmail] ${emails.length} emails récents:\n\n${summaries.join("\n\n")}`,
      providerUsed: "gmail",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "not_authenticated" || msg === "token_revoked") {
      return {
        providerData: "[Gmail] Accès non autorisé — veuillez reconnecter votre compte Google.",
        providerUsed: "gmail",
      };
    }
    console.error("[Delegate/Gmail] error:", msg);
    return null; // Error = silent fail, no injection
  }
}

async function fetchCalendarData(
  userId: string,
  task: string,
): Promise<{ providerData: string; providerUsed: string } | null> {
  try {
    const days = /\b(mois|month)\b/i.test(task) ? 30 : 7;
    const events = await getUpcomingEvents(userId, days, 10);

    if (events.length === 0) {
      return {
        providerData: `[Google Calendar] Aucun événement trouvé sur les ${days} prochains jours.`,
        providerUsed: "google_calendar",
      };
    }

    const summaries = events.map((event, i) => {
      const time = event.isAllDay ? "Toute la journée" : `${event.startTime} → ${event.endTime}`;
      const location = event.location ? `\n  Lieu: ${event.location}` : "";
      const attendees = event.attendees && event.attendees.length > 0
        ? `\n  Participants: ${event.attendees.join(", ")}`
        : "";
      return `Événement ${i + 1}:\n  Titre: ${event.title}\n  Horaire: ${time}${location}${attendees}`;
    });

    return {
      providerData: `[Google Calendar] ${events.length} événement(s) à venir:\n\n${summaries.join("\n\n")}`,
      providerUsed: "google_calendar",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "not_authenticated" || msg === "token_revoked") {
      return {
        providerData: "[Google Calendar] Accès non autorisé — veuillez reconnecter votre compte Google.",
        providerUsed: "google_calendar",
      };
    }
    console.error("[Delegate/Calendar] error:", msg);
    return null;
  }
}

function extractSearchKeywords(task: string): string {
  const stopWords = new Set([
    "résume", "resume", "résumer", "summarize", "summary",
    "mon", "ma", "mes", "le", "la", "les", "un", "une", "des",
    "sur", "dans", "de", "du", "au", "en", "et", "ou", "à",
    "google", "drive", "gmail", "email", "emails", "document",
    "fichier", "file", "files", "derniers", "dernières", "récents",
    "donne", "moi", "donner", "cherche", "trouve", "lis", "lire",
  ]);

  return task
    .toLowerCase()
    .replace(/[^a-zàâäéèêëïîôùûüÿç0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .join(" ")
    .trim() || task.slice(0, 40);
}

// ── Core execution ───────────────────────────────────────────────

async function executeAgentSync(
  engine: RunEngine,
  stepId: string,
  input: DelegateInput,
): Promise<DelegateResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const userId = engine.getUserId();

  // ── Get connected providers for context ──
  const connectedProviders: string[] = [];
  try {
    const googleTokens = await getTokens(userId, "google");
    if (googleTokens?.accessToken) {
      connectedProviders.push("gmail", "drive", "calendar");
    }
    const slackTokens = await getTokens(userId, "slack");
    if (slackTokens?.accessToken) {
      connectedProviders.push("slack");
    }
    const notionTokens = await getTokens(userId, "notion");
    if (notionTokens?.accessToken) {
      connectedProviders.push("notion");
    }
  } catch {
    // Silently continue if token check fails
  }

  // ── Try real provider data first ──
  let providerPayload: { providerData: string; providerUsed: string } | null = null;

  if (input.agent === "KnowledgeRetriever" && input.retrieval_mode) {
    providerPayload = await fetchProviderData(userId, input.task, input.retrieval_mode, engine);
    if (providerPayload) {
      engine.events.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `Provider data fetched from ${providerPayload.providerUsed}`,
      });
    }
  }

  const systemPrompt = buildAgentPrompt(input.agent, input.expected_output, connectedProviders);

  const contextSummary = Object.entries(input.context)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");

  let userContent = contextSummary
    ? `${input.task}\n\n--- Context ---\n${contextSummary}`
    : input.task;

  if (providerPayload) {
    userContent += `\n\n--- Données réelles du provider (${providerPayload.providerUsed}) ---\n${providerPayload.providerData}`;
  }

  const useWebSearch = !providerPayload && AGENTS_WITH_WEB_SEARCH.has(input.agent);
  console.log(`[Delegate] agent=${input.agent} retrieval_mode=${input.retrieval_mode ?? "none"} provider=${providerPayload?.providerUsed ?? "none"} web_search=${useWebSearch}`);

  let text: string;
  let usageTokens = { input_tokens: 0, output_tokens: 0 };

  if (useWebSearch) {
    const response = await client.beta.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    });

    text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.Beta.BetaTextBlock).text)
      .join("\n");

    usageTokens = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
  } else {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    usageTokens = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
  }

  await engine.cost.track({
    input_tokens: usageTokens.input_tokens,
    output_tokens: usageTokens.output_tokens,
    tool_calls: providerPayload ? 1 : 0,
    latency_ms: 0,
  });

  await engine.steps.complete(stepId, { output: { content: text } });

  engine.events.emit({
    type: "text_delta",
    run_id: engine.id,
    delta: text,
  });
  engine.events.emit({
    type: "step_completed",
    run_id: engine.id,
    step_id: stepId,
    agent: input.agent as StepActor,
  });

  return {
    status: "success",
    step_id: stepId,
    data: {
      content: text,
      agent: input.agent,
      ...(providerPayload ? { providerUsed: providerPayload.providerUsed } : {}),
    },
    usage: usageTokens,
  };
}

function buildAgentPrompt(agent: string, expectedOutput: string, connectedProviders: string[] = []): string {
  const providerStatus = connectedProviders.length > 0
    ? `\n🔐 CONNECTEURS ACTIFS : ${connectedProviders.join(", ")}`
    : "\n🔐 Aucun connecteur actif";

  const gmailAccess = connectedProviders.includes("gmail")
    ? "\n✅ L'utilisateur EST CONNECTÉ à Gmail. Tu PEUX accéder à ses emails. Ne dis JAMAIS que tu n'as pas accès."
    : "";

  const driveAccess = connectedProviders.includes("drive")
    ? "\n✅ L'utilisateur EST CONNECTÉ à Google Drive. Tu PEUX accéder à ses fichiers."
    : "";

  const slackAccess = connectedProviders.includes("slack")
    ? "\n✅ L'utilisateur EST CONNECTÉ à Slack. Tu PEUX accéder à ses messages."
    : "";

  const base: Record<string, string> = {
    KnowledgeRetriever:
      `Tu es un agent de recherche d'information de HEARST OS.${providerStatus}${gmailAccess}${driveAccess}${slackAccess}\n\nQuand des données réelles de provider sont fournies, tu dois les utiliser comme source primaire. Analyse, synthétise et structure l'information de façon factuelle. Ne fabrique jamais d'information non présente dans les données.`,
    Analyst:
      "Tu es un analyste. Structure les données, identifie les patterns, produis des insights clairs et actionnables.",
    DocBuilder:
      "Tu es un rédacteur de documents. Produis un contenu complet, structuré avec des titres et sections, prêt à être exploité.",
    Communicator:
      "Tu es un rédacteur de communications. Rédige un message clair, professionnel et adapté au contexte.",
    Operator:
      "Tu es un exécuteur d'actions. Décris précisément les actions à réaliser et leurs résultats attendus.",
    Planner:
      "Tu es un planificateur. Produis un plan structuré avec des étapes claires, des dépendances et des priorités.",
  };

  const agentPrompt = base[agent] ?? `Tu es l'agent ${agent}. Réponds de façon structurée et complète.`;

  return `${agentPrompt}\n\nFormat de sortie attendu : ${expectedOutput}.\nRéponds en français sauf si la demande est en anglais.`;
}
