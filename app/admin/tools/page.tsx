import Link from "next/link";
import EmptyState from "../_components/EmptyState";
import { getServerSupabase } from "@/lib/platform/db/supabase";

export const dynamic = "force-dynamic";

interface ToolRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  http_method: string;
  endpoint_url: string | null;
  auth_type: string;
  timeout_ms: number;
  created_at: string;
}

export default async function ToolsPage() {
  let tools: ToolRow[] = [];
  let error: string | null = null;

  const sb = getServerSupabase();
  if (!sb) {
    error = "Supabase non configuré.";
  } else {
    try {
      const res = await sb
        .from("tools")
        .select("id, name, slug, description, http_method, endpoint_url, auth_type, timeout_ms, created_at")
        .order("created_at", { ascending: false });
      if (res.error) throw new Error(res.error.message);
      tools = (res.data ?? []) as unknown as ToolRow[];
    } catch (e) {
      error = e instanceof Error ? e.message : "Erreur DB";
    }
  }

  const methodColor: Record<string, string> = {
    GET: "text-[var(--money)] border-[var(--money)]/40",
    POST: "text-[var(--cyan-accent)] border-[var(--cykan)]/40",
    PUT: "text-[var(--warn)] border-[var(--warn)]/50",
    DELETE: "text-[var(--danger)] border-[var(--danger)]/50",
    PATCH: "text-purple-400 border-purple-800",
  };

  return (
    <div className="px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-[var(--text-muted)]">Hearst</p>
          <h1 className="t-28 font-semibold tracking-tight text-[var(--text)]">Tools</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Outils HTTP connectables aux agents.</p>
        </div>
        <Link
          href="/admin/tools/new"
          className="ghost-btn-solid ghost-btn-cykan rounded-sm px-4 py-2 text-sm"
        >
          + Nouveau tool
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {tools.length === 0 && !error ? (
        <EmptyState
          iconKind="tools"
          title="Pas encore d'outil"
          description="Les tools sont les actions HTTP que les agents peuvent appeler (Gmail, Slack, GCal, web search…). Charge le set dev pour démarrer avec 8 outils typiques."
          createHref="/admin/tools/new"
          createLabel="+ Créer un tool"
          seedResource="tools"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5"
            >
              <div className="flex items-start justify-between">
                <h3 className="t-11 font-semibold text-[var(--text)]">{t.name}</h3>
                <span className={`rounded-full border px-2 py-0.5 t-10 font-mono font-medium ${methodColor[t.http_method] ?? "text-[var(--text-muted)] border-[var(--line-strong)]"}`}>
                  {t.http_method}
                </span>
              </div>
              {t.description && (
                <p className="line-clamp-2 text-xs text-[var(--text-muted)]">{t.description}</p>
              )}
              <div className="flex items-center gap-3 t-10 text-[var(--text-muted)]">
                {t.endpoint_url && (
                  <span className="truncate max-w-[200px] font-mono">{t.endpoint_url}</span>
                )}
                <span>{t.auth_type}</span>
                <span>{t.timeout_ms}ms</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
