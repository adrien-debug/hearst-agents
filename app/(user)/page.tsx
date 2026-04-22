"use client";

/**
 * HomePage — IDLE state with centered greeting and input
 */

import { useSession } from "next-auth/react";
import { useFocalStore } from "@/stores/focal";
import { useRuntimeStore } from "@/stores/runtime";

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function HomePage() {
  const { data: session } = useSession();
  const focal = useFocalStore((s) => s.focal);
  const isRunning = useRuntimeStore((s) => s.coreState !== "idle");
  const coreState = useRuntimeStore((s) => s.coreState);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);

  const firstName = session?.user?.name?.split(" ")[0];
  const isIdle = !focal && !isRunning;

  // IDLE: Centered greeting (input is in ChatContainer below)
  if (isIdle) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <h1 className="text-[clamp(1.75rem,4vw,3rem)] font-light tracking-wide text-white/90 text-center">
          {greetingWord()}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-4 text-[15px] text-white/40 font-light text-center">
          Quoi de neuf aujourd&apos;hui ?
        </p>
      </div>
    );
  }

  // RUNNING: Status indicator
  if (!focal && isRunning) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-cyan-accent animate-pulse" />
          <span className="text-[16px] text-white/60 font-light">
            {flowLabel || "En cours..."}
          </span>
        </div>
        <p className="mt-4 text-[12px] text-white/30 font-mono uppercase tracking-wider">
          {coreState}
        </p>
      </div>
    );
  }

  // FOCAL: Content display
  if (focal) {
    return (
      <div className="h-full overflow-auto px-6 py-8">
        <div className="max-w-[720px] mx-auto">
          {/* Status + type */}
          <div className="flex items-center gap-3 mb-4">
            <div className="status-dot" />
            <span className="tag">{focal.type}</span>
          </div>

          {/* Title */}
          <h2 className="bounded-title-3 text-[1.72rem] mb-6">
            {focal.title}
          </h2>

          {/* Body */}
          {focal.body && (
            <div className="bounded-anywhere text-[15px] text-white/72 font-light leading-[1.82] whitespace-pre-wrap">
              {focal.body}
            </div>
          )}

          {!focal.body && focal.summary && (
            <div className="bounded-anywhere text-[15px] text-white/72 font-light leading-[1.82]">
              {focal.summary}
            </div>
          )}

          {focal.sections?.map((s, i) => (
            <div key={i} className="mt-8">
              {s.heading && (
                <h3 className="text-[11px] font-mono uppercase tracking-[0.24em] text-white/56 mb-2">
                  {s.heading}
                </h3>
              )}
              <p className="bounded-anywhere text-[15px] text-white/72 font-light leading-[1.82]">
                {s.body}
              </p>
            </div>
          ))}

          {focal.wordCount && (
            <p className="mt-8 text-[10px] font-mono text-white/32 tracking-[0.14em] uppercase">
              {focal.wordCount} mots
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
