/**
 * Artifact Evaluator — Deterministic decision: should a step result become an Artifact?
 *
 * This is NOT an LLM decision. It's a runtime gate based on measurable criteria.
 * The Orchestrator's plan can request an artifact (needs_artifact flag),
 * but even without that flag, the evaluator catches results that should be persisted.
 *
 * Criteria (any match = create artifact):
 * 1. Plan step has needs_artifact flag
 * 2. Content length exceeds threshold
 * 3. Content has structural markers (headings, tables, lists)
 * 4. Expected output type is "report" or "draft"
 * 5. Agent is DocBuilder (always produces artifacts)
 */

import type { ArtifactType } from "./types";
import type { ExpectedOutput } from "../runtime/delegate/types";

// ── Configuration ────────────────────────────────────────

const WORD_COUNT_THRESHOLD = 300;
const HEADING_PATTERN = /^#{1,3}\s+.+/m;
const TABLE_PATTERN = /\|.+\|.+\|/;
const LIST_BLOCK_PATTERN = /(?:^[-*]\s+.+\n){4,}/m;

// ── Types ────────────────────────────────────────────────

export interface ArtifactEvaluation {
  shouldCreate: boolean;
  reason: ArtifactReason | null;
  suggestedType: ArtifactType;
  suggestedTitle: string;
}

export type ArtifactReason =
  | "plan_requested"
  | "long_content"
  | "structured_content"
  | "output_type_report"
  | "output_type_draft"
  | "agent_docbuilder";

export interface EvalContext {
  content: string;
  expectedOutput: ExpectedOutput;
  agent: string;
  planStepIntent: string;
  needsArtifact?: boolean;
}

// ── Evaluator ────────────────────────────────────────────

export function evaluateForArtifact(ctx: EvalContext): ArtifactEvaluation {
  const noArtifact: ArtifactEvaluation = {
    shouldCreate: false,
    reason: null,
    suggestedType: "chat_response",
    suggestedTitle: "",
  };

  if (!ctx.content || ctx.content.trim().length === 0) {
    return noArtifact;
  }

  // 1. Plan explicitly requested an artifact
  if (ctx.needsArtifact) {
    return {
      shouldCreate: true,
      reason: "plan_requested",
      suggestedType: inferType(ctx.expectedOutput),
      suggestedTitle: deriveTitle(ctx.planStepIntent),
    };
  }

  // 2. DocBuilder always produces artifacts (handled by the agent itself,
  //    but we catch it here as a safety net)
  if (ctx.agent === "DocBuilder") {
    return {
      shouldCreate: true,
      reason: "agent_docbuilder",
      suggestedType: inferType(ctx.expectedOutput),
      suggestedTitle: deriveTitle(ctx.planStepIntent),
    };
  }

  // 3. Expected output is report or draft
  if (ctx.expectedOutput === "report") {
    return {
      shouldCreate: true,
      reason: "output_type_report",
      suggestedType: "report",
      suggestedTitle: deriveTitle(ctx.planStepIntent),
    };
  }
  if (ctx.expectedOutput === "draft") {
    return {
      shouldCreate: true,
      reason: "output_type_draft",
      suggestedType: "draft",
      suggestedTitle: deriveTitle(ctx.planStepIntent),
    };
  }

  // 4. Content is long
  const wordCount = ctx.content.split(/\s+/).filter(Boolean).length;
  if (wordCount >= WORD_COUNT_THRESHOLD) {
    return {
      shouldCreate: true,
      reason: "long_content",
      suggestedType: "memo",
      suggestedTitle: deriveTitle(ctx.planStepIntent),
    };
  }

  // 5. Content has structural markers
  if (hasStructure(ctx.content)) {
    return {
      shouldCreate: true,
      reason: "structured_content",
      suggestedType: "memo",
      suggestedTitle: deriveTitle(ctx.planStepIntent),
    };
  }

  return noArtifact;
}

// ── Helpers ──────────────────────────────────────────────

function inferType(output: ExpectedOutput): ArtifactType {
  switch (output) {
    case "report":
      return "report";
    case "draft":
      return "draft";
    case "plan":
      return "memo";
    case "summary":
      return "memo";
    case "data":
      return "deliverable";
    case "execution_result":
      return "deliverable";
    default:
      return "memo";
  }
}

function hasStructure(content: string): boolean {
  const headings = HEADING_PATTERN.test(content);
  const tables = TABLE_PATTERN.test(content);
  const lists = LIST_BLOCK_PATTERN.test(content);

  // At least 2 structural signals
  const signals = [headings, tables, lists].filter(Boolean).length;
  return signals >= 2;
}

function deriveTitle(intent: string): string {
  const cleaned = intent
    .replace(/^(récupérer|analyser|produire|créer|générer|rédiger)\s+/i, "")
    .trim();
  if (cleaned.length <= 80) return cleaned;
  return cleaned.slice(0, 77) + "...";
}
