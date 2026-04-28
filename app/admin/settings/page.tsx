import { getServerSupabase } from "@/lib/platform/db/supabase";
import { getSystemSettings, getFeatureFlags } from "@/lib/admin/settings";
import type { SystemSetting } from "@/lib/platform/settings/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sb = getServerSupabase();
  let settings: SystemSetting[] = [];
  let flags: Record<string, boolean> = {};
  let dbError: string | null = null;

  if (sb) {
    try {
      [settings, flags] = await Promise.all([
        getSystemSettings(sb),
        getFeatureFlags(sb),
      ]);
    } catch (e) {
      dbError = e instanceof Error ? e.message : "Unknown error";
    }
  } else {
    dbError = "Supabase not configured";
  }

  const categories = [...new Set(settings.map((s) => s.category))].sort();

  return (
    <div className="p-(--space-8) space-y-(--space-8) text-[var(--text-soft)]">
      <div className="flex items-center justify-between">
        <h1 className="t-24 font-light">System Settings</h1>
        <span className="t-13 text-[var(--text-ghost)]">{settings.length} settings</span>
      </div>

      {dbError && (
        <div className="rounded-(--radius-lg) bg-[var(--danger)]/10 border border-[var(--danger)]/25 p-4 text-[var(--danger)] t-13">
          {dbError}
        </div>
      )}

      {/* Feature Flags */}
      <section>
        <h2 className="t-13 font-light mb-4 text-[var(--text-muted)]">Feature Flags</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(flags).map(([key, enabled]) => (
            <div
              key={key}
              className="rounded-(--radius-lg) bg-[var(--card-flat-bg)] border border-[var(--card-flat-border)] p-3 flex items-center justify-between"
            >
              <span className="t-13 text-[var(--text-muted)] truncate mr-2">{key}</span>
              <span
                className={`t-9 px-2 py-0.5 rounded-pill ${
                  enabled
                    ? "bg-[var(--money)]/20 text-[var(--money)]"
                    : "bg-[var(--surface-2)] text-[var(--text-ghost)]"
                }`}
              >
                {enabled ? "ON" : "OFF"}
              </span>
            </div>
          ))}
          {Object.keys(flags).length === 0 && (
            <p className="t-13 text-[var(--text-ghost)] col-span-full">No feature flags configured</p>
          )}
        </div>
      </section>

      {/* Settings by category */}
      {categories.map((cat) => (
        <section key={cat}>
          <h2 className="t-13 font-light mb-3 text-[var(--text-muted)] capitalize">{cat.replace(/_/g, " ")}</h2>
          <div className="rounded-(--radius-lg) bg-[var(--card-flat-bg)] border border-[var(--card-flat-border)] divide-y divide-[var(--card-flat-border)]">
            {settings
              .filter((s) => s.category === cat)
              .map((s) => (
                <div key={s.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="t-13 text-[var(--text-soft)] font-mono truncate">{s.key}</p>
                    {s.description && (
                      <p className="t-9 text-[var(--text-ghost)] mt-0.5">{s.description}</p>
                    )}
                  </div>
                  <div className="ml-4 text-right flex-shrink-0">
                    <p className="t-13 text-[var(--text-muted)] font-mono max-w-[200px] truncate">
                      {s.isEncrypted
                        ? "••••••"
                        : typeof s.value === "object"
                        ? JSON.stringify(s.value).slice(0, 40)
                        : String(s.value)}
                    </p>
                    {s.tenantId && (
                      <p className="t-10 text-[var(--text-faint)] mt-0.5">
                        tenant: {s.tenantId.slice(0, 8)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
