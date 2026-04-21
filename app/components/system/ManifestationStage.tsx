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

  const animClass = STATE_ANIM[phase] ?? "";

  return (
    <div className="relative z-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
      {/* Ghost Core */}
      <div
        className={`relative flex items-center justify-center shrink-0 ${animClass}`}
        style={{ width: 80, height: 80 }}
        aria-hidden
      >
        <svg
          className="dotted-logo absolute inset-0 w-full h-full"
          viewBox={GHOST_SVG_VIEWBOX}
          style={{ opacity: 0.1, filter: "blur(8px)", animation: "aura-pulse 4s infinite ease-in-out" }}
        >
          {GHOST_SVG_PATHS}
        </svg>
        <svg
          className="dotted-logo w-10 h-10 relative z-10"
          viewBox={GHOST_SVG_VIEWBOX}
          style={{
            filter: "drop-shadow(0 0 10px rgba(0, 229, 255, 0.2))",
            opacity: 0.5,
            animation: phase === "active_condensation"
              ? "thinking-vibe 2s infinite ease-in-out"
              : "ghost-float 6s infinite ease-in-out",
          }}
        >
          {GHOST_SVG_PATHS}
        </svg>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <h1 className="text-base font-light tracking-[0.08em] uppercase text-white/70">
          {primaryLine}
        </h1>
        <p className={`font-mono text-[8px] tracking-[0.3em] transition-colors duration-300 ${
          activeThought ? "text-cyan-accent/60" : "text-cyan-accent/25"
        }`}>
          {stateLabel}
        </p>
        <p className={`text-[11px] leading-relaxed font-light max-w-[40ch] transition-colors duration-300 ${
          activeThought ? "text-white/50" : "text-white/25"
        }`}>
          {secondaryLine}
        </p>
        {phase === "ready_stabilized" && isFocused && focal && (
          <p className="text-[9px] tracking-wide text-white/20 font-light pt-0.5">
            {"Visible à droite."}
          </p>
        )}
      </div>
    </div>
  );
}
