"use client";

import Link from "next/link";
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

// ── Helpers ────────────────────────────────────────────────

function formatProviderName(raw: string): string {
  return raw
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatRelativeTime(ts?: number): string | null {
  if (!ts) return null;
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const STATUS_DOT: Record<string, string> = {
  connected: "bg-emerald-500",
  degraded: "bg-amber-400",
  error: "bg-red-500",
  disconnected: "bg-red-400",
  pending_auth: "bg-zinc-500",
};

const STATUS_LABEL: Record<string, string> = {
  connected: "Connected",
  degraded: "Degraded",
  error: "Error",
  disconnected: "Disconnected",
  pending_auth: "Pending auth",
};

const STATUS_PRIORITY: Record<string, number> = {
  error: 0,
  degraded: 1,
  disconnected: 2,
  pending_auth: 3,
  connected: 4,
};

const MAX_VISIBLE = 8;

// ── Skeletons ──────────────────────────────────────────────

function SkeletonSummary() {
  return (
    <div className="mb-2 flex animate-pulse gap-2 px-2">
      <span className="h-3 w-20 rounded bg-zinc-800/60" />
      <span className="h-3 w-16 rounded bg-zinc-800/40" />
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-2 rounded-lg px-2 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-800" />
          <span className="h-3 flex-1 rounded bg-zinc-800/60" />
          <span className="h-3 w-16 rounded bg-zinc-800/40" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

export function ConnectorsSection() {
  const { loading, error, connections, health } = useConnectorsPanel();

  const sorted = [...connections].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 5;
    const pb = STATUS_PRIORITY[b.status] ?? 5;
    if (pa !== pb) return pa - pb;
    return (a.label ?? a.provider).localeCompare(b.label ?? b.provider);
  });

  const visible = sorted.slice(0, MAX_VISIBLE);
  const hasMore = sorted.length > MAX_VISIBLE;

  return (
    <section className="mb-4">
      <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        Connections
      </h3>

      {/* Health summary */}
      {loading ? (
        <SkeletonSummary />
      ) : health && (health.healthy > 0 || health.degraded > 0 || health.disconnected > 0) ? (
        <p className="mb-2 px-2 text-[10px] text-zinc-600">
          <span className="text-emerald-500/80">{health.healthy} connected</span>
          {health.degraded > 0 && (
            <span className="text-amber-400/80"> · {health.degraded} degraded</span>
          )}
          {health.disconnected > 0 && (
            <span className="text-red-400/80"> · {health.disconnected} disconnected</span>
          )}
        </p>
      ) : !loading && !error ? (
        <p className="mb-2 px-2 text-[10px] text-zinc-600">No connection data</p>
      ) : null}

      {/* List */}
      {loading ? (
        <SkeletonRows />
      ) : error ? (
        <p className="px-2 text-xs text-zinc-600">Sign in to view connections</p>
      ) : connections.length === 0 ? (
        <div className="px-2">
          <p className="text-xs text-zinc-600">No services connected</p>
          <Link
            href="/apps"
            className="mt-1.5 inline-block rounded-md bg-zinc-800/60 px-2.5 py-1 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-zinc-300"
          >
            Open integrations
          </Link>
        </div>
      ) : (
        <div className="space-y-0.5">
          {visible.map((conn) => (
            <div
              key={conn.provider}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-zinc-900/30"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[conn.status] ?? "bg-zinc-700"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="truncate text-xs text-zinc-300">
                    {conn.label || formatProviderName(conn.provider)}
                  </p>
                  {conn.status === "disconnected" || conn.status === "pending_auth" ? (
                    canDirectConnect(conn.provider) ? (
                      <button
                        onClick={() => triggerConnect(conn.provider)}
                        className="ml-2 shrink-0 rounded bg-zinc-800/40 px-1.5 py-0.5 text-[10px] text-zinc-500 transition-colors duration-150 hover:bg-zinc-700/50 hover:text-zinc-300"
                      >
                        Connect
                      </button>
                    ) : (
                      <Link
                        href={`/apps?provider=${conn.provider}`}
                        className="ml-2 shrink-0 rounded bg-zinc-800/40 px-1.5 py-0.5 text-[10px] text-zinc-500 transition-colors duration-150 hover:bg-zinc-700/50 hover:text-zinc-300"
                      >
                        Connect
                      </Link>
                    )
                  ) : (
                    <span className="ml-2 shrink-0 text-[10px] text-zinc-600">
                      {STATUS_LABEL[conn.status] ?? conn.status}
                    </span>
                  )}
                </div>
                {conn.capabilities && conn.capabilities.length > 0 && (
                  <div className="flex gap-1">
                    {conn.capabilities.slice(0, 3).map((cap) => (
                      <span key={cap} className="rounded bg-zinc-800/30 px-1 py-px text-[8px] text-zinc-600">
                        {CAP_LABELS[cap] ?? cap}
                      </span>
                    ))}
                  </div>
                )}
                {(conn.lastCheckedAt || conn.lastError) && (
                  <p className="truncate text-[10px] text-zinc-700">
                    {conn.lastError
                      ? conn.lastError.length > 40
                        ? conn.lastError.slice(0, 40) + "…"
                        : conn.lastError
                      : `checked ${formatRelativeTime(conn.lastCheckedAt)}`}
                  </p>
                )}
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              onClick={() => console.log("[Connectors] View all")}
              className="mt-1 w-full rounded-lg px-2 py-1.5 text-center text-[10px] text-zinc-600 transition-colors hover:bg-zinc-900/40 hover:text-zinc-400"
            >
              View all connections ({sorted.length})
            </button>
          )}
        </div>
      )}
    </section>
  );
}
