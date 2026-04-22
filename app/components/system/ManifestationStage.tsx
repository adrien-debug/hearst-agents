"use client";

import { useSession } from "next-auth/react";
import { useHaloRuntime } from "@/app/lib/halo-runtime-context";
import { useFocalObject } from "@/app/hooks/use-focal-object";
import { useThoughtStream } from "@/app/hooks/use-thought-stream";
import {
  deriveManifestationVisualState,
  focalStatusSubline,
  sublineForFlow,
} from "@/app/lib/manifestation-stage-model";

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

const GHOST_SVG_VIEWBOX = "560 455 155 170";
const GHOST_SVG_PATHS = (
  <>
    <polygon points="601.74 466.87 572.6 466.87 572.6 609.73 601.74 609.73 601.74 549.07 633.11 579.43 665.76 579.43 601.74 517.46 601.74 466.87" />
    <polygon points="672.72 466.87 672.72 528.12 644.63 500.93 611.98 500.93 672.72 559.72 672.72 609.73 701.86 609.73 701.86 466.87 672.72 466.87" />
  </>
);

const STATE_ANIM: Record<string, string> = {
  active_condensation: "ghost-thinking",
  idle_habited: "",
  ready_stabilized: "",
};

export function ManifestationStage() {
  const { data: session } = useSession();
  const { state: halo } = useHaloRuntime();
  const { focal, isFocused } = useFocalObject();

  const isFocalReady = focal?.status === "ready" || focal?.status === "awaiting_approval";
  const activeThought = useThoughtStream(isFocalReady);

  const firstName = session?.user?.name?.split(" ")[0];

  const phase = deriveManifestationVisualState({
    haloCore: halo.coreState,
    flowLabel: halo.flowLabel,
    emergingArtifact: halo.emergingArtifact,
    focal: focal?.title
      ? { status: focal.status, title: focal.title }
      : null,
  });

  let primaryLine: string;
  if (phase === "idle_habited") {
    primaryLine = `${greetingWord()}${firstName ? `, ${firstName}` : ""}`;
  } else if (focal?.title) {
    primaryLine = focal.title;
  } else if (phase === "ready_stabilized") {
    primaryLine = "Quelque chose est prêt.";
  } else {
    primaryLine = "Une réponse prend forme.";
  }

  const secondaryLine: string =
    activeThought
    ?? (focal && phase !== "idle_habited"
      ? (focalStatusSubline(focal.status)
        ?? sublineForFlow(halo.flowLabel)
        ?? "Visible à droite.")
      : (sublineForFlow(halo.flowLabel)
        ?? "Tout est en place. Dites ce dont vous avez besoin."));

  const stateLabel =
    phase === "active_condensation" ? "SYSTEM_THINKING" :
    phase === "ready_stabilized" ? "SYSTEM_READY" :
    "SYSTEM_IDLE";

  const manifestationLabel = focal?.title ? "Manifestation active" : "Aucune manifestation";
  const runtimeLabel = activeThought
    ?? (halo.flowLabel ? sublineForFlow(halo.flowLabel) : null)
    ?? "En attente d'une intention.";
  const focalLabel = focal?.title
    ? `${focal.title}${focal.status === "ready" || focal.status === "awaiting_approval" ? " · inspectable" : ""}`
    : "Rien de stabilisé pour le moment";

  const animClass = STATE_ANIM[phase] ?? "";

  return (
    <div className="compact-manifestation-stage relative z-0 flex w-full max-w-[920px] min-w-0 flex-col items-center justify-center gap-4 px-4 text-center lg:gap-6 xl:gap-8 lg:px-8">
      <div className="flex flex-col items-center gap-2 lg:gap-3">
        <p className="ghost-kicker">Perception core</p>
        <div className="ghost-divider w-32" />
      </div>

      {/* Ghost Core */}
      <div
        className={`compact-manifestation-halo relative flex items-center justify-center shrink-0 ${animClass}`}
        style={{ width: 196, height: 196 }}
        aria-hidden
      >
        <div className="absolute inset-[6%] rounded-full border border-white/6" />
        <div className="absolute inset-[18%] rounded-full border border-white/5" />
        <svg
          className="dotted-logo absolute inset-0 w-full h-full"
          viewBox={GHOST_SVG_VIEWBOX}
          fill="#2ecfce"
          style={{ opacity: 0.08, filter: "blur(16px)", animation: "aura-pulse 4s infinite ease-in-out" }}
        >
          {GHOST_SVG_PATHS}
        </svg>
        <svg
          className="compact-manifestation-mark dotted-logo ghost-main relative z-10 h-24 w-24"
          viewBox={GHOST_SVG_VIEWBOX}
          fill="#2ecfce"
          style={{
            filter: "drop-shadow(0 0 18px rgba(46, 207, 206, 0.16))",
            opacity: 0.58,
            animation: phase === "active_condensation"
              ? "thinking-vibe 2s infinite ease-in-out"
              : "ghost-breathing 8s infinite ease-in-out",
          }}
        >
          {GHOST_SVG_PATHS}
        </svg>
      </div>

      <div className="flex min-w-0 flex-col items-center gap-3 lg:gap-4">
        <h1 className="compact-manifestation-title bounded-title-3 max-w-[15ch] font-light tracking-[0.08em] text-white/90" style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.7rem)" }}>
          {primaryLine}
        </h1>
        <p className={`font-mono text-[10px] tracking-[0.36em] transition-colors duration-300 lg:text-[11px] lg:tracking-[0.42em] ${
          activeThought ? "text-cyan-accent/60" : "text-cyan-accent/25"
        }`}>
          {stateLabel}
        </p>
        <p className={`compact-manifestation-secondary bounded-copy-4 max-w-[48ch] text-[13px] leading-[1.75] font-light transition-colors duration-300 lg:text-[15px] lg:leading-[1.85] ${
          activeThought ? "text-white/60" : "text-white/35"
        }`}>
          {secondaryLine}
        </p>
        {phase === "ready_stabilized" && isFocused && focal && (
          <p className="pt-1 text-[11px] tracking-[0.12em] text-white/22 font-light">
            {"Visible à droite."}
          </p>
        )}
      </div>

      <div className="compact-shell-signal shell-signal-strip w-full max-w-[760px]">
        <div className="shell-signal-cell">
          <span className="shell-signal-label">State</span>
          <span className="shell-signal-value">{stateLabel.replace("SYSTEM_", "").toLowerCase()}</span>
        </div>
        <div className="shell-signal-cell">
          <span className="shell-signal-label">Runtime</span>
          <span className="shell-signal-value">{runtimeLabel}</span>
        </div>
        <div className="shell-signal-cell">
          <span className="shell-signal-label">Manifestation</span>
          <span className="shell-signal-value">{focalLabel}</span>
        </div>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/28">
        {manifestationLabel}
      </p>
    </div>
  );
}
