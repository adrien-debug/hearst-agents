"use client";

import { usePathname, useRouter } from "next/navigation";
import { useNavigationStore } from "@/stores/navigation";
import { useRuntimeStore } from "@/stores/runtime";
import { useServicesStore } from "@/stores/services";
import { useFocalStore } from "@/stores/focal";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Home",
  "/missions": "Missions",
  "/assets": "Assets",
  "/apps": "Apps",
};

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const services = useServicesStore((s) => s.services);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const activeThread = useNavigationStore((s) =>
    activeThreadId ? s.threads.find((t) => t.id === activeThreadId) : undefined
  );
  const focal = useFocalStore((s) => s.focal);
  const coreState = useRuntimeStore((s) => s.coreState);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);

  const connectedCount = services.filter((s) => s.connectionStatus === "connected").length;
  const isRunning = coreState !== "idle";

  let title: string = ROUTE_TITLES[pathname] ?? "Home";
  if (pathname === "/") {
    if (focal?.title) {
      title = focal.title;
    } else if (activeThread?.name && activeThread.name !== "New") {
      title = activeThread.name;
    }
  }

  const sourcesLabel = connectedCount === 0
    ? "Aucune source"
    : `${connectedCount} source${connectedCount > 1 ? "s" : ""} · prêt`;

  return (
    <div
      className="flex items-center justify-between px-12 border-b border-[var(--border-shell)] shrink-0 relative z-30"
      style={{ height: "var(--height-topbar)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="t-13 font-medium tracking-tight text-[var(--text)] truncate" title={title}>
          {title}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {isRunning && (
          <span className="flex items-center gap-2 t-9 font-mono tracking-[0.25em] uppercase text-[var(--cykan)] halo-cyan-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--cykan)] animate-pulse halo-dot" />
            {flowLabel || "En cours"}
          </span>
        )}
        <button
          onClick={() => router.push("/apps")}
          className="halo-on-hover inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full t-9 font-mono tracking-[0.25em] uppercase border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cykan-border-hover)] transition-all bg-transparent"
          title={connectedCount > 0
            ? `${connectedCount} source${connectedCount !== 1 ? "s" : ""} connectée${connectedCount !== 1 ? "s" : ""} — Gérer`
            : "Connecter une source"}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${connectedCount > 0 ? "bg-[var(--cykan)] halo-dot" : "bg-[var(--text-ghost)]"}`}
            aria-hidden
          />
          <span>{sourcesLabel}</span>
        </button>
      </div>
    </div>
  );
}
