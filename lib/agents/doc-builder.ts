/**
 * DocBuilder — Capability Agent for document generation.
 *
 * Tools:
 *   create_outline → define sections before writing
 *   generate_section → write one section at a time
 *   finalize_document → submit for review + sync to Artifact
 *
 * The DocBuilder uses a DocumentSession as source of truth during construction.
 * The Artifact is only created/updated at finalize_document time.
 *
 * LLM loop: the agent calls its tools iteratively until the document is complete.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunEngine } from "../engine/runtime/engine";
import type { ArtifactType, ArtifactMetadata } from "../artifacts/types";
import {
  DocumentSessionManager,
  type OutlineSection,
} from "../artifacts/document-session";

// ── System Prompt ────────────────────────────────────────

const DOCBUILDER_MODEL = "claude-sonnet-4-6";

const DOCBUILDER_SYSTEM_PROMPT = `Tu es DocBuilder, l'agent spécialisé dans la création de documents.

RÔLE :
Tu produis des documents complets, structurés et exploitables.

PROCESSUS OBLIGATOIRE :
1. create_outline — Définis les sections du document
2. generate_section — Écris chaque section une par une (dans l'ordre)
3. finalize_document — Soumets le document complet

RÈGLES :
- Tu produis TOUJOURS un contenu complet, jamais de placeholder
- Chaque section doit être autonome et cohérente
- Tu structures clairement : titres, sous-titres, listes, tableaux si pertinent
- Tu optimises pour la lisibilité
- Tu ne sautes PAS de section — chaque section de l'outline doit être générée
- Tu appelles finalize_document uniquement quand TOUTES les sections sont complètes

STYLE :
- Professionnel mais accessible
- Concis mais complet
- Structuré avec une logique claire
- Adapté à l'audience cible`;

// ── Tool Definitions ─────────────────────────────────────

const CREATE_OUTLINE_TOOL: Anthropic.Tool = {
  name: "create_outline",
  description:
    "Define the document structure before writing. List all sections with titles and brief descriptions.",
  input_schema: {
    type: "object" as const,
    required: ["sections"],
    properties: {
      sections: {
        type: "array" as const,
        description: "Ordered list of document sections.",
        items: {
          type: "object" as const,
          required: ["title", "description"],
          properties: {
            title: {
              type: "string" as const,
              description: "Section title.",
            },
            description: {
              type: "string" as const,
              description: "Brief description of what this section covers.",
            },
          },
        },
      },
    },
  },
};

const GENERATE_SECTION_TOOL: Anthropic.Tool = {
  name: "generate_section",
  description:
    "Write the content for one section of the document. Call this once per section, in order.",
  input_schema: {
    type: "object" as const,
    required: ["section_id", "content"],
    properties: {
      section_id: {
        type: "string" as const,
        description: "The section ID from the outline.",
      },
      content: {
        type: "string" as const,
        description: "Full markdown content for this section.",
      },
    },
  },
};

const FINALIZE_DOCUMENT_TOOL: Anthropic.Tool = {
  name: "finalize_document",
  description:
    "Submit the completed document. Only call when ALL sections have been generated.",
  input_schema: {
    type: "object" as const,
    required: ["summary"],
    properties: {
      summary: {
        type: "string" as const,
        description: "Brief summary of the complete document (1-2 sentences).",
      },
    },
  },
};

const DOCBUILDER_TOOLS: Anthropic.Tool[] = [
  CREATE_OUTLINE_TOOL,
  GENERATE_SECTION_TOOL,
  FINALIZE_DOCUMENT_TOOL,
];

// ── Agent execution ──────────────────────────────────────

export interface DocBuilderInput {
  task: string;
  context: Record<string, unknown>;
  document_type: ArtifactType;
  title?: string;
  audience?: ArtifactMetadata["audience"];
  sources_data?: Record<string, unknown>[];
}

export interface DocBuilderResult {
  artifact_id: string | null;
  session_id: string;
  title: string;
  section_count: number;
  word_count: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    llm_calls: number;
  };
}

const MAX_ITERATIONS = 20;

export async function runDocBuilder(
  db: SupabaseClient,
  engine: RunEngine,
  input: DocBuilderInput,
): Promise<DocBuilderResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const sessionMgr = new DocumentSessionManager(db, engine.events);

  const title = input.title ?? deriveTitle(input.task);
  const session = await sessionMgr.create(
    engine.id,
    engine.getUserId(),
    title,
    input.document_type,
    { audience: input.audience },
  );

  let totalIn = 0;
  let totalOut = 0;
  let llmCalls = 0;
  let outline: OutlineSection[] = [];

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: buildTaskPrompt(input),
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: DOCBUILDER_MODEL,
      max_tokens: 8192,
      system: DOCBUILDER_SYSTEM_PROMPT,
      messages,
      tools: DOCBUILDER_TOOLS,
    });

    totalIn += response.usage.input_tokens;
    totalOut += response.usage.output_tokens;
    llmCalls++;

    await engine.cost.track({
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      tool_calls: 0,
      latency_ms: 0,
    });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      // No more tool calls — done
      break;
    }

    // Add assistant response to history
    messages.push({ role: "assistant", content: response.content });

    // Process each tool call
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tc of toolUses) {
      const result = await handleToolCall(
        tc,
        session.id,
        sessionMgr,
        engine,
        outline,
      );
      if (tc.name === "create_outline" && result.outline) {
        outline = result.outline;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tc.id,
        content: result.message,
      });

      if (result.done) {
        // finalize_document was called
        await engine.cost.track({
          input_tokens: 0,
          output_tokens: 0,
          tool_calls: llmCalls,
          latency_ms: 0,
        });

        const finalSession = await sessionMgr.load(session.id);
        return {
          artifact_id: finalSession.artifact_id,
          session_id: session.id,
          title,
          section_count: outline.length,
          word_count: finalSession.metadata.word_count ?? 0,
          usage: {
            input_tokens: totalIn,
            output_tokens: totalOut,
            llm_calls: llmCalls,
          },
        };
      }
    }

    messages.push({ role: "user", content: toolResults });

    if (response.stop_reason === "end_turn") {
      break;
    }
  }

  // Fallback: if loop ends without finalize, force sync
  const finalSession = await sessionMgr.load(session.id);
  return {
    artifact_id: finalSession.artifact_id,
    session_id: session.id,
    title,
    section_count: outline.length,
    word_count: 0,
    usage: {
      input_tokens: totalIn,
      output_tokens: totalOut,
      llm_calls: llmCalls,
    },
  };
}

// ── Tool handlers ────────────────────────────────────────

interface ToolCallResult {
  message: string;
  done: boolean;
  outline?: OutlineSection[];
}

async function handleToolCall(
  tc: Anthropic.ToolUseBlock,
  sessionId: string,
  sessionMgr: DocumentSessionManager,
  engine: RunEngine,
  currentOutline: OutlineSection[],
): Promise<ToolCallResult> {
  switch (tc.name) {
    case "create_outline": {
      const input = tc.input as {
        sections: Array<{ title: string; description: string }>;
      };

      const outline: OutlineSection[] = input.sections.map((s, i) => ({
        id: `section_${i + 1}`,
        title: s.title,
        order: i + 1,
        description: s.description,
        state: "pending" as const,
      }));

      await sessionMgr.setOutline(sessionId, outline);

      const sectionList = outline
        .map((s) => `- ${s.id}: "${s.title}"`)
        .join("\n");

      return {
        message: `Outline created with ${outline.length} sections:\n${sectionList}\n\nNow generate each section in order using generate_section.`,
        done: false,
        outline,
      };
    }

    case "generate_section": {
      const input = tc.input as { section_id: string; content: string };

      await sessionMgr.writeSection(sessionId, input.section_id, input.content);

      const section = currentOutline.find((s) => s.id === input.section_id);
      const remaining = currentOutline.filter(
        (s) =>
          s.state !== "complete" &&
          s.id !== input.section_id,
      );

      const statusMsg =
        remaining.length > 0
          ? `Section "${section?.title ?? input.section_id}" written. ${remaining.length} section(s) remaining: ${remaining.map((s) => s.id).join(", ")}.`
          : `Section "${section?.title ?? input.section_id}" written. All sections complete. Call finalize_document now.`;

      // Mark as complete in local outline for tracking
      if (section) section.state = "complete";

      return { message: statusMsg, done: false };
    }

    case "finalize_document": {
      const artifact = await sessionMgr.submitForReview(
        sessionId,
        engine.artifacts,
        engine.id,
      );

      await sessionMgr.finalize(sessionId, engine.artifacts);

      return {
        message: `Document finalized. Artifact ID: ${artifact.id}, Title: "${artifact.title}", ${artifact.sections.length} sections, status: final.`,
        done: true,
      };
    }

    default:
      return { message: `Unknown tool: ${tc.name}`, done: false };
  }
}

// ── Helpers ──────────────────────────────────────────────

function deriveTitle(task: string): string {
  const cleaned = task.replace(/^(crée|produis|génère|rédige|écris)\s+/i, "");
  if (cleaned.length <= 80) return cleaned;
  return cleaned.slice(0, 77) + "...";
}

function buildTaskPrompt(input: DocBuilderInput): string {
  let prompt = `TÂCHE : ${input.task}\n\nTYPE DE DOCUMENT : ${input.document_type}`;

  if (input.audience) {
    prompt += `\nAUDIENCE : ${input.audience}`;
  }

  if (input.sources_data && input.sources_data.length > 0) {
    prompt += `\n\nDONNÉES SOURCES (${input.sources_data.length}) :`;
    for (const [i, src] of input.sources_data.entries()) {
      prompt += `\n\n--- Source ${i + 1} ---\n${JSON.stringify(src, null, 2)}`;
    }
  }

  if (
    input.context &&
    Object.keys(input.context).length > 0
  ) {
    prompt += `\n\nCONTEXTE ADDITIONNEL :\n${JSON.stringify(input.context, null, 2)}`;
  }

  prompt +=
    "\n\nCommence par create_outline, puis génère chaque section, puis finalize_document.";

  return prompt;
}
