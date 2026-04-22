"use client";

/**
 * HomePage — Chat-first interface
 *
 * Coherent with design system
 */

import { useSession } from "next-auth/react";
import { useFocalStore } from "@/stores/focal";
import { useRuntimeStore } from "@/stores/runtime";

function greeting(): string {
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

  // IDLE: Centered greeting
  if (isIdle) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6">
        <h1 className="text-display text-center">
          {greeting()}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-body text-center mt-4 max-w-[360px]">
          Parlez-moi de vos emails, fichiers, ou agenda.
          <br />
          Je m&apos;occupe du reste.
        </p>
      </div>
    );
  }

  // RUNNING: Status
  if (!focal && isRunning) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6">
        <div className="flex items-center gap-3">
          <div className="status-dot animate-pulse" />
          <span className="text-body">
            {flowLabel || "En cours..."}
          </span>
        </div>
        <span className="text-caption mt-3 font-mono uppercase">
          {coreState}
        </span>
      </div>
    );
  }

  // FOCAL: Content display
  if (focal) {
    return (
      <div className="h-full overflow-auto px-6 py-8">
        <div className="max-w-[680px] mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="status-dot" />
            <span className="text-label">{focal.type}</span>
          </div>

          {/* Title */}
          <h2 className="text-title mb-6">
            {focal.title}
          </h2>

          {/* Body */}
          {focal.body && (
            <div className="text-body leading-relaxed whitespace-pre-wrap">
              {focal.body}
            </div>
          )}

          {!focal.body && focal.summary && (
            <p className="text-body leading-relaxed">
              {focal.summary}
            </p>
          )}

          {/* Sections */}
          {focal.sections?.map((s, i) => (
            <div key={i} className="mt-8">
              {s.heading && (
                <h3 className="text-label mb-2">{s.heading}</h3>
              )}
              <p className="text-body leading-relaxed">{s.body}</p>
            </div>
          ))}

          {/* Meta */}
          {focal.wordCount && (
            <p className="text-caption mt-8 font-mono">
              {focal.wordCount} mots
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
