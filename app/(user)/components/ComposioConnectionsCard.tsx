"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "@/app/hooks/use-toast";

interface ConnectedAccount {
  id: string;
  appName: string;
  status: string;
  createdAt?: string;
}

/**
 * Curated list of popular write-capable Composio apps. The full list (~250)
 * is available via Composio's API but pushing a curated subset here keeps
 * the first onboarding clean — power users can type any app name.
 */
const POPULAR_APPS: { slug: string; label: string; icon: string }[] = [
  { slug: "slack", label: "Slack", icon: "💬" },
  { slug: "googlecalendar", label: "Google Calendar", icon: "📅" },
  { slug: "notion", label: "Notion", icon: "📝" },
  { slug: "linear", label: "Linear", icon: "📊" },
  { slug: "github", label: "GitHub", icon: "🐙" },
  { slug: "hubspot", label: "HubSpot", icon: "🎯" },
  { slug: "salesforce", label: "Salesforce", icon: "☁️" },
  { slug: "jira", label: "Jira", icon: "🛠" },
  { slug: "asana", label: "Asana", icon: "✅" },
  { slug: "trello", label: "Trello", icon: "📋" },
];

export function ComposioConnectionsCard() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/composio/connections", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 503) setEnabled(false);
        return;
      }
      const data = (await res.json()) as { ok: boolean; connections?: ConnectedAccount[] };
      setAccounts(data.connections ?? []);
    } catch (err) {
      console.error("[Composio] failed to load connections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connectedSlugs = new Set(accounts.map((a) => a.appName.toLowerCase()));

  const handleConnect = async (slug: string) => {
    setBusy(slug);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          appName: slug,
          redirectUri: `${window.location.origin}/apps?connected=${encodeURIComponent(slug)}`,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; redirectUrl?: string; error?: string };
      if (!res.ok || !data.ok) {
        toast.error("Connexion impossible", data.error ?? "Erreur Composio");
        return;
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        toast.success("Service connecté", slug);
        await refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur réseau";
      toast.error("Connexion impossible", msg);
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async (account: ConnectedAccount) => {
    setBusy(account.id);
    try {
      const res = await fetch(`/api/composio/connections/${encodeURIComponent(account.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error("Déconnexion impossible", data.error ?? "Erreur");
        return;
      }
      toast.success("Service déconnecté", account.appName);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  if (!enabled) {
    return (
      <section className="border border-[var(--surface-2)] p-5 mb-6" aria-label="Composio">
        <div className="flex items-center gap-2 mb-2 t-9 font-mono tracking-[0.2em] uppercase text-[var(--text-faint)]">
          <span>[ Composio ]</span>
        </div>
        <p className="t-13 text-[var(--text-soft)]">
          Composio n'est pas configuré. Ajoutez <code className="text-[var(--cykan)]">COMPOSIO_API_KEY</code> à votre <code>.env.local</code> pour activer 1500+ actions agent.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-[var(--surface-2)] p-5 mb-6" aria-label="Composio">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 t-9 font-mono tracking-[0.2em] uppercase text-[var(--cykan)] halo-cyan-sm">
          <span className="opacity-60">[</span>
          <span className="font-semibold">Composio</span>
          <span className="text-[var(--text-ghost)]">·</span>
          <span className="text-[var(--text-faint)]">
            {loading ? "loading…" : `${accounts.length} connecté${accounts.length > 1 ? "s" : ""}`}
          </span>
          <span className="opacity-60">]</span>
        </div>
      </div>

      {accounts.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2" aria-label="Services connectés">
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className="inline-flex items-center gap-2 px-2 py-1 t-11 font-mono border border-[var(--cykan)]/30 text-[var(--cykan)] bg-[var(--cykan)]/[0.06]"
            >
              <span className="lowercase">{acc.appName}</span>
              <span className="text-[var(--text-ghost)]">·</span>
              <span className="text-[var(--text-faint)]">{acc.status.toLowerCase()}</span>
              <button
                onClick={() => handleDisconnect(acc)}
                disabled={busy === acc.id}
                className="ml-1 t-9 uppercase tracking-[0.15em] hover:text-[var(--danger,#ff3333)] transition-colors disabled:opacity-50"
                aria-label={`Déconnecter ${acc.appName}`}
              >
                {busy === acc.id ? "…" : "Disconnect"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 mb-2 t-9 font-mono tracking-[0.15em] uppercase text-[var(--text-faint)]">
        Ajouter un service
      </div>
      <ul className="flex flex-wrap gap-2">
        {POPULAR_APPS.map((app) => {
          const alreadyConnected = connectedSlugs.has(app.slug);
          return (
            <li key={app.slug}>
              <button
                onClick={() => handleConnect(app.slug)}
                disabled={alreadyConnected || busy === app.slug}
                className={`inline-flex items-center gap-2 px-2.5 py-1.5 t-11 font-mono border transition-all ${
                  alreadyConnected
                    ? "border-[var(--surface-2)] text-[var(--text-ghost)] cursor-not-allowed"
                    : "border-[var(--surface-2)] text-[var(--text-soft)] hover:text-[var(--cykan)] hover:border-[var(--cykan)]/30"
                }`}
                aria-disabled={alreadyConnected}
              >
                <span aria-hidden>{app.icon}</span>
                <span>{app.label}</span>
                {alreadyConnected && <span className="text-[var(--cykan)] ml-1">✓</span>}
                {busy === app.slug && <span className="ml-1 text-[var(--text-faint)]">…</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
