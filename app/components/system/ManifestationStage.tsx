"use client";

/**
 * ManifestationStage — Pure focal surface.
 *
 * No decorative halo. No complex animations.
 * Idle: centered greeting. Active: focal object full width.
 */

import { useSession } from "next-auth/react";
import { useHaloRuntime } from "@/app/lib/halo-runtime-context";
import { useFocalObject } from "@/app/hooks/use-focal-object";
import { FocalObjectRenderer } from "@/app/components/right-panel/FocalObjectRenderer";

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export function ManifestationStage() {
  const { data: session } = useSession();
  const { state: halo } = useHaloRuntime();
  const { focal } = useFocalObject();

  const firstName = session?.user?.name?.split(" ")[0];
  const isRunning = halo.coreState !== "idle";
  const hasFocal = !!focal?.title;

  // IDLE STATE: greeting centered
  if (!hasFocal && !isRunning) {
    return (
      <div className="flex flex-col items-center justify-center text-center">
        <h1 className="text-[clamp(1.5rem,3vw,2.5rem)] font-light tracking-wide text-white/90">
          {greetingWord()}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-4 text-[13px] text-white/40 font-light">
          Quoi de neuf aujourd&apos;hui ?
        </p>
      </div>
    );
  }

  // RUNNING STATE: simple pulse indicator
  if (!hasFocal && isRunning) {
    return (
      <div className="flex flex-col items-center justify-center text-center">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[15px] text-white/60 font-light">
            {halo.flowLabel || "Processing"}
          </span>
        </div>
        <p className="mt-4 text-[12px] text-white/30 font-mono uppercase tracking-wider">
          {halo.coreState}
        </p>
      </div>
    );
  }

  // FOCAL ACTIVE: render focal object
  if (focal) {
    return (
      <div className="w-full h-full flex flex-col">
        <div className="flex-1 overflow-auto">
          <FocalObjectRenderer
            object={focal}
            surface="center"
            mode="full"
          />
        </div>
      </div>
    );
  }

  return null;
}
