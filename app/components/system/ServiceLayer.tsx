"use client";

import { useConnectorsPanel } from "@/app/hooks/use-connectors-panel";

const PROVIDER_INITIALS: Record<string, string> = {
  google: "G",
  slack: "S",
  notion: "N",
  github: "GH",
  linear: "L",
  stripe: "St",
  discord: "D",
  whatsapp: "W",
};

const PROVIDER_COLOR: Record<string, string> = {
  google: "border-blue-400/40 text-blue-400",
  slack: "border-purple-400/40 text-purple-400",
  notion: "border-zinc-300/40 text-zinc-300",
  github: "border-zinc-300/40 text-zinc-300",
  linear: "border-indigo-400/40 text-indigo-400",
  stripe: "border-violet-400/40 text-violet-400",
};

const STATUS_RING: Record<string, string> = {
  connected: "border-emerald-500/50",
  degraded: "border-amber-500/40 opacity-70",
  error: "border-red-500/40 opacity-50",
  disconnected: "border-zinc-700 opacity-40",
  pending_auth: "border-zinc-700 opacity-40",
};

const MAX_VISIBLE = 8;

export function ServiceLayer() {
  const { connections, loading } = useConnectorsPanel();

  if (loading) {
    return (
      <div className="flex items-center gap-1 px-3 py-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-6 w-6 animate-pulse rounded-md bg-zinc-800/40" />
        ))}
      </div>
    );
  }

  if (connections.length === 0) return null;

  const visible = connections.slice(0, MAX_VISIBLE);
  const overflow = connections.length - MAX_VISIBLE;

  return (
    <div className="flex items-center gap-1 px-3 py-1">
      {visible.map((conn) => {
        const initial = PROVIDER_INITIALS[conn.provider] ?? conn.provider.charAt(0).toUpperCase();
        const colorCls = PROVIDER_COLOR[conn.provider] ?? "border-zinc-600/40 text-zinc-400";
        const statusCls = STATUS_RING[conn.status] ?? STATUS_RING.disconnected;
        const isConnected = conn.status === "connected";

        return (
          <div
            key={conn.provider}
            className={`group relative flex h-6 w-6 items-center justify-center rounded-md border transition-all duration-150 ${
              isConnected ? colorCls : statusCls
            } ${isConnected ? "bg-zinc-900/60" : "bg-zinc-900/30"}`}
            title={conn.label || conn.provider}
          >
            <span className={`text-[9px] font-semibold leading-none ${isConnected ? "" : "text-zinc-600"}`}>
              {initial}
            </span>
            <span className="pointer-events-none absolute -bottom-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-300 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
              {conn.label || conn.provider}
            </span>
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-800/40 bg-zinc-900/30">
          <span className="text-[9px] font-medium text-zinc-600">+{overflow}</span>
        </div>
      )}
    </div>
  );
}
