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
    PATCH: "text-[var(--accent-llm)] border-[var(--accent-llm)]/50",
  };

  return (
    <div className="px-(--space-8) py-(--space-10)">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="t-9 font-medium uppercase tracking-(--tracking-brand) text-[var(--text-muted)]">Hearst</p>
          <h1 className="t-28 font-semibold tracking-(--tracking-tight) text-[var(--text)]">Tools</h1>
          <p className="mt-1 t-13 text-[var(--text-muted)]">Outils HTTP connectables aux agents.</p>
        </div>
        <Link
          href="/admin/tools/new"
          className="ghost-btn-solid ghost-btn-cykan rounded-(--radius-sm) px-4 py-2 t-13"
        >
          + Nouveau tool
        </Link>
      </div>

      {error && (
        <div className="mb-(--space-6) admin-callout-danger t-13 text-[var(--danger)]">
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
              className="flex flex-col gap-2 rounded-(--radius-sm) border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5"
            >
              <div className="flex items-start justify-between">
                <h3 className="t-11 font-semibold text-[var(--text)]">{t.name}</h3>
                <span className={`rounded-pill border px-2 py-0.5 t-10 font-mono font-medium ${methodColor[t.http_method] ?? "text-[var(--text-muted)] border-[var(--line-strong)]"}`}>
                  {t.http_method}
                </span>
              </div>
              {t.description && (
                <p className="line-clamp-2 t-9 text-[var(--text-muted)]">{t.description}</p>
              )}
              <div className="flex items-center gap-3 t-10 text-[var(--text-muted)]">
                {t.endpoint_url && (
                  <span className="truncate max-w-[var(--width-admin-code-clip)] font-mono">{t.endpoint_url}</span>
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
