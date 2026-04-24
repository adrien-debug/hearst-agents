/**
 * Manifestation Mapper — Transforms plans, missions, and assets into focal objects.
 *
 * This is the bridge between the invisible planner and the visible right panel.
 * The user never sees plan steps — they see premium objects appearing as
 * the OS works.
 *
 * Mapping rules:
 * - ExecutionPlan(one_shot, awaiting_approval, deliver step) → MessageDraftObject
 * - ExecutionPlan(one_shot, completed, generate_asset step)  → ReportObject or BriefObject
 * - ExecutionPlan(one_shot, executing, generate_asset step)  → OutlineObject
 * - ExecutionPlan(mission, draft/awaiting_approval)          → MissionDraftObject
 * - ExecutionPlan(monitoring, draft)                         → WatcherDraftObject
 * - MissionDefinition(active)                                → MissionActiveObject
 * - MissionDefinition(active, monitoring)                    → WatcherActiveObject
 * - Asset(message, sent)                                     → MessageReceiptObject
 * - Asset(report)                                            → ReportObject
 * - Asset(brief)                                             → BriefObject
 */

import type { ExecutionPlan } from "@/lib/planner/types";
import type { MissionDefinition } from "@/lib/planner/types";
import type { Asset } from "@/lib/assets/types";
import type { ProviderId } from "@/lib/providers/types";
import type { FormattedOutput, FormattedSection } from "@/lib/runtime/formatting/pipeline";
import type {
  FocalObject,
  MessageDraftObject,
  MessageReceiptObject,
  BriefObject,
  OutlineObject,
  ReportObject,
  DocObject,
  WatcherDraftObject,
  WatcherActiveObject,
  MissionDraftObject,
  MissionActiveObject,
  FocalObjectStatus,
} from "./objects";

// ── Plan → Focal Object ────────────────────────────────────

export function manifestPlan(plan: ExecutionPlan): FocalObject | null {
  const now = Date.now();

  // Mission plans
  if (plan.type === "mission") {
    return manifestMissionPlan(plan, now);
  }

  // Monitoring plans
  if (plan.type === "monitoring") {
    return manifestMonitoringPlan(plan, now);
  }

  // One-shot plans
  return manifestOneShotPlan(plan, now);
}

function manifestOneShotPlan(plan: ExecutionPlan, now: number): FocalObject | null {
  const deliverStep = plan.steps.find((s) => s.kind === "deliver");
  const generateStep = plan.steps.find((s) => s.kind === "generate_asset");
  const status = mapPlanStatus(plan.status);

  // Message draft (has deliver step, not yet sent)
  if (deliverStep && deliverStep.status !== "done") {
    const draft: MessageDraftObject = {
      objectType: "message_draft",
      id: `fo_${plan.id}_msg`,
      threadId: plan.threadId,
      title: extractTitle(plan.intent, "message"),
      status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      sourcePlanId: plan.id,
      morphTarget: "message_receipt",
      recipient: extractRecipient(plan.intent),
      body: "",
      tone: "direct",
      providerId: deliverStep.providerId,
      channelRef: undefined,
      primaryAction: status === "awaiting_approval"
        ? { kind: "approve", label: "Envoyer" }
        : undefined,
    };
    return draft;
  }

  // Report/brief generation in progress
  if (generateStep && generateStep.status === "running") {
    const outline: OutlineObject = {
      objectType: "outline",
      id: `fo_${plan.id}_outline`,
      threadId: plan.threadId,
      title: extractTitle(plan.intent, "report"),
      status: "composing",
      createdAt: plan.createdAt,
      updatedAt: now,
      sourcePlanId: plan.id,
      morphTarget: "report",
      summary: "",
      sectionTitles: [],
      estimatedWordCount: 0,
    };
    return outline;
  }

  // Report/brief completed
  if (generateStep && generateStep.status === "done") {
    const isReport = /\b(rapport|report|analyse|étude|bilan)\b/i.test(plan.intent);
    if (isReport) {
      const report: ReportObject = {
        objectType: "report",
        id: `fo_${plan.id}_report`,
        threadId: plan.threadId,
        title: extractTitle(plan.intent, "report"),
        status: "delivered",
        createdAt: plan.createdAt,
        updatedAt: now,
        sourcePlanId: plan.id,
        morphTarget: null,
        summary: "",
        sections: [],
        tier: "report",
        tone: "executive",
        wordCount: 0,
      };
      return report;
    }

    const brief: BriefObject = {
      objectType: "brief",
      id: `fo_${plan.id}_brief`,
      threadId: plan.threadId,
      title: extractTitle(plan.intent, "brief"),
      status: "delivered",
      createdAt: plan.createdAt,
      updatedAt: now,
      sourcePlanId: plan.id,
      morphTarget: null,
      summary: "",
      sections: [],
      tier: "brief",
      tone: "structured",
      wordCount: 0,
    };
    return brief;
  }

  return null;
}

