"use client";

import { useConnectorsPanel } from "@/app/hooks/use-connectors-panel";
import { getProviderUi } from "@/lib/providers/registry";

const STATUS_RING: Record<string, string> = {
  connected: "border-emerald-500/50",
  degraded: "border-amber-500/40 opacity-70",
  error: "border-red-500/40 opacity-50",
  disconnected: "border-white/10 opacity-40",
  pending_auth: "border-white/10 opacity-40",
};

const MAX_VISIBLE = 8;

export function ServiceLayer() {
  const { connections, loading } = useConnectorsPanel();

  if (loading) {
    return (
      <div className="flex items-center gap-1 px-3 py-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-6 w-6 animate-pulse rounded-md bg-white/5" />
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
        const ui = getProviderUi(conn.provider);
        const initial = ui.initial;
        const colorCls = ui.color;
        const statusCls = STATUS_RING[conn.status] ?? STATUS_RING.disconnected;
        const isConnected = conn.status === "connected";

        return (
          <div
            key={conn.provider}
            className={`group relative flex h-6 w-6 items-center justify-center rounded-md border transition-[opacity,border-color,background-color] duration-150 ${
              isConnected ? colorCls : statusCls
            } ${isConnected ? "bg-white/5" : "bg-white/3"}`}
            title={conn.label || conn.provider}
          >
            <span className={`text-[9px] font-semibold leading-none ${isConnected ? "" : "text-white/30"}`}>
              {initial}
            </span>
            <span className="pointer-events-none absolute -bottom-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/70 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {conn.label || conn.provider}
            </span>
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/3">
          <span className="text-[9px] font-medium text-white/30">+{overflow}</span>
        </div>
      )}
    </div>
  );
}
