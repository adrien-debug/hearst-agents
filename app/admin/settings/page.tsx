import { getServerSupabase } from "@/lib/supabase-server";
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
    <div className="p-8 space-y-8 text-white/90">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light">System Settings</h1>
        <span className="text-sm text-white/40">{settings.length} settings</span>
      </div>

      {dbError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">
          {dbError}
        </div>
      )}

      {/* Feature Flags */}
      <section>
        <h2 className="text-lg font-light mb-4 text-white/70">Feature Flags</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(flags).map(([key, enabled]) => (
            <div
              key={key}
              className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 flex items-center justify-between"
            >
              <span className="text-sm text-white/70 truncate mr-2">{key}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  enabled
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-white/10 text-white/40"
                }`}
              >
                {enabled ? "ON" : "OFF"}
              </span>
            </div>
          ))}
          {Object.keys(flags).length === 0 && (
            <p className="text-sm text-white/30 col-span-full">No feature flags configured</p>
          )}
        </div>
      </section>

      {/* Settings by category */}
      {categories.map((cat) => (
        <section key={cat}>
          <h2 className="text-lg font-light mb-3 text-white/70 capitalize">{cat.replace(/_/g, " ")}</h2>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] divide-y divide-white/[0.06]">
            {settings
              .filter((s) => s.category === cat)
              .map((s) => (
                <div key={s.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-white/80 font-mono truncate">{s.key}</p>
                    {s.description && (
                      <p className="text-xs text-white/30 mt-0.5">{s.description}</p>
                    )}
                  </div>
                  <div className="ml-4 text-right flex-shrink-0">
                    <p className="text-sm text-white/60 font-mono max-w-[200px] truncate">
                      {s.isEncrypted
                        ? "••••••"
                        : typeof s.value === "object"
                        ? JSON.stringify(s.value).slice(0, 40)
                        : String(s.value)}
                    </p>
                    {s.tenantId && (
                      <p className="text-[10px] text-white/20 mt-0.5">
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