function manifestMissionPlan(plan: ExecutionPlan, _now: number): MissionDraftObject {
  const status = mapPlanStatus(plan.status);
  return {
    objectType: "mission_draft",
    id: `fo_${plan.id}_mission`,
    threadId: plan.threadId,
    title: extractTitle(plan.intent, "mission"),
    status,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    sourcePlanId: plan.id,
    morphTarget: "mission_active",
    intent: plan.intent,
    schedule: extractSchedule(plan.intent),
    primaryAction: status === "awaiting_approval"
      ? { kind: "approve", label: "Activer" }
      : undefined,
  };
}

function manifestMonitoringPlan(plan: ExecutionPlan, _now: number): WatcherDraftObject {
  return {
    objectType: "watcher_draft",
    id: `fo_${plan.id}_watcher`,
    threadId: plan.threadId,
    title: extractTitle(plan.intent, "watcher"),
    status: mapPlanStatus(plan.status),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    sourcePlanId: plan.id,
    morphTarget: "watcher_active",
    condition: plan.intent,
    description: "",
    primaryAction: plan.status === "awaiting_approval"
      ? { kind: "approve", label: "Activer" }
      : undefined,
  };
}

// ── Mission → Focal Object ─────────────────────────────────

export function manifestMission(mission: MissionDefinition): MissionActiveObject | WatcherActiveObject {
  if (mission.mode === "monitoring") {
    return {
      objectType: "watcher_active",
      id: `fo_mission_${mission.id}`,
      threadId: mission.threadId,
      title: extractTitle(mission.naturalLanguageRule, "watcher"),
      status: mission.status === "active" ? "active" : "paused",
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
      sourcePlanId: mission.sourcePlanId,
      missionId: mission.id,
      morphTarget: null,
      condition: mission.condition ?? mission.naturalLanguageRule,
      description: "",
      lastCheckedAt: mission.lastRunAt,
      triggerCount: 0,
      primaryAction: mission.status === "active"
        ? { kind: "pause", label: "Pause" }
        : { kind: "resume", label: "Reprendre" },
    };
  }

  return {
    objectType: "mission_active",
    id: `fo_mission_${mission.id}`,
    threadId: mission.threadId,
    title: extractTitle(mission.naturalLanguageRule, "mission"),
    status: mission.status === "active" ? "active" : "paused",
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    sourcePlanId: mission.sourcePlanId,
    missionId: mission.id,
    morphTarget: null,
    intent: mission.naturalLanguageRule,
    schedule: mission.schedule,
    lastRunAt: mission.lastRunAt,
    nextRunAt: mission.nextRunAt,
    runCount: 0,
    primaryAction: mission.status === "active"
      ? { kind: "pause", label: "Pause" }
      : { kind: "resume", label: "Reprendre" },
  };
}

// ── Asset → Focal Object ───────────────────────────────────

/**
 * An asset is "ready" (inspectable, can auto-materialize) when it has at least
 * a title and either a summary or rendered sections. "delivered" is reserved for
 * assets that are confirmed terminal (message sent, no further inspection expected).
 */
function resolveAssetStatus(
  asset: Asset,
  formatted?: FormattedOutput,
): import("./objects").FocalObjectStatus {
  const hasMeaningfulContent =
    (formatted?.summary && formatted.summary.length > 0) ||
    (formatted?.sections && formatted.sections.length > 0) ||
    (asset.summary && asset.summary.length > 0);
  return hasMeaningfulContent ? "ready" : "delivered";
}

