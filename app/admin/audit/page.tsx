import { getServerSupabase } from "@/lib/platform/db/supabase";
import { getAuditLogs, type AuditLog } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

const SEVERITY_COLORS: Record<string, string> = {
  info: "text-cyan-accent bg-(--cykan)/10",
  warning: "text-warn bg-(--warn)/10",
  error: "text-danger bg-(--danger)/10",
  critical: "text-danger bg-(--danger)/15",
};

export default async function AuditPage() {
  const sb = getServerSupabase();
  let logs: AuditLog[] = [];
  let total = 0;
  let dbError: string | null = null;

  if (sb) {
    try {
      const result = await getAuditLogs(sb, { limit: 50 });
      logs = result.logs;
      total = result.total;
    } catch (e) {
      dbError = e instanceof Error ? e.message : "Unknown error";
    }
  } else {
    dbError = "Supabase not configured";
  }

  return (
    <div className="p-(--space-8) space-y-(--space-8) text-text-soft">
      <div className="flex items-center justify-between">
        <h1 className="t-24 font-light text-text">Audit Log</h1>
        <span className="t-13 text-text-faint">{total} total, showing {logs.length}</span>
      </div>

      {dbError && (
        <div className="rounded-(--radius-md) bg-(--danger)/10 border border-(--danger)/25 p-(--space-4) text-danger t-13">
          {dbError}
        </div>
      )}

      {/* Log table */}
      <div className="rounded-(--radius-md) bg-surface-1 border border-(--border-shell) overflow-hidden">
        <div className="grid grid-cols-[160px_100px_1fr_80px_100px] gap-(--space-2) px-(--space-4) py-(--space-2) t-10 text-text-ghost uppercase tracking-(--tracking-stretch) border-b border-(--border-shell)">
          <span>Time</span>
          <span>Action</span>
          <span>Resource</span>
          <span>Status</span>
          <span>Severity</span>
        </div>

        {logs.length === 0 && (
          <p className="px-(--space-4) py-(--space-8) text-center t-13 text-text-ghost">No audit logs found</p>
        )}

        {logs.map((log) => (
          <div
            key={log.id}
            className="grid grid-cols-[160px_100px_1fr_80px_100px] gap-(--space-2) px-(--space-4) py-(--space-2) t-13 border-b border-line hover:bg-surface-2 transition-colors"
          >
            <span className="text-text-faint t-10 font-mono">
              {new Date(log.timestamp).toLocaleString()}
            </span>
            <span className="text-text-muted font-mono t-10 truncate">{log.action}</span>
            <span className="text-text-muted truncate">
              {log.resource}
              {log.resourceId && (
                <span className="text-text-ghost ml-(--space-1)">#{log.resourceId.slice(0, 8)}</span>
              )}
            </span>
            <span>
              {log.success ? (
                <span className="text-money t-10">OK</span>
              ) : (
                <span className="text-danger t-10">FAIL</span>
              )}
            </span>
            <span
              className={`t-10 px-(--space-2) py-[2px] rounded-pill w-fit ${SEVERITY_COLORS[log.severity] ?? "text-text-faint"}`}
            >
              {log.severity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
