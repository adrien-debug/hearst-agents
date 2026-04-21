/**
 * Right Panel Focal Objects — Premium output manifestation model.
 *
 * Each object type represents a specific manifestation of plan-derived output.
 * The right panel renders ONE focal object at a time — never a list.
 *
 * Morphing lifecycle:
 * - MessageDraft → MessageReceipt (after send)
 * - Outline → Report (after generation)
 * - MissionDraft → ActiveMission (after approval)
 * - WatcherDraft → WatcherActive (after activation)
 *
 * Anti-patterns:
 * - NO list rendering
 * - NO widget zoo
 * - NO generic cards
 * - NO file manager
 * - NO raw markdown dumps
 * - NO exposed plan steps
 */

import type { ProviderId } from "@/lib/providers/types";
import type { OutputTone, FormattedSection } from "@/lib/runtime/formatting/pipeline";

// ── Base ────────────────────────────────────────────────────

export type FocalObjectType =
  | "message_draft"
  | "message_receipt"
  | "brief"
  | "outline"
  | "report"
  | "doc"
  | "watcher_draft"
  | "watcher_active"
  | "mission_draft"
  | "mission_active";

export type FocalObjectStatus =
  | "composing"
  | "ready"
  | "awaiting_approval"
  | "delivering"
  | "delivered"
  | "active"
  | "paused"
  | "failed";

/** Morphing transition — which object type this can become. */
export type MorphTarget = FocalObjectType | null;

interface FocalObjectBase {
  objectType: FocalObjectType;
  id: string;
  threadId: string;
  title: string;
  status: FocalObjectStatus;
  createdAt: number;
  updatedAt: number;
  /** Source plan ID, if derived from planner. */
  sourcePlanId?: string;
  /** Source asset ID, if derived from stored asset. */
  sourceAssetId?: string;
  /** What this object can morph into next. Null = terminal. */
  morphTarget: MorphTarget;
  /** 0 or 1 action. Never more. */
  primaryAction?: FocalAction;
}

// ── Actions (anti-button: max 1) ────────────────────────────

export type FocalActionKind = "approve" | "discard" | "send" | "pause" | "resume";

export interface FocalAction {
  kind: FocalActionKind;
  label: string;
}

// ── Message Draft ───────────────────────────────────────────

export interface MessageDraftObject extends FocalObjectBase {
  objectType: "message_draft";
  recipient: string;
  body: string;
  tone: OutputTone;
  /** Resolved provider — shown only as provenance, never as choice. */
  providerId?: ProviderId;
  channelRef?: string;
  morphTarget: "message_receipt";
}

// ── Message Receipt ─────────────────────────────────────────

export interface MessageReceiptObject extends FocalObjectBase {
  objectType: "message_receipt";
  recipient: string;
  body: string;
  providerId: ProviderId;
  channelRef: string;
  sentAt: number;
  deliveryStatus: "sent" | "delivered" | "read" | "failed";
  morphTarget: null;
}

// ── Brief ───────────────────────────────────────────────────

export interface BriefObject extends FocalObjectBase {
  objectType: "brief";
  summary: string;
  sections: FormattedSection[];
  tier: "brief";
  tone: OutputTone;
  wordCount: number;
  morphTarget: null;
}

// ── Outline (pre-report) ────────────────────────────────────

export interface OutlineObject extends FocalObjectBase {
  objectType: "outline";
  summary: string;
  sectionTitles: string[];
  estimatedWordCount: number;
  morphTarget: "report";
}

// ── Report ──────────────────────────────────────────────────

export interface ReportObject extends FocalObjectBase {
  objectType: "report";
  summary: string;
  sections: FormattedSection[];
  tier: "report";
  tone: OutputTone;
  wordCount: number;
  /** Download reference (PDF/XLSX). */
  downloadRef?: string;
  morphTarget: null;
}

// ── Doc (generic multi-step output) ─────────────────────────

export interface DocObject extends FocalObjectBase {
  objectType: "doc";
  summary: string;
  sections: FormattedSection[];
  tier: "doc";
  tone: OutputTone;
  wordCount: number;
  morphTarget: "report" | null;
}

// ── Watcher Draft ───────────────────────────────────────────

export interface WatcherDraftObject extends FocalObjectBase {
  objectType: "watcher_draft";
  condition: string;
  description: string;
  morphTarget: "watcher_active";
}

// ── Watcher Active ──────────────────────────────────────────

export interface WatcherActiveObject extends FocalObjectBase {
  objectType: "watcher_active";
  condition: string;
  description: string;
  lastCheckedAt?: number;
  triggerCount: number;
  morphTarget: null;
}

// ── Mission Draft ───────────────────────────────────────────

export interface MissionDraftObject extends FocalObjectBase {
  objectType: "mission_draft";
  intent: string;
  schedule?: string;
  outputKind?: string;
  morphTarget: "mission_active";
}

// ── Mission Active ──────────────────────────────────────────

export interface MissionActiveObject extends FocalObjectBase {
  objectType: "mission_active";
  intent: string;
  schedule?: string;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
  morphTarget: null;
}

// ── Union ───────────────────────────────────────────────────

export type FocalObject =
  | MessageDraftObject
  | MessageReceiptObject
  | BriefObject
  | OutlineObject
  | ReportObject
  | DocObject
  | WatcherDraftObject
  | WatcherActiveObject
  | MissionDraftObject
  | MissionActiveObject;
