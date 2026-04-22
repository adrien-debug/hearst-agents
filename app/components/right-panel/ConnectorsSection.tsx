"use client";

import { useConnectorsPanel } from "@/app/hooks/use-connectors-panel";
import { canDirectConnect, triggerConnect } from "@/app/lib/connect-actions";

const CAP_LABELS: Record<string, string> = {
  messaging: "Msg",
  calendar: "Cal",
  files: "Files",
  research: "Research",
  crm: "CRM",
  finance: "Finance",
  design: "Design",
  commerce: "Commerce",
  developer_tools: "Dev",
  automation: "Auto",
};

function formatProviderName(raw: string): string {
  return raw
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const STATUS_DOT: Record<string, string> = {
  connected: "bg-emerald-500",
  degraded: "bg-amber-400",
  error: "bg-red-500",
  disconnected: "bg-white/20",
  pending_auth: "bg-white/20",
};

export default function ConnectorsSection() {
  const { connections, loading, error } = useConnectorsPanel();

  const sorted = connections.slice().sort((a, b) => {
    const statusOrder: Record<string, number> = {
      error: 0, degraded: 1, disconnected: 2, pending_auth: 3, connected: 4,
    };
    return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
  });

  const visible = sorted.slice(0, 5);
  const connectedCount = sorted.filter((c) => c.status === "connected").length;

  if (loading) {
    return (
      <div className="px-4">
        <div className="mb-2">
          <span className="text-[10px] text-white/25 uppercase tracking-wider">Connectors</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
              <span className="h-3 w-24 rounded bg-white/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4">
        <div className="mb-2">
          <span className="text-[10px] text-white/25 uppercase tracking-wider">Connectors</span>
        </div>
        <p className="text-[11px] text-white/30">Unavailable</p>
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="px-4">
        <div className="mb-2">
          <span className="text-[10px] text-white/25 uppercase tracking-wider">Connectors</span>
        </div>
        <p className="text-[11px] text-white/30">No services connected</p>
        <button
          onClick={() => {}}
          className="mt-2 text-[10px] text-cyan-400/60 hover:text-cyan-400"
        >
          Add connection →
        </button>
      </div>
    );
  }

  return (
    <div className="px-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] text-white/25 uppercase tracking-wider">Connectors</span>
        <span className="text-[9px] text-white/20">{connectedCount}/{connections.length}</span>
      </div>
      <div className="space-y-1">
        {visible.map((conn) => (
          <div key={conn.provider} className="flex items-center gap-2 py-1">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[conn.status] ?? "bg-white/10"}`} />
            <span className="flex-1 truncate text-[12px] text-white/50">
              {conn.label || formatProviderName(conn.provider)}
            </span>
            {conn.status === "disconnected" || conn.status === "pending_auth" ? (
              canDirectConnect(conn.provider) ? (
                <button
                  onClick={() => triggerConnect(conn.provider)}
                  className="text-[9px] text-cyan-400/60 hover:text-cyan-400 uppercase"
                >
                  Connect
                </button>
              ) : (
                <span className="text-[9px] text-white/20">Setup required</span>
              )
            ) : (
              <span className="text-[9px] text-white/20">
                {conn.capabilities?.slice(0, 2).map((c) => CAP_LABELS[c] ?? c).join(", ")}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
