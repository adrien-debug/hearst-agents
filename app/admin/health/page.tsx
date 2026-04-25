import { getServerSupabase } from "@/lib/supabase-server";
import { getSystemHealth, type HealthStatus } from "@/lib/admin/health";

export const dynamic = "force-dynamic";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
  );
}

export default async function HealthPage() {
  const sb = getServerSupabase();
  let health: HealthStatus | null = null;
  let dbError: string | null = null;

  if (sb) {
    try {
      health = await getSystemHealth(sb);
    } catch (e) {
      dbError = e instanceof Error ? e.message : "Unknown error";
    }
  } else {
    dbError = "Supabase not configured";
  }

  const overall = health?.status ?? "unknown";
  const overallColor: Record<string, string> = {
    healthy: "text-emerald-400",
    degraded: "text-amber-400",
    unhealthy: "text-red-400",
    unknown: "text-white/40",
  };

  const checkEntries = health
    ? (Object.entries(health.checks) as [string, boolean][])
    : [];

  return (
    <div className="p-8 space-y-8 text-white/90">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-light">System Health</h1>
        <span className={`text-sm uppercase font-medium ${overallColor[overall]}`}>
          {overall}
        </span>
      </div>

      {dbError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">
          {dbError}
        </div>
      )}

      {health && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {checkEntries.map(([name, ok]) => (
              <div
                key={name}
                className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white/80 capitalize">{name}</span>
                  <StatusDot ok={ok} />
                </div>
                {health.latency[name as keyof typeof health.latency] !== undefined && (
                  <p className="text-xs text-white/40">
                    Latency:{" "}
                    <span className="text-white/60">
                      {health.latency[name as keyof typeof health.latency]}ms
                    </span>
                  </p>
                )}
                {health.details[name as keyof typeof health.details] && (
                  <p className="text-xs text-red-400 truncate">
                    {health.details[name as keyof typeof health.details]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-white/20">
            Checked at {new Date(health.timestamp).toLocaleString()} — v{health.version}
          </p>
        </>
      )}
    </div>
  );
}
