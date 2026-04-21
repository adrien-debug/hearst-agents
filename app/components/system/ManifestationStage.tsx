"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHaloRuntime } from "@/app/lib/halo-runtime-context";
import { useFocalObject } from "@/app/hooks/use-focal-object";
import {
  deriveManifestationVisualState,
  focalStatusSubline,
  sublineForFlow,
  type ManifestationVisualState,
} from "@/app/lib/manifestation-stage-model";

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

const OVERSHOOT_MS = 380;

function overshootMultiplier(u: number): number {
  if (u <= 0 || u >= 1) return 1;
  return 1 + 0.048 * 4 * u * (1 - u);
}

function phaseBaseScale(phase: ManifestationVisualState): number {
  if (phase === "active_condensation") return 1.02;
  return 1;
}

function useNucleusOvershoot(phase: ManifestationVisualState, sizeKey: string) {
  const [mult, setMult] = useState(1);
  const rafRef = useRef<number | null>(null);
  const prevRef = useRef<string | null>(null);
  const startRef = useRef<number | null>(null);

  const cancelAnim = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startRef.current = null;
  }, []);

  useEffect(() => {
    const key = `${phase}@${sizeKey}`;
    const prev = prevRef.current;

    if (prev === null) {
      prevRef.current = key;
      setMult(1);
      return;
    }
    if (prev === key) return;

    const prevDim = prev.split("@")[1] ?? "0x0";
    const keyDim = key.split("@")[1] ?? "0x0";
    const [pw, ph] = prevDim.split("x").map((n) => Number.parseInt(n, 10) || 0);
    const [kw, kh] = keyDim.split("x").map((n) => Number.parseInt(n, 10) || 0);
    if (pw === 0 && ph === 0 && kw > 0 && kh > 0) {
      prevRef.current = key;
      setMult(1);
      return;
    }

    prevRef.current = key;
    cancelAnim();
    startRef.current = null;

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const u = Math.min(1, (now - startRef.current) / OVERSHOOT_MS);
      setMult(overshootMultiplier(u));
      if (u < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setMult(1);
        rafRef.current = null;
        startRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return cancelAnim;
  }, [phase, sizeKey, cancelAnim]);

  return mult;
}

export function ManifestationStage() {
  const { data: session } = useSession();
  const { state: halo } = useHaloRuntime();
  const { focal, isFocused } = useFocalObject();

  const shellRef = useRef<HTMLDivElement>(null);
  const [sizeKey, setSizeKey] = useState("0x0");

  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSizeKey(`${Math.round(cr.width)}x${Math.round(cr.height)}`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const firstName = session?.user?.name?.split(" ")[0];

  const phase = deriveManifestationVisualState({
    haloCore: halo.coreState,
    flowLabel: halo.flowLabel,
    emergingArtifact: halo.emergingArtifact,
    focal: focal?.title
      ? { status: focal.status, title: focal.title }
      : null,
  });

  const overshootMult = useNucleusOvershoot(phase, sizeKey);
  const nucleusScale = phaseBaseScale(phase) * overshootMult;

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

  let secondaryLine: string;
  if (focal && phase !== "idle_habited") {
    secondaryLine =
      focalStatusSubline(focal.status)
      ?? sublineForFlow(halo.flowLabel)
      ?? "Visible à droite.";
  } else {
    secondaryLine =
      sublineForFlow(halo.flowLabel)
      ?? "Tout est en place. Dites ce dont vous avez besoin.";
  }

  return (
    <div className="relative z-0 flex flex-col items-center justify-center gap-6 px-6 text-center max-w-md">
      <div
        ref={shellRef}
        className="relative mx-auto aspect-square w-40 shrink-0"
        aria-hidden
      >
        <div
          className="relative h-full w-full"
          style={{ transform: `scale(${nucleusScale})`, transformOrigin: "50% 50%" }}
        >
          {/* Outer shell — visible border on black */}
          <div
            className={`absolute inset-0 rounded-sm border transition-[opacity,border-color,box-shadow] duration-480 ease-out ${
              phase === "idle_habited"
                ? "border-white/20 opacity-70"
                : phase === "active_condensation"
                  ? "border-cyan-accent/40 opacity-90 shadow-[0_0_15px_rgba(0,229,255,0.15)]"
                  : "border-white/30 opacity-95"
            }`}
          />
          {/* Inner ring */}
          <div
            className={`pointer-events-none absolute inset-5 rounded-sm border transition-[opacity,border-color] duration-480 ease-out ${
              phase === "active_condensation" ? "border-cyan-accent/30 opacity-80" : "border-white/20 opacity-40"
            }`}
          />
          {/* Core dot */}
          <div
            className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-480 ease-out ${
              phase === "idle_habited" ? "opacity-50" : phase === "ready_stabilized" ? "opacity-100" : "opacity-90"
            }`}
          >
            <div className={`h-1.5 w-1.5 rounded-full transition-colors duration-480 ${
              phase === "active_condensation" ? "bg-cyan-accent shadow-[0_0_8px_rgba(0,229,255,0.8)]" : "bg-white"
            }`} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-light tracking-tight text-white/90 leading-snug">
          {primaryLine}
        </h1>
        <p className="text-[12px] leading-relaxed text-zinc-400 font-light max-w-[30ch] mx-auto">
          {secondaryLine}
        </p>
        {phase === "ready_stabilized" && isFocused && focal && (
          <p className="text-[10px] tracking-wide text-zinc-500 font-light pt-1">
            {"Visible à droite."}
          </p>
        )}
      </div>
    </div>
  );
}
