/**
 * Pure model: map Halo + focal object → Manifestation Stage visual state.
 * Halo core mapping uses only: idle | thinking | executing | waiting_approval | degraded | success
 * (no legacy “processing” or other aliases).
 */

import type { HaloCoreState, HaloArtifactSignal, HaloFlowLabel } from "@/app/lib/halo-state";
import type { FocalObjectStatus } from "@/lib/right-panel/objects";

export type ManifestationVisualState = "idle_habited" | "active_condensation" | "ready_stabilized";

export interface ManifestationFocalInput {
  status: FocalObjectStatus;
  title: string;
}

/** Halo cores that imply runtime condensation (canonical set only). */
const HALO_ACTIVE_CORE: ReadonlySet<HaloCoreState> = new Set([
  "thinking",
  "executing",
  "waiting_approval",
  "degraded",
]);

function isHaloActiveCore(core: HaloCoreState): boolean {
  return HALO_ACTIVE_CORE.has(core);
}

/**
 * Priority: focalObject > emergingArtifact > haloCore; flowLabel is a weak tie-break
 * toward activity when halo is idle (e.g. restored snapshot or single-frame overlap).
 */
export function deriveManifestationVisualState(input: {
  haloCore: HaloCoreState;
  flowLabel: HaloFlowLabel;
  emergingArtifact: HaloArtifactSignal | null;
  focal: ManifestationFocalInput | null;
}): ManifestationVisualState {
  const { haloCore, flowLabel, emergingArtifact, focal } = input;

  // ── 1. Focal absolute priority ────────────────────────────
  if (focal) {
    if (
      focal.status === "composing"
      || focal.status === "delivering"
      || focal.status === "failed"
    ) {
      return "active_condensation";
    }
    if (focal.status === "ready" || focal.status === "awaiting_approval") {
      return "ready_stabilized";
    }
    // delivered | active | paused → continue to Halo / artifact / weak flow
  }

  // ── 2. Artifact lifecycle (Halo SSE) ─────────────────────
  const art = emergingArtifact?.status;
  if (art === "handoff" || art === "settled") {
    return "ready_stabilized";
  }
  if (art === "emerging") {
    return "active_condensation";
  }

  // ── 3. Halo core (canonical) ───────────────────────────────
  if (haloCore === "success") {
    return "ready_stabilized";
  }
  if (isHaloActiveCore(haloCore)) {
    return "active_condensation";
  }

  // haloCore === "idle"
  // ── 4. Weak signal: flow still present while core already idle ──
  if (flowLabel !== null) {
    return "active_condensation";
  }

  return "idle_habited";
}

/** User-facing French copy; never exposes raw flow enums or tool names. */
export function sublineForFlow(flow: HaloFlowLabel): string | null {
  if (!flow) return null;
  switch (flow) {
    case "LISTENING":
      return "Votre intention est prise en charge.";
    case "GATHERING":
      return "Les éléments utiles se rassemblent.";
    case "SYNTHESIZING":
      return "Une forme claire se dessine.";
    case "PREPARING":
      return "Quelque chose se prépare pour vous.";
    case "AWAITING APPROVAL":
      return "Un choix attend votre regard.";
    case "FINALIZING":
      return "Dernière mise au calme.";
    case "CHECKING":
      return "Contrôle discret en cours.";
    case "MONITORING":
      return "Veille douce en arrière-plan.";
    case "UNABLE TO RESOLVE":
      return "Un point mérite d’être précisé.";
    default:
      return null;
  }
}

export function focalStatusSubline(status: FocalObjectStatus): string | null {
  switch (status) {
    case "composing":
    case "delivering":
      return "L’objet prend corps.";
    case "ready":
    case "awaiting_approval":
      return "Prêt à être regardé de près.";
    case "delivered":
      return "Remis en place.";
    case "active":
      return "En service pour vous.";
    case "paused":
      return "En pause, sans urgence.";
    case "failed":
      return "Un blocage à débloquer ensemble.";
    default:
      return null;
  }
}
