import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase-server";

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
    GET: "text-emerald-400 border-emerald-800",
    POST: "text-blue-400 border-blue-800",
    PUT: "text-amber-400 border-amber-800",
    DELETE: "text-red-400 border-red-800",
    PATCH: "text-purple-400 border-purple-800",
  };

  return (
    <div className="px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">Hearst</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Tools</h1>
          <p className="mt-1 text-sm text-zinc-500">Outils HTTP connectables aux agents.</p>
        </div>
        <Link
          href="/admin/tools/new"
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
        >
          + Nouveau tool
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {tools.length === 0 && !error ? (
        <p className="text-sm text-zinc-500">Aucun tool créé.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-5"
            >
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-semibold text-white">{t.name}</h3>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium ${methodColor[t.http_method] ?? "text-zinc-400 border-zinc-800"}`}>
                  {t.http_method}
                </span>
              </div>
              {t.description && (
                <p className="line-clamp-2 text-xs text-zinc-500">{t.description}</p>
              )}
              <div className="flex items-center gap-3 text-[10px] text-zinc-600">
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
