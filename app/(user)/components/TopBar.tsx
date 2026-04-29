"use client";

import { usePathname, useRouter } from "next/navigation";
import { useNavigationStore } from "@/stores/navigation";
import { useServicesStore } from "@/stores/services";
import { useFocalStore } from "@/stores/focal";
import { GhostIconMenu } from "./ghost-icons";

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
  const toggleLeftDrawer = useNavigationStore((s) => s.toggleLeftDrawer);
  const focal = useFocalStore((s) => s.focal);

  const connectedCount = services.filter((s) => s.connectionStatus === "connected").length;

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
        <button
          type="button"
          onClick={toggleLeftDrawer}
          className="md:hidden -ml-3 mr-1 w-9 h-9 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors shrink-0"
          aria-label="Ouvrir les conversations"
          title="Conversations"
        >
          <GhostIconMenu className="w-5 h-5" />
        </button>
        <span
          className="t-13 font-medium tracking-tight text-[var(--text)] truncate"
          style={{ maxWidth: "var(--width-title-max)" }}
          title={title}
        >
          {title}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/apps")}
          className="halo-on-hover inline-flex items-center gap-2 px-2.5 py-1.5 rounded-pill t-9 font-mono tracking-banner uppercase border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cykan-border-hover)] transition-all bg-transparent"
          title={connectedCount > 0
            ? `${connectedCount} source${connectedCount !== 1 ? "s" : ""} connectée${connectedCount !== 1 ? "s" : ""} — Gérer`
            : "Connecter une source"}
        >
          <span
            className={`w-1.5 h-1.5 rounded-pill ${connectedCount > 0 ? "bg-[var(--cykan)] halo-dot" : "bg-[var(--text-ghost)]"}`}
            aria-hidden
          />
          <span>{sourcesLabel}</span>
        </button>
      </div>
    </div>
  );
}