export function manifestAsset(asset: Asset, formatted?: FormattedOutput): FocalObject | null {
  switch (asset.kind) {
    case "message": {
      const receipt: MessageReceiptObject = {
        objectType: "message_receipt",
        id: `fo_asset_${asset.id}`,
        threadId: asset.threadId,
        title: asset.title,
        status: asset.provenance.deliveryStatus === "failed" ? "failed" : "delivered",
        createdAt: asset.createdAt,
        updatedAt: asset.createdAt,
        sourceAssetId: asset.id,
        morphTarget: null,
        recipient: asset.title.replace(/^Message à\s*/i, ""),
        body: asset.summary ?? "",
        providerId: asset.provenance.providerId,
        channelRef: asset.provenance.channelRef ?? "",
        sentAt: asset.provenance.sentAt ?? asset.createdAt,
        deliveryStatus: asset.provenance.deliveryStatus ?? "sent",
      };
      return receipt;
    }

    case "report": {
      const status = resolveAssetStatus(asset, formatted);
      const report: ReportObject = {
        objectType: "report",
        id: `fo_asset_${asset.id}`,
        threadId: asset.threadId,
        title: (formatted?.title || asset.title) || "Rapport",
        status,
        createdAt: asset.createdAt,
        updatedAt: asset.createdAt,
        sourceAssetId: asset.id,
        morphTarget: null,
        summary: formatted?.summary ?? asset.summary ?? "",
        sections: formatted?.sections ?? [],
        tier: "report",
        tone: formatted?.tone ?? "executive",
        wordCount: formatted?.wordCount ?? 0,
        downloadRef: undefined,
      };
      return report;
    }

    case "brief": {
      const status = resolveAssetStatus(asset, formatted);
      const brief: BriefObject = {
        objectType: "brief",
        id: `fo_asset_${asset.id}`,
        threadId: asset.threadId,
        title: (formatted?.title || asset.title) || "Synthèse",
        status,
        createdAt: asset.createdAt,
        updatedAt: asset.createdAt,
        sourceAssetId: asset.id,
        morphTarget: null,
        summary: formatted?.summary ?? asset.summary ?? "",
        sections: formatted?.sections ?? [],
        tier: "brief",
        tone: formatted?.tone ?? "structured",
        wordCount: formatted?.wordCount ?? 0,
      };
      return brief;
    }

    case "document": {
      const status = resolveAssetStatus(asset, formatted);
      const doc: DocObject = {
        objectType: "doc",
        id: `fo_asset_${asset.id}`,
        threadId: asset.threadId,
        title: (formatted?.title || asset.title) || "Document",
        status,
        createdAt: asset.createdAt,
        updatedAt: asset.createdAt,
        sourceAssetId: asset.id,
        morphTarget: null,
        summary: formatted?.summary ?? asset.summary ?? "",
        sections: formatted?.sections ?? [],
        tier: "doc",
        tone: formatted?.tone ?? "executive",
        wordCount: formatted?.wordCount ?? 0,
      };
      return doc;
    }

    default:
      return null;
  }
}

// ── Morphing transitions ────────────────────────────────────

/**
 * Apply a morph transition to a focal object.
 * Returns the morphed version or null if the morph is invalid.
 *
 * UI layer can animate the transition based on objectType change.
 */
