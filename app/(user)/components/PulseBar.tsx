"use client";

/**
 * PulseBar — Barre de statut globale, top fixed (post-pivot 2026-04-29).
 *
 * Trois zones :
 *   gauche  — hamburger mobile + SYSTEM_OK + CONNECTORS (bouton → /apps)
 *   centre  — titre courant (focal.title > thread.name > route > "Home")
 *   droite  — RUN_ACTIVE/IDLE + VOICE_ON + CREDITS
 */

import { useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRuntimeStore } from "@/stores/runtime";
import { useServicesStore } from "@/stores/services";
import { useStageStore } from "@/stores/stage";
import { useNavigationStore } from "@/stores/navigation";
import { useFocalStore } from "@/stores/focal";
import { GhostIconMenu } from "./ghost-icons";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Home",
  "/missions": "Missions",
  "/assets": "Assets",
  "/apps": "Apps",
};

export function PulseBar() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  const coreState = useRuntimeStore((s) => s.coreState);
  const services = useServicesStore((s) => s.services);
  const mode = useStageStore((s) => s.current.mode);

  const toggleLeftDrawer = useNavigationStore((s) => s.toggleLeftDrawer);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const activeThread = useNavigationStore((s) =>
    activeThreadId ? s.threads.find((t) => t.id === activeThreadId) : undefined,
  );
  const focal = useFocalStore((s) => s.focal);

  const connectedCount = useMemo(
    () => services.filter((s) => s.connectionStatus === "connected").length,
    [services],
  );
  const totalServices = services.length;

  const isVoiceActive = mode === "voice";
  const isRunning =
    coreState === "connecting" ||
    coreState === "streaming" ||
    coreState === "processing" ||
    coreState === "awaiting_approval" ||
    coreState === "awaiting_clarification";

  let title: string = ROUTE_TITLES[pathname] ?? "Home";
  if (pathname === "/") {
    if (focal?.title) {
      title = focal.title;
    } else if (activeThread?.name && activeThread.name !== "New") {
      title = activeThread.name;
    }
  }

  return (
    <div
      className="relative flex items-center border-b border-[var(--border-shell)] px-6 shrink-0 z-30"
      style={{ height: "var(--height-pulsebar)", background: "var(--bg-rail)" }}
    >
      {/* Gauche : hamburger mobile + SYSTEM_OK + CONNECTORS */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggleLeftDrawer}
          className="md:hidden w-7 h-7 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors shrink-0"
          aria-label="Ouvrir les conversations"
        >
          <GhostIconMenu className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <span
            className="rounded-pill bg-[var(--cykan)] halo-cyan-sm"
            style={{ width: "var(--space-1)", height: "var(--space-1)" }}
            aria-hidden
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">SYSTEM_OK</span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/apps")}
          className="flex items-center gap-2 text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
          title={
            connectedCount > 0
              ? `${connectedCount} source${connectedCount !== 1 ? "s" : ""} connectée${connectedCount !== 1 ? "s" : ""} — Gérer`
              : "Connecter une source"
          }
        >
          <span className="t-9 font-mono uppercase tracking-marquee">CONNECTORS</span>
          <span className="t-9 font-mono tracking-display text-[var(--text-muted)]">
            {connectedCount.toString().padStart(2, "0")}/{totalServices.toString().padStart(2, "0")}
          </span>
        </button>
      </div>

      {/* Centre : titre courant — positionné absolument pour rester centré */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
        style={{ maxWidth: "var(--width-title-max)" }}
      >
        <span
          className="t-13 font-medium tracking-tight text-[var(--text)] truncate block"
          title={title}
        >
          {title}
        </span>
      </div>

      {/* Droite : run/idle + voice + credits */}
      <div className="ml-auto flex items-center gap-6">
        {isRunning ? (
          <div className="flex items-center gap-2">
            <span
              className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot"
              style={{ width: "var(--space-1)", height: "var(--space-1)" }}
              aria-hidden
            />
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">RUN_ACTIVE</span>
          </div>
        ) : (
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">IDLE</span>
        )}

        {isVoiceActive && (
          <div className="flex items-center gap-2">
            <span
              className="rounded-pill bg-[var(--cykan)] halo-cyan-sm animate-pulse"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
              aria-hidden
            />
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">VOICE_ON</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">CREDITS</span>
          <span className="t-9 font-mono tracking-display text-[var(--text-muted)]">$1.00</span>
        </div>
      </div>
    </div>
  );
}
