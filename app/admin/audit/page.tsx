import { getServerSupabase } from "@/lib/supabase-server";
import { getAuditLogs, type AuditLog } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

const SEVERITY_COLORS: Record<string, string> = {
  info: "text-blue-400 bg-blue-500/10",
  warning: "text-amber-400 bg-amber-500/10",
  error: "text-red-400 bg-red-500/10",
  critical: "text-red-300 bg-red-600/20",
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
    <div className="p-8 space-y-8 text-white/90">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light">Audit Log</h1>
        <span className="text-sm text-white/40">{total} total, showing {logs.length}</span>
      </div>

      {dbError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">
          {dbError}
        </div>
      )}

      {/* Log table */}
      <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[160px_100px_1fr_80px_100px] gap-2 px-4 py-2 text-xs text-white/30 uppercase tracking-wider border-b border-white/[0.06]">
          <span>Time</span>
          <span>Action</span>
          <span>Resource</span>
          <span>Status</span>
          <span>Severity</span>
        </div>

        {logs.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-white/30">No audit logs found</p>
        )}

        {logs.map((log) => (
          <div
            key={log.id}
            className="grid grid-cols-[160px_100px_1fr_80px_100px] gap-2 px-4 py-2 text-sm border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
          >
            <span className="text-white/40 text-xs font-mono">
              {new Date(log.timestamp).toLocaleString()}
            </span>
            <span className="text-white/70 font-mono text-xs truncate">{log.action}</span>
            <span className="text-white/60 truncate">
              {log.resource}
              {log.resourceId && (
                <span className="text-white/30 ml-1">#{log.resourceId.slice(0, 8)}</span>
              )}
            </span>
            <span>
              {log.success ? (
                <span className="text-emerald-400 text-xs">OK</span>
              ) : (
                <span className="text-red-400 text-xs">FAIL</span>
              )}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full w-fit ${SEVERITY_COLORS[log.severity] ?? "text-white/40"}`}
            >
              {log.severity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