export function morphObject(
  current: FocalObject,
  data: Record<string, unknown>,
): FocalObject | null {
  if (!current.morphTarget) return null;

  switch (current.objectType) {
    case "message_draft":
      return {
        objectType: "message_receipt",
        id: current.id.replace("_msg", "_receipt"),
        threadId: current.threadId,
        title: current.title,
        status: "delivered",
        createdAt: current.createdAt,
        updatedAt: Date.now(),
        sourcePlanId: current.sourcePlanId,
        morphTarget: null,
        recipient: (current as MessageDraftObject).recipient,
        body: (current as MessageDraftObject).body,
        providerId: ((data.providerId as string) ?? (current as MessageDraftObject).providerId!) as ProviderId,
        channelRef: (data.channelRef as string) ?? "",
        sentAt: Date.now(),
        deliveryStatus: "sent",
      } satisfies MessageReceiptObject;

    case "outline":
      return {
        objectType: "report",
        id: current.id.replace("_outline", "_report"),
        threadId: current.threadId,
        title: (data.title as string) ?? current.title,
        status: "delivered",
        createdAt: current.createdAt,
        updatedAt: Date.now(),
        sourcePlanId: current.sourcePlanId,
        morphTarget: null,
        summary: (data.summary as string) ?? "",
        sections: (data.sections as FormattedSection[]) ?? [],
        tier: "report",
        tone: "executive",
        wordCount: (data.wordCount as number) ?? 0,
        downloadRef: data.downloadRef as string | undefined,
      } satisfies ReportObject;

    case "mission_draft":
      return {
        objectType: "mission_active",
        id: current.id.replace("_mission", "_mission_active"),
        threadId: current.threadId,
        title: current.title,
        status: "active",
        createdAt: current.createdAt,
        updatedAt: Date.now(),
        sourcePlanId: current.sourcePlanId,
        morphTarget: null,
        intent: (current as MissionDraftObject).intent,
        schedule: (data.schedule as string) ?? (current as MissionDraftObject).schedule,
        runCount: 0,
        primaryAction: { kind: "pause", label: "Pause" },
      } satisfies MissionActiveObject;

    case "watcher_draft":
      return {
        objectType: "watcher_active",
        id: current.id.replace("_watcher", "_watcher_active"),
        threadId: current.threadId,
        title: current.title,
        status: "active",
        createdAt: current.createdAt,
        updatedAt: Date.now(),
        sourcePlanId: current.sourcePlanId,
        morphTarget: null,
        condition: (current as WatcherDraftObject).condition,
        description: (current as WatcherDraftObject).description,
        triggerCount: 0,
        primaryAction: { kind: "pause", label: "Pause" },
      } satisfies WatcherActiveObject;

    default:
      return null;
  }
}

// ── Resolve focal object for a thread ───────────────────────

/**
 * Given available context, resolve which focal object the right panel should show.
 *
 * Priority:
 * 1. Active plan awaiting approval
 * 2. Plan producing output (outline/report in progress)
 * 3. Latest asset
 * 4. Active mission
 * 5. null (idle)
 */
export function resolveFocalObject(
  plans: ExecutionPlan[],
  missions: MissionDefinition[],
  assets: Asset[],
): FocalObject | null {
  // 1. Approval-pending plan
  const awaitingPlan = plans.find((p) => p.status === "awaiting_approval");
  if (awaitingPlan) {
    const obj = manifestPlan(awaitingPlan);
    if (obj) return obj;
  }

  // 2. Executing plan with visible output
  const executingPlan = plans.find((p) => p.status === "executing");
  if (executingPlan) {
    const obj = manifestPlan(executingPlan);
    if (obj) return obj;
  }

  // 3. Latest asset
  if (assets.length > 0) {
    const latest = assets[assets.length - 1];
    const obj = manifestAsset(latest);
    if (obj) return obj;
  }

  // 4. Active mission
  const activeMission = missions.find((m) => m.status === "active");
  if (activeMission) {
    return manifestMission(activeMission);
  }

  return null;
}

// ── Helpers ─────────────────────────────────────────────────

function mapPlanStatus(planStatus: string): FocalObjectStatus {
  switch (planStatus) {
    case "draft": return "composing";
    case "ready": return "ready";
    case "awaiting_approval": return "awaiting_approval";
    case "executing": return "delivering";
    case "completed": return "delivered";
    case "failed": return "failed";
    case "degraded": return "failed";
    default: return "composing";
  }
}

function extractTitle(intent: string, kind: string): string {
  const short = intent.length > 60 ? intent.slice(0, 57) + "…" : intent;
  switch (kind) {
    case "message": return short;
    case "report": return `Rapport : ${short}`;
    case "brief": return `Synthèse : ${short}`;
    case "mission": return short;
    case "watcher": return `Surveillance : ${short}`;
    default: return short;
  }
}

function extractRecipient(intent: string): string {
  const match = intent.match(/\b(?:à|to|pour|for)\s+(\w+(?:\s+\w+)?)/i);
  return match?.[1] ?? "";
}

function extractSchedule(intent: string): string | undefined {
  const match = intent.match(/\b(chaque\s+\w+|every\s+\w+|tous\s+les\s+\w+|daily|weekly|hourly)/i);
  return match?.[0];
}
