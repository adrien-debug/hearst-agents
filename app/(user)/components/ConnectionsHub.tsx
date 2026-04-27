"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "@/app/hooks/use-toast";

interface ConnectedAccount {
  id: string;
  appName: string;
  status: string;
}

interface ComposioApp {
  key: string;
  name: string;
  description: string;
  logo: string;
  categories: string[];
  noAuth: boolean;
}

interface DiscoveredTool {
  name: string;
  description: string;
  app: string;
}

const CATEGORY_ORDER: { id: string; label: string; icon: string }[] = [
  { id: "communication", label: "Communication", icon: "💬" },
  { id: "productivity", label: "Productivité", icon: "📋" },
  { id: "crm", label: "CRM & Ventes", icon: "🎯" },
  { id: "developer-tools", label: "Développement", icon: "🛠" },
  { id: "design", label: "Design", icon: "🎨" },
  { id: "ats", label: "RH & Recrutement", icon: "👥" },
  { id: "scheduling", label: "Planification", icon: "📅" },
  { id: "ai", label: "IA & Données", icon: "🤖" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "marketing", label: "Marketing", icon: "📢" },
  { id: "finance", label: "Finance", icon: "💳" },
  { id: "ticketing", label: "Support", icon: "🎫" },
];

const APPS_PER_CATEGORY_PREVIEW = 8;

function categorizeApp(app: ComposioApp): string {
  for (const cat of CATEGORY_ORDER) {
    if (app.categories.includes(cat.id)) return cat.id;
  }
  return app.categories[0] ?? "other";
}

interface DrawerState {
  app: ComposioApp;
  connectedAccount?: ConnectedAccount;
}

