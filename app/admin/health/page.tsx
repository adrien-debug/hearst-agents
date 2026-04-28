import { getServerSupabase } from "@/lib/platform/db/supabase";
import { getSystemHealth, type HealthStatus } from "@/lib/admin/health";

export const dynamic = "force-dynamic";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block size-(--space-2) rounded-(--radius-full) ${ok ? "bg-money" : "bg-danger"}`} />
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
    healthy: "text-money",
    degraded: "text-warn",
    unhealthy: "text-danger",
    unknown: "text-text-faint",
  };

  const checkEntries = health
    ? (Object.entries(health.checks) as [string, boolean][])
    : [];

  return (
    <div className="p-(--space-8) space-y-(--space-8) text-text-soft">
      <div className="flex items-center gap-(--space-4)">
        <h1 className="t-24 font-light text-text">System Health</h1>
        <span className={`t-13 uppercase font-medium ${overallColor[overall]}`}>
          {overall}
        </span>
      </div>

      {dbError && (
        <div className="rounded-(--radius-md) bg-(--danger)/10 border border-(--danger)/25 p-(--space-4) text-danger t-13">
          {dbError}
        </div>
      )}

      {health && (
        <>
          <div className="grid gap-(--space-4) md:grid-cols-2 lg:grid-cols-4">
            {checkEntries.map(([name, ok]) => (
              <div
                key={name}
                className="rounded-(--radius-md) bg-surface-1 border border-(--border-shell) p-(--space-4) flex flex-col gap-(--space-2)"
              >
                <div className="flex items-center justify-between">
                  <span className="t-13 font-medium text-text-soft capitalize">{name}</span>
                  <StatusDot ok={ok} />
                </div>
                {health.latency[name as keyof typeof health.latency] !== undefined && (
                  <p className="t-10 text-text-faint">
                    Latency:{" "}
                    <span className="text-text-muted">
                      {health.latency[name as keyof typeof health.latency]}ms
                    </span>
                  </p>
                )}
                {health.details[name as keyof typeof health.details] && (
                  <p className="t-10 text-danger truncate">
                    {health.details[name as keyof typeof health.details]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="t-10 text-text-ghost">
            Checked at {new Date(health.timestamp).toLocaleString()} — v{health.version}
          </p>
        </>
      )}
    </div>
  );
}