export function ConnectionsHub() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [apps, setApps] = useState<ComposioApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [drawerActions, setDrawerActions] = useState<DiscoveredTool[] | null>(null);
  const [drawerLoadingActions, setDrawerLoadingActions] = useState(false);
  const [showAllInCat, setShowAllInCat] = useState<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/composio/connections", { credentials: "include" });
      if (res.status === 503) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setEnabled(false);
        setSdkError(data.message ?? "Composio not configured");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSdkError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSdkError(null);
      const data = (await res.json()) as { connections?: ConnectedAccount[] };
      setAccounts(data.connections ?? []);
    } catch (err) {
      console.error("[Composio] failed to load connections", err);
      setSdkError(err instanceof Error ? err.message : "network_error");
    }
  }, []);

  const loadApps = useCallback(async () => {
    try {
      const res = await fetch("/api/composio/apps", { credentials: "include" });
      if (res.status === 503) {
        // refreshAccounts already surfaced the error; no double-toast.
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { apps?: ComposioApp[] };
      setApps(data.apps ?? []);
    } catch (err) {
      console.error("[Composio] failed to load apps catalog", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Initial load on mount. The eslint disable below is intentional:
    // refreshAccounts / loadApps are useCallbacks that setState as part
    // of their async work, which is exactly the load-on-mount pattern
    // the rule warns about. The cancellation guard prevents post-unmount
    // updates; the deferred setLoading runs in a microtask after the
    // promise resolves, which is the documented React 19 escape hatch.
    queueMicrotask(() => {
      if (cancelled) return;
      void Promise.all([refreshAccounts(), loadApps()]).finally(() => {
        if (!cancelled) setLoading(false);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshAccounts, loadApps]);

  const connectedSlugs = useMemo(
    () => new Set(accounts.map((a) => a.appName.toLowerCase())),
    [accounts],
  );

  const connectedApps = useMemo(
    () => apps.filter((a) => connectedSlugs.has(a.key)),
    [apps, connectedSlugs],
  );

  const appsByCategory = useMemo(() => {
    const map = new Map<string, ComposioApp[]>();
    for (const app of apps) {
      const cat = categorizeApp(app);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(app);
    }
    return map;
  }, [apps]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return apps.filter(
      (a) =>
        a.key.includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q),
    );
  }, [apps, searchQuery]);

  const openDrawer = useCallback(
    async (app: ComposioApp) => {
      const connected = accounts.find((a) => a.appName.toLowerCase() === app.key);
      setDrawer({ app, connectedAccount: connected });
      setDrawerActions(null);

      // Lazy-load the action list ONLY when the user has connected this app
      // (otherwise we don't know what they can do — Composio filters per
      // entityId). Show a small set of example actions.
      if (connected) {
        setDrawerLoadingActions(true);
        try {
          const res = await fetch(`/api/composio/tools?apps=${encodeURIComponent(app.key)}`, {
            credentials: "include",
          });
          if (res.ok) {
            const data = (await res.json()) as { tools?: DiscoveredTool[] };
            setDrawerActions(data.tools ?? []);
          }
        } finally {
          setDrawerLoadingActions(false);
        }
      }
    },
    [accounts],
  );

  const closeDrawer = useCallback(() => {
    setDrawer(null);
    setDrawerActions(null);
  }, []);

  const handleConnect = useCallback(
    async (app: ComposioApp) => {
      setBusy(app.key);
      try {
        const res = await fetch("/api/composio/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            appName: app.key,
            redirectUri: `${window.location.origin}/apps?connected=${encodeURIComponent(app.key)}`,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          redirectUrl?: string;
          error?: string;
          errorCode?: string;
          details?: unknown;
        };

        if (!res.ok || !data.ok) {
          // Server-friendly message already includes the dashboard URL when relevant.
          const message = data.error ?? "Erreur Composio";
          console.error(
            `[Composio] Connect failed for ${app.key}: code=${data.errorCode} message=${message}`,
            data.details,
          );
          toast.error(`Connexion ${app.name} impossible`, message);

          // For NO_INTEGRATION / AUTH_CONFIG_REQUIRED, open the Composio dashboard
          // in a new tab so the user can fix it without leaving Hearst.
          if (data.errorCode === "NO_INTEGRATION" || data.errorCode === "AUTH_CONFIG_REQUIRED") {
            window.open(
              `https://app.composio.dev/app/${encodeURIComponent(app.key)}`,
              "_blank",
              "noopener,noreferrer",
            );
          }
          return;
        }
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
        toast.success(`${app.name} connecté`, "Demande à Hearst d'utiliser ce service");
        await refreshAccounts();
      } catch (err) {
        toast.error("Connexion impossible", err instanceof Error ? err.message : "Erreur réseau");
      } finally {
        setBusy(null);
      }
    },
    [refreshAccounts],
  );

  const handleDisconnect = useCallback(
    async (account: ConnectedAccount) => {
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
        await refreshAccounts();
        closeDrawer();
      } finally {
        setBusy(null);
      }
    },
    [refreshAccounts, closeDrawer],
  );

  // Show connection toast on /apps?connected=slack landing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (connected) {
      toast.success(
        `${connected} connecté ✓`,
        `Demande à Hearst d'utiliser ${connected} dans le chat`,
      );
      // Clean up URL so refresh doesn't re-toast
      window.history.replaceState({}, "", window.location.pathname);
      // Invalidate the server-side Composio discovery cache so the next chat
      // turn sees the new toolkit immediately (otherwise the user would wait
      // up to 5 minutes for the cache to expire on warm instances).
      void fetch("/api/composio/invalidate-cache", {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
      // Defer the refresh to the next microtask — refreshAccounts setStates
      // internally, and the rule warns about synchronous setState in effects.
      queueMicrotask(() => void refreshAccounts());
    }
  }, [refreshAccounts]);

  if (!enabled) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24">
        <p className="ghost-meta-label">COMPOSIO_UNAVAILABLE</p>
        <p className="t-13 text-[var(--text-soft)] max-w-md text-center leading-relaxed">
          {sdkError ?? "Composio n'est pas configuré."}
        </p>
        <p className="t-11 text-[var(--text-faint)] max-w-md text-center leading-relaxed">
          Vérifie <code className="text-[var(--cykan)]">COMPOSIO_API_KEY</code> dans{" "}
          <code>.env.local</code>, ou ouvre le diagnostic pour un app spécifique :
        </p>
        <a
          href="/api/composio/diagnose?app=slack"
          target="_blank"
          rel="noopener noreferrer"
          className="t-11 font-mono tracking-[0.15em] uppercase text-[var(--cykan)] hover:underline"
        >
          /api/composio/diagnose →
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 py-24">
        <p className="ghost-meta-label">LOAD_CATALOG</p>
        <div className="w-full max-w-xs space-y-2">
          <div className="ghost-skeleton-bar" />
          <div className="ghost-skeleton-bar" />
          <div className="ghost-skeleton-bar" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--bg)] border-b border-[var(--surface-2)] px-8 py-5">
        <div className="max-w-[1100px] mx-auto">
          <div className="flex items-center gap-3 mb-3 t-9 font-mono tracking-[0.25em] uppercase">
            <span className="text-[var(--cykan)] halo-cyan-sm">[ Connections ]</span>
            <span className="text-[var(--text-ghost)]">·</span>
            <span className="text-[var(--text-faint)]">
              {accounts.length} connecté{accounts.length > 1 ? "s" : ""}
            </span>
            <span className="text-[var(--text-ghost)]">·</span>
            <span className="text-[var(--text-faint)]">{apps.length} disponibles</span>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowAllInCat(null);
            }}
            placeholder="Connecte un service ou cherche par nom (Slack, Notion, …)"
            className="ghost-input-line w-full"
          />
        </div>
      </div>

      {/* Body */}
      <div className="max-w-[1100px] mx-auto px-8 py-6">
        {/* Search results override everything else */}
        {searchResults !== null ? (
          <SearchResults
            results={searchResults}
            connectedSlugs={connectedSlugs}
            onSelect={openDrawer}
          />
        ) : (
          <>
            {/* Connected services */}
            {connectedApps.length > 0 && (
              <section className="mb-10">
                <div className="mb-4">
                  <SectionHeader
                    icon="✓"
                    label="Connectés"
                    count={connectedApps.length}
                    accentClass="text-[var(--cykan)] halo-cyan-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {connectedApps.map((app) => (
                    <AppCard
                      key={app.key}
                      app={app}
                      connected
                      onClick={() => openDrawer(app)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* By category */}
            {CATEGORY_ORDER.map((cat) => {
              const list = appsByCategory.get(cat.id) ?? [];
              if (list.length === 0) return null;
              const isExpanded = showAllInCat === cat.id;
              const visible = isExpanded ? list : list.slice(0, APPS_PER_CATEGORY_PREVIEW);
              const overflow = list.length - visible.length;
              return (
                <section key={cat.id} className="mb-10">
                  <div className="flex items-center justify-between mb-4">
                    <SectionHeader icon={cat.icon} label={cat.label} count={list.length} />
                    {!isExpanded && overflow > 0 && (
                      <button
                        onClick={() => setShowAllInCat(cat.id)}
                        className="t-9 font-mono tracking-[0.15em] uppercase text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
                      >
                        Voir tout ({list.length}) →
                      </button>
                    )}
                    {isExpanded && (
                      <button
                        onClick={() => setShowAllInCat(null)}
                        className="t-9 font-mono tracking-[0.15em] uppercase text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
                      >
                        ← Réduire
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {visible.map((app) => (
                      <AppCard
                        key={app.key}
                        app={app}
                        connected={connectedSlugs.has(app.key)}
                        onClick={() => openDrawer(app)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>

      {/* Drawer */}
      {drawer && (
        <AppDrawer
          state={drawer}
          actions={drawerActions}
          loadingActions={drawerLoadingActions}
          busy={busy === drawer.app.key || busy === drawer.connectedAccount?.id}
          onClose={closeDrawer}
          onConnect={() => handleConnect(drawer.app)}
          onDisconnect={
            drawer.connectedAccount
              ? () => handleDisconnect(drawer.connectedAccount!)
              : undefined
          }
        />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function SectionHeader({
  icon,
  label,
  count,
  accentClass,
}: {
  icon: string;
  label: string;
  count: number;
  accentClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 t-11 font-mono tracking-[0.2em] uppercase">
      <span aria-hidden>{icon}</span>
      <span className={accentClass ?? "text-[var(--text-soft)]"}>{label}</span>
      <span className="text-[var(--text-ghost)]">·</span>
      <span className="text-[var(--text-faint)]">{count}</span>
    </div>
  );
}

/**
 * AppCard — unified visual for the apps grid.
 *
 * Logo-first design: 56×56 logo top-left, name + status to its right,
 * description on a second line. Connected variant gets a cyan halo +
 * "active" badge; default variant stays muted until hover.
 */
function AppCard({
  app,
  connected,
  onClick,
}: {
  app: ComposioApp;
  connected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group text-left flex flex-col gap-3 p-5 border transition-all ${
        connected
          ? "border-[var(--cykan)]/40 bg-[var(--cykan)]/[0.05] hover:bg-[var(--cykan)]/[0.10] hover:border-[var(--cykan)]/60"
          : "border-[var(--surface-2)] bg-[var(--surface)]/40 hover:border-[var(--cykan)]/30 hover:bg-[var(--surface-1)]"
      }`}
      style={{ minHeight: 156 }}
      aria-label={`${app.name}${connected ? " — connecté" : ""}`}
    >
      <div className="flex items-start gap-4">
        <AppLogo app={app} size={56} />
        <div className="flex-1 min-w-0 pt-1">
          <div className="t-15 font-medium text-[var(--text)] truncate">{app.name}</div>
          {connected ? (
            <div className="mt-1 flex items-center gap-1.5 t-9 font-mono tracking-[0.2em] uppercase text-[var(--cykan)]">
              <span className="w-1 h-1 rounded-full bg-[var(--cykan)] halo-dot" />
              active
            </div>
          ) : (
            <div className="mt-1 t-9 font-mono tracking-[0.2em] uppercase text-[var(--text-ghost)] opacity-0 group-hover:opacity-100 transition-opacity">
              connecter →
            </div>
          )}
        </div>
      </div>
      {app.description && (
        <p className="t-11 text-[var(--text-faint)] line-clamp-2 leading-[1.4] mt-auto">
          {app.description}
        </p>
      )}
    </button>
  );
}

function AppLogo({ app, size = 16 }: { app: ComposioApp; size?: number }) {
  // Bigger logos get a soft surface frame so colorful brand marks don't
  // clash with the dark theme; small inline logos stay tight to the text.
  const wrapperClass =
    size >= 32
      ? "shrink-0 flex items-center justify-center rounded-md bg-white/95 ring-1 ring-[var(--surface-2)] overflow-hidden p-1.5"
      : "shrink-0";
  const inner = size >= 32 ? size - 12 : size;

  if (app.logo && app.logo.startsWith("http")) {
    return (
      <span className={wrapperClass} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={app.logo}
          alt=""
          width={inner}
          height={inner}
          className="object-contain"
          style={{ width: inner, height: inner }}
        />
      </span>
    );
  }
  return (
    <span
      className={wrapperClass + " text-[var(--text-faint)]"}
      style={{ width: size, height: size, fontSize: inner * 0.6 }}
    >
      {app.name?.[0]?.toUpperCase() ?? "·"}
    </span>
  );
}

function SearchResults({
  results,
  connectedSlugs,
  onSelect,
}: {
  results: ComposioApp[];
  connectedSlugs: Set<string>;
  onSelect: (app: ComposioApp) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <p className="ghost-meta-label">NO_MATCH</p>
        <p className="t-11 font-light text-[var(--text-muted)]">
          Aucune app ne correspond. Affine ta recherche.
        </p>
      </div>
    );
  }
  return (
    <section>
      <div className="mb-4">
        <SectionHeader icon="🔍" label="Résultats" count={results.length} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {results.map((app) => (
          <AppCard
            key={app.key}
            app={app}
            connected={connectedSlugs.has(app.key)}
            onClick={() => onSelect(app)}
          />
        ))}
      </div>
    </section>
  );
}

interface AppDrawerProps {
  state: DrawerState;
  actions: DiscoveredTool[] | null;
  loadingActions: boolean;
  busy: boolean;
  onClose: () => void;
  onConnect: () => void;
  onDisconnect?: () => void;
}

function AppDrawer({
  state,
  actions,
  loadingActions,
  busy,
  onClose,
  onConnect,
  onDisconnect,
}: AppDrawerProps) {
  const { app, connectedAccount } = state;
  const isConnected = !!connectedAccount;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={app.name}
        className="fixed right-0 top-0 bottom-0 w-full max-w-[480px] bg-[var(--bg)] border-l border-[var(--surface-2)] z-50 overflow-y-auto"
      >
        <div className="px-6 py-5 border-b border-[var(--surface-2)] flex items-center justify-between">
          <button
            onClick={onClose}
            className="t-9 font-mono tracking-[0.2em] uppercase text-[var(--text-faint)] hover:text-[var(--text)]"
          >
            ← Fermer
          </button>
          {isConnected && (
            <span className="t-9 font-mono tracking-[0.2em] uppercase text-[var(--cykan)] halo-cyan-sm">
              ● connecté
            </span>
          )}
        </div>

        <div className="px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <AppLogo app={app} size={48} />
            <div>
              <h2 className="t-19 font-semibold text-[var(--text)]">{app.name}</h2>
              <p className="t-11 font-mono tracking-[0.15em] uppercase text-[var(--text-faint)]">
                {app.categories[0] ?? "service"}
              </p>
            </div>
          </div>

          <p className="t-13 text-[var(--text-soft)] leading-[1.55] mb-6">{app.description}</p>

          {/* Capabilities (post-connect) */}
          {isConnected && (
            <div className="mb-6">
              <div className="t-9 font-mono tracking-[0.2em] uppercase text-[var(--text-faint)] mb-3">
                Ce que Hearst peut faire
              </div>
              {loadingActions ? (
                <div className="space-y-1.5">
                  <div className="ghost-skeleton-bar" />
                  <div className="ghost-skeleton-bar" />
                  <div className="ghost-skeleton-bar" />
                </div>
              ) : actions && actions.length > 0 ? (
                <ul className="space-y-1.5 t-11 font-mono">
                  {actions.slice(0, 5).map((a) => (
                    <li key={a.name} className="flex items-start gap-2">
                      <span className="text-[var(--cykan)] mt-0.5">·</span>
                      <span className="text-[var(--text-soft)]">{actionLabel(a)}</span>
                    </li>
                  ))}
                  {actions.length > 5 && (
                    <li className="t-11 text-[var(--text-faint)] pt-1">
                      + {actions.length - 5} autres actions
                    </li>
                  )}
                </ul>
              ) : (
                <p className="t-11 text-[var(--text-faint)]">
                  Aucune action exposée pour ce compte.
                </p>
              )}
            </div>
          )}

          {/* Pre-connect hint */}
          {!isConnected && (
            <div className="mb-6 border border-[var(--surface-2)] p-4">
              <div className="t-9 font-mono tracking-[0.2em] uppercase text-[var(--text-faint)] mb-2">
                Une fois connecté
              </div>
              <p className="t-11 text-[var(--text-soft)] leading-[1.55]">
                Hearst pourra agir sur ton compte {app.name} en ton nom (envoyer, créer,
                rechercher selon les permissions). Toute action d&apos;écriture sera confirmée
                avant exécution.
              </p>
            </div>
          )}

          {/* Action button */}
          {isConnected ? (
            <button
              onClick={onDisconnect}
              disabled={busy}
              className="w-full px-4 py-3 t-11 font-mono tracking-[0.2em] uppercase border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/[0.06] transition-colors disabled:opacity-50"
            >
              {busy ? "Déconnexion…" : `Déconnecter ${app.name}`}
            </button>
          ) : (
            <button
              onClick={onConnect}
              disabled={busy}
              className="w-full px-4 py-3 t-13 font-medium border border-[var(--cykan)] bg-[var(--cykan)]/[0.06] text-[var(--cykan)] hover:bg-[var(--cykan)]/[0.12] transition-colors halo-cyan-sm disabled:opacity-50"
            >
              {busy ? "Connexion…" : `Connecter ${app.name} →`}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function actionLabel(action: DiscoveredTool): string {
  // The Composio slug is usually APP_VERB_OBJECT — turn it into a readable
  // sentence: GMAIL_SEND_EMAIL → "Send email".
  const parts = action.name.split("_");
  if (parts.length <= 1) return action.description || action.name;
  const verb = parts[1].toLowerCase();
  const object = parts.slice(2).join(" ").toLowerCase();
  return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${object}`.trim();
}
