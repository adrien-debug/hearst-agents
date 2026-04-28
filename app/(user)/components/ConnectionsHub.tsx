"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
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

const CATEGORY_LABEL: Record<string, string> = {
  communication: "Communication",
  productivity: "Productivité",
  crm: "CRM & Ventes",
  "developer-tools": "Développement",
  design: "Design",
  ats: "RH & Recrutement",
  scheduling: "Planification",
  ai: "IA & Données",
  analytics: "Analytics",
  marketing: "Marketing",
  finance: "Finance",
  ticketing: "Support",
};

function categoryLabel(app: ComposioApp): string {
  const first = app.categories[0];
  if (!first) return "service";
  return CATEGORY_LABEL[first] ?? first;
}

// Picks recommandés par défaut quand on en sait pas plus sur l'usage. Ordre =
// priorité ; on filtre les déjà-connectés et on garde les 3 premiers.
const SUGGESTION_PICKS = ["stripe", "linear", "calendly", "hubspot", "github"];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Priorité de statut : plus petit = meilleur. Quand un service a plusieurs
// connexions (ex: Slack ACTIVE + EXPIRED), on affiche le plus favorable.
const STATUS_RANK: Record<string, number> = {
  active: 0, initiated: 1, pending: 2, failed: 3, error: 3, expired: 4,
};

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
  const [indexQuery, setIndexQuery] = useState("");
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [drawerActions, setDrawerActions] = useState<DiscoveredTool[] | null>(null);
  const [drawerLoadingActions, setDrawerLoadingActions] = useState(false);

  const refreshAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/composio/connections", { credentials: "include" });
      if (res.status === 503) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
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
      if (res.status === 503) return;
      if (!res.ok) return;
      const data = (await res.json()) as { apps?: ComposioApp[] };
      setApps(data.apps ?? []);
    } catch (err) {
      console.error("[Composio] failed to load apps catalog", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
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

  // slug → meilleur statut parmi toutes les connexions du service.
  // Un service avec 2 ACTIVE + 1 EXPIRED reste "active".
  const statusBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const acc of accounts) {
      const slug = acc.appName.toLowerCase();
      const s = acc.status.toLowerCase();
      const existing = map.get(slug);
      const rank = STATUS_RANK[s] ?? 9;
      const existingRank = existing ? (STATUS_RANK[existing] ?? 9) : 9;
      if (rank < existingRank) map.set(slug, s);
    }
    return map;
  }, [accounts]);

  const connectedApps = useMemo(
    () => apps.filter((a) => connectedSlugs.has(a.key)),
    [apps, connectedSlugs],
  );

  // Compté par SERVICE unique (pas par connexion) — un service avec 2 ACTIVE + 1
  // EXPIRED ne compte pas comme attention puisque le meilleur statut est ACTIVE.
  const stats = useMemo(() => {
    const attentions = Array.from(statusBySlug.values()).filter(
      (s) => s !== "active",
    ).length;
    return {
      connectedCount: connectedApps.length,
      catalogCount: apps.length,
      attentions,
    };
  }, [statusBySlug, apps, connectedApps]);

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

  // Suggestions = picks par défaut filtrés des déjà-connectés. 3 premiers.
  const suggestions = useMemo(() => {
    return SUGGESTION_PICKS.map((key) => apps.find((a) => a.key === key))
      .filter((app): app is ComposioApp => Boolean(app) && !connectedSlugs.has(app!.key))
      .slice(0, 3);
  }, [apps, connectedSlugs]);

  const indexFiltered = useMemo(() => {
    const filter = indexQuery.trim().toLowerCase();
    return apps
      .filter((a) => {
        if (filter && !a.name.toLowerCase().includes(filter) && !a.key.includes(filter)) {
          return false;
        }
        if (activeLetter) {
          const first = (a.name[0] ?? "").toUpperCase();
          if (first !== activeLetter) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [apps, indexQuery, activeLetter]);

  const availableLetters = useMemo(() => {
    const set = new Set<string>();
    for (const app of apps) {
      const first = (app.name[0] ?? "").toUpperCase();
      if (ALPHABET.includes(first)) set.add(first);
    }
    return set;
  }, [apps]);

  const indexGroups = useMemo(() => {
    const groups: { letter: string; apps: ComposioApp[] }[] = [];
    let current: { letter: string; apps: ComposioApp[] } | null = null;
    for (const app of indexFiltered) {
      const letter = (app.name[0] ?? "?").toUpperCase();
      if (!current || current.letter !== letter) {
        current = { letter, apps: [] };
        groups.push(current);
      }
      current.apps.push(app);
    }
    return groups;
  }, [indexFiltered]);

  const openDrawer = useCallback(
    async (app: ComposioApp) => {
      const connected = accounts.find((a) => a.appName.toLowerCase() === app.key);
      setDrawer({ app, connectedAccount: connected });
      setDrawerActions(null);

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
          const message = data.error ?? "Erreur Composio";
          console.error(
            `[Composio] Connect failed for ${app.key}: code=${data.errorCode} message=${message}`,
            data.details,
          );
          toast.error(`Connexion ${app.name} impossible`, message);

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

  // OAuth callback landing — ?connected=<slug> after Composio returns.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (connected) {
      toast.success(
        `${connected} connecté ✓`,
        `Demande à Hearst d'utiliser ${connected} dans le chat`,
      );
      window.history.replaceState({}, "", window.location.pathname);
      void fetch("/api/composio/invalidate-cache", {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
      queueMicrotask(() => void refreshAccounts());
    }
  }, [refreshAccounts]);

  const onIndexQueryChange = useCallback((next: string) => {
    setIndexQuery(next);
    if (next.trim()) setActiveLetter(null);
  }, []);

  if (!enabled) return <DisabledState message={sdkError} />;
  if (loading) return <LoadingState />;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg)" }}>
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        connectedCount={stats.connectedCount}
        catalogCount={stats.catalogCount}
        attentions={stats.attentions}
      />

      {searchResults !== null ? (
        <SearchResultsSection
          results={searchResults}
          totalCount={apps.length}
          connectedSlugs={connectedSlugs}
          onSelect={openDrawer}
        />
      ) : (
        <>
          <SectionLabel
            label="Connectés"
            count={stats.connectedCount}
            empty={stats.connectedCount === 0 ? "rien encore — pioche dans l'index" : undefined}
          />
          {connectedApps.length > 0 && (
            <ConnectedGrid
              apps={connectedApps}
              statusBySlug={statusBySlug}
              onSelect={openDrawer}
            />
          )}

          {suggestions.length > 0 && (
            <>
              <SectionLabel label="Pour aller plus loin" count={suggestions.length} />
              <SuggestionsGrid suggestions={suggestions} onSelect={openDrawer} />
            </>
          )}

          <IndexSection
            groups={indexGroups}
            availableLetters={availableLetters}
            activeLetter={activeLetter}
            onLetterChange={setActiveLetter}
            indexQuery={indexQuery}
            onIndexQueryChange={onIndexQueryChange}
            statusBySlug={statusBySlug}
            totalCount={apps.length}
            visibleCount={indexFiltered.length}
            onSelect={openDrawer}
          />
        </>
      )}

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

// ─── States ───────────────────────────────────────────────────

function DisabledState({ message }: { message: string | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24">
      <p
        className="halo-mono-label"
        style={{ letterSpacing: "var(--tracking-brand)" }}
      >
        COMPOSIO_UNAVAILABLE
      </p>
      <p className="t-13 text-[var(--text-soft)] max-w-md text-center leading-relaxed">
        {message ?? "Composio n'est pas configuré."}
      </p>
      <p className="t-11 text-[var(--text-faint)] max-w-md text-center leading-relaxed">
        Vérifie <code className="text-[var(--cykan)]">COMPOSIO_API_KEY</code> dans{" "}
        <code>.env.local</code>.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 py-24">
      <div className="halo-core" aria-hidden />
    </div>
  );
}

// ─── Header sticky : search globale + counters inline ─────────

function Header({
  searchQuery,
  onSearchChange,
  connectedCount,
  catalogCount,
  attentions,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  connectedCount: number;
  catalogCount: number;
  attentions: number;
}) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-4 px-8 py-3 border-b"
      style={{ background: "var(--bg)", borderColor: "var(--border-shell)" }}
    >
      <span
        className="t-10 font-mono uppercase whitespace-nowrap"
        style={{ letterSpacing: "var(--tracking-brand)" }}
      >
        <span className="text-[var(--cykan)]">[ APPS ]</span>
      </span>

      <label
        className="flex-1 flex items-center gap-3 px-4 py-2 rounded-pill border transition-colors"
        style={{
          background: "var(--surface)",
          borderColor: searchQuery ? "var(--cykan-border)" : "var(--border-shell)",
        }}
      >
        <span className="t-13 leading-none text-[var(--text-faint)]">⌕</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cherche un service…"
          className="flex-1 bg-transparent outline-none border-none t-13 text-[var(--text)] placeholder:text-[var(--text-faint)]"
        />
        <kbd
          className="t-9 font-mono px-1.5 py-px rounded-xs border"
          style={{
            background: "var(--bg-elev)",
            borderColor: "var(--border-shell)",
            color: "var(--text-faint)",
          }}
        >
          ⌘ K
        </kbd>
      </label>

      <div
        className="flex items-center gap-3 t-10 font-mono uppercase whitespace-nowrap"
        style={{ letterSpacing: "var(--tracking-section)" }}
      >
        <span className="flex items-center gap-2 text-[var(--text)]">
          <span
            className="w-1 h-1 rounded-full halo-dot"
            style={{ background: "var(--cykan)" }}
            aria-hidden
          />
          {connectedCount}
        </span>
        <span className="text-[var(--text-ghost)]">/</span>
        <span className="text-[var(--text-faint)]">{catalogCount}</span>
        {attentions > 0 && (
          <span
            className="px-2 py-1 rounded-pill border ml-1"
            style={{
              color: "var(--color-error)",
              background: "var(--color-error-bg)",
              borderColor: "var(--color-error-border)",
            }}
          >
            ⚠ {attentions}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Section label sobre — pas de marker éditorial ────────────

function SectionLabel({
  label,
  count,
  empty,
}: {
  label: string;
  count: number;
  empty?: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between px-8 pt-8 pb-3 t-10 font-mono uppercase"
      style={{ letterSpacing: "var(--tracking-section)" }}
    >
      <span className="flex items-baseline gap-2">
        <span className="text-[var(--text)]">{label}</span>
        <span className="text-[var(--text-ghost)]">·</span>
        <span className="text-[var(--text-faint)]">{count}</span>
      </span>
      {empty && <span className="text-[var(--text-faint)]">{empty}</span>}
    </div>
  );
}

// ─── Connectés : grille compacte (logo + nom + status) ────────

function ConnectedGrid({
  apps,
  statusBySlug,
  onSelect,
}: {
  apps: ComposioApp[];
  statusBySlug: Map<string, string>;
  onSelect: (app: ComposioApp) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 px-8 pb-4">
      {apps.map((app) => (
        <ConnectedCard
          key={app.key}
          app={app}
          status={statusBySlug.get(app.key) ?? "active"}
          onClick={() => onSelect(app)}
        />
      ))}
    </div>
  );
}

function ConnectedCard({
  app,
  status,
  onClick,
}: {
  app: ComposioApp;
  status: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 px-3 py-3 text-left border transition-colors"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border-shell)",
      }}
    >
      <AppLogo app={app} size={32} />
      <div className="flex-1 min-w-0">
        <div
          className="t-13 truncate group-hover:text-[var(--cykan)] transition-colors"
          style={{ fontWeight: "var(--weight-semibold)", color: "var(--text)" }}
        >
          {app.name}
        </div>
        <div className="mt-1">
          <StatusPill status={status} />
        </div>
      </div>
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const variant = (() => {
    switch (status) {
      case "active":
        return { color: "var(--cykan)", bg: "var(--cykan-surface)", label: "active" };
      case "initiated":
      case "pending":
        return { color: "var(--color-warning)", bg: "var(--color-warning-bg)", label: "pending" };
      case "error":
      case "failed":
        return { color: "var(--color-error)", bg: "var(--color-error-bg)", label: "erreur" };
      case "expired":
        return { color: "var(--color-error)", bg: "var(--color-error-bg)", label: "expiré" };
      default:
        return { color: "var(--cykan)", bg: "var(--cykan-surface)", label: "active" };
    }
  })();
  return (
    <span
      className="t-9 font-mono uppercase inline-flex items-center gap-2 px-2 py-1 rounded-pill"
      style={{
        color: variant.color,
        background: variant.bg,
        letterSpacing: "var(--tracking-section)",
      }}
    >
      <span
        className="w-1 h-1 rounded-full"
        style={{ background: variant.color }}
        aria-hidden
      />
      {variant.label}
    </span>
  );
}

// ─── Suggestions : compact, zéro phrase narrative ─────────────

function SuggestionsGrid({
  suggestions,
  onSelect,
}: {
  suggestions: ComposioApp[];
  onSelect: (app: ComposioApp) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 px-8 pb-4">
      {suggestions.map((app, i) => (
        <SuggestionCard
          key={app.key}
          app={app}
          featured={i === 0}
          onClick={() => onSelect(app)}
        />
      ))}
    </div>
  );
}

function SuggestionCard({
  app,
  featured,
  onClick,
}: {
  app: ComposioApp;
  featured: boolean;
  onClick: () => void;
}) {
  const cykanFeatured = featured;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 px-3 py-3 text-left border transition-colors"
      style={{
        background: cykanFeatured ? "var(--cykan-surface)" : "var(--surface)",
        borderColor: cykanFeatured ? "var(--cykan-border)" : "var(--border-shell)",
      }}
    >
      <AppLogo app={app} size={32} />
      <div className="flex-1 min-w-0">
        <div
          className="t-13 truncate"
          style={{ fontWeight: "var(--weight-semibold)", color: "var(--text)" }}
        >
          {app.name}
        </div>
        <div
          className="t-9 font-mono uppercase mt-1 text-[var(--text-faint)] truncate"
          style={{ letterSpacing: "var(--tracking-section)" }}
        >
          {categoryLabel(app)}
        </div>
      </div>
      <span
        className="t-11 font-mono uppercase text-[var(--cykan-deep)] opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ letterSpacing: "var(--tracking-section)" }}
      >
        connecter →
      </span>
    </button>
  );
}

// ─── Index alphabétique + search dédiée ───────────────────────

function IndexSection({
  groups,
  availableLetters,
  activeLetter,
  onLetterChange,
  indexQuery,
  onIndexQueryChange,
  statusBySlug,
  totalCount,
  visibleCount,
  onSelect,
}: {
  groups: { letter: string; apps: ComposioApp[] }[];
  availableLetters: Set<string>;
  activeLetter: string | null;
  onLetterChange: (letter: string | null) => void;
  indexQuery: string;
  onIndexQueryChange: (q: string) => void;
  statusBySlug: Map<string, string>;
  totalCount: number;
  visibleCount: number;
  onSelect: (app: ComposioApp) => void;
}) {
  return (
    <div
      className="px-8 pt-8 pb-8 border-t mt-4"
      style={{ background: "var(--bg-elev)", borderColor: "var(--border-default)" }}
    >
      <div className="flex items-baseline justify-between gap-6 mb-4 flex-wrap">
        <span
          className="t-10 font-mono uppercase flex items-baseline gap-2"
          style={{ letterSpacing: "var(--tracking-section)" }}
        >
          <span className="text-[var(--text)]">Index</span>
          <span className="text-[var(--text-ghost)]">·</span>
          <span className="text-[var(--text-faint)]">{totalCount} services</span>
        </span>

        <IndexSearch
          value={indexQuery}
          onChange={onIndexQueryChange}
          visibleCount={visibleCount}
          totalCount={totalCount}
        />
      </div>

      <AlphabetSelector
        availableLetters={availableLetters}
        activeLetter={activeLetter}
        onLetterChange={onLetterChange}
      />

      {groups.length === 0 ? (
        <p className="t-13 text-center py-10 text-[var(--text-faint)]">
          Aucun service ne correspond.
          {(activeLetter || indexQuery) && (
            <button
              type="button"
              className="ml-3 underline text-[var(--cykan)]"
              onClick={() => {
                onLetterChange(null);
                onIndexQueryChange("");
              }}
            >
              réinitialiser
            </button>
          )}
        </p>
      ) : (
        <div className="columns-5 gap-6">
          {groups.map((g) => (
            <div key={g.letter} className="break-inside-avoid mb-4">
              <div
                className="t-15 font-mono pb-1 mb-2 border-b"
                style={{
                  color: "var(--cykan)",
                  borderColor: "var(--border-shell)",
                  fontWeight: "var(--weight-semibold)",
                }}
              >
                {g.letter}
              </div>
              {g.apps.map((app) => (
                <IndexRow
                  key={app.key}
                  app={app}
                  status={statusBySlug.get(app.key)}
                  query={indexQuery}
                  onClick={() => onSelect(app)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IndexSearch({
  value,
  onChange,
  visibleCount,
  totalCount,
}: {
  value: string;
  onChange: (q: string) => void;
  visibleCount: number;
  totalCount: number;
}) {
  return (
    <label
      className="flex items-center gap-2 px-3 py-2 rounded-xs border w-96"
      style={{
        background: "var(--surface)",
        borderColor: value ? "var(--cykan-border)" : "var(--border-shell)",
      }}
    >
      <span className="t-11 leading-none text-[var(--text-faint)]">⌕</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filtre l'index"
        className="flex-1 bg-transparent outline-none border-none t-11 text-[var(--text)] placeholder:text-[var(--text-faint)]"
      />
      <span
        className="t-9 font-mono uppercase text-[var(--text-faint)]"
        style={{ letterSpacing: "var(--tracking-section)" }}
      >
        {value ? `${visibleCount} résultat${visibleCount > 1 ? "s" : ""}` : `${totalCount}`}
      </span>
    </label>
  );
}

function AlphabetSelector({
  availableLetters,
  activeLetter,
  onLetterChange,
}: {
  availableLetters: Set<string>;
  activeLetter: string | null;
  onLetterChange: (letter: string | null) => void;
}) {
  return (
    <div className="flex border-y mb-4" style={{ borderColor: "var(--border-shell)" }}>
      {ALPHABET.map((letter) => {
        const present = availableLetters.has(letter);
        const active = activeLetter === letter;
        return (
          <button
            key={letter}
            type="button"
            disabled={!present}
            onClick={() => onLetterChange(active ? null : letter)}
            className="flex-1 t-11 font-mono uppercase py-2 border-r last:border-r-0 transition-colors"
            style={{
              color: active
                ? "var(--cykan)"
                : present
                  ? "var(--text-muted)"
                  : "var(--text-ghost)",
              background: active ? "var(--cykan-surface)" : "transparent",
              borderColor: "var(--border-soft)",
              fontWeight: active ? "var(--weight-semibold)" : "var(--weight-regular)",
              cursor: present ? "pointer" : "default",
              letterSpacing: "var(--tracking-hairline)",
            }}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}

function IndexRow({
  app,
  status,
  query,
  onClick,
}: {
  app: ComposioApp;
  status?: string;
  query: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2 py-1 w-full text-left t-11"
      style={{ color: "var(--text-soft)", lineHeight: "var(--leading-snug)" }}
    >
      <AppLogo app={app} size={14} />
      <span className="flex-1 min-w-0 truncate group-hover:text-[var(--cykan)] transition-colors">
        {highlight(app.name, query)}
      </span>
      {status && (
        <span
          className="t-9 font-mono uppercase"
          style={{
            letterSpacing: "var(--tracking-section)",
            color:
              status === "active"
                ? "var(--cykan)"
                : status === "expired" || status === "error" || status === "failed"
                  ? "var(--color-error)"
                  : "var(--color-warning)",
          }}
        >
          {status === "active"
            ? "✓"
            : status === "expired" || status === "error" || status === "failed"
              ? "!"
              : "◌"}
        </span>
      )}
    </button>
  );
}

function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: "var(--cykan-bg-active)",
          color: "var(--text)",
          padding: "0 var(--space-1)",
          borderRadius: "var(--radius-xs)",
        }}
      >
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// ─── Search globale (résultats) ────────────────────────────────

function SearchResultsSection({
  results,
  totalCount,
  connectedSlugs,
  onSelect,
}: {
  results: ComposioApp[];
  totalCount: number;
  connectedSlugs: Set<string>;
  onSelect: (app: ComposioApp) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3 px-8">
        <p
          className="t-11 font-mono uppercase text-[var(--text-faint)]"
          style={{ letterSpacing: "var(--tracking-brand)" }}
        >
          AUCUN RÉSULTAT
        </p>
      </div>
    );
  }
  return (
    <div className="px-8 pt-8 pb-8">
      <div
        className="flex items-baseline gap-2 mb-4 t-10 font-mono uppercase"
        style={{ letterSpacing: "var(--tracking-section)" }}
      >
        <span className="text-[var(--text)]">Résultats</span>
        <span className="text-[var(--text-ghost)]">·</span>
        <span className="text-[var(--text-faint)]">
          {results.length} sur {totalCount}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {results.map((app) => (
          <button
            key={app.key}
            type="button"
            onClick={() => onSelect(app)}
            className="group flex items-center gap-3 px-3 py-3 text-left border transition-colors"
            style={{
              background: connectedSlugs.has(app.key) ? "var(--cykan-surface)" : "var(--surface)",
              borderColor: connectedSlugs.has(app.key) ? "var(--cykan-border)" : "var(--border-shell)",
            }}
          >
            <AppLogo app={app} size={32} />
            <div className="flex-1 min-w-0">
              <div
                className="t-13 truncate"
                style={{ fontWeight: "var(--weight-semibold)", color: "var(--text)" }}
              >
                {app.name}
              </div>
              <div
                className="t-9 font-mono uppercase mt-1 text-[var(--text-faint)] truncate"
                style={{ letterSpacing: "var(--tracking-section)" }}
              >
                {connectedSlugs.has(app.key) ? "● connecté" : categoryLabel(app)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Logo (couleur native marque, frame neutre) ───────────────

function AppLogo({ app, size = 16 }: { app: ComposioApp; size?: number }) {
  const wrapperClass =
    size >= 32
      ? "shrink-0 inline-flex items-center justify-center overflow-hidden rounded-sm"
      : "shrink-0 inline-flex items-center justify-center overflow-hidden rounded-xs";
  const inner = size >= 32 ? Math.round(size * 0.78) : size;

  if (app.logo && app.logo.startsWith("http")) {
    return (
      <span
        className={wrapperClass}
        style={{
          width: size,
          height: size,
          background: "var(--surface)",
          boxShadow: "inset 0 0 0 1px var(--border-shell)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={app.logo}
          alt=""
          width={inner}
          height={inner}
          className="object-contain"
          style={{ width: inner, height: inner }}
          // Logos cassés côté Composio (URLs mortes) → fallback sur l'init du nom.
          onError={(e) => {
            const el = e.currentTarget;
            el.style.display = "none";
            const parent = el.parentElement;
            if (parent && !parent.dataset.fallback) {
              parent.dataset.fallback = "1";
              parent.style.fontSize = `${inner * 0.6}px`;
              parent.style.color = "var(--text-faint)";
              parent.textContent = app.name?.[0]?.toUpperCase() ?? "·";
            }
          }}
        />
      </span>
    );
  }
  return (
    <span
      className={wrapperClass}
      style={{
        width: size,
        height: size,
        fontSize: inner * 0.6,
        background: "var(--surface-2)",
        color: "var(--text-faint)",
        boxShadow: "inset 0 0 0 1px var(--border-shell)",
      }}
    >
      {app.name?.[0]?.toUpperCase() ?? "·"}
    </span>
  );
}

// ─── Drawer (logique inchangée) ───────────────────────────────

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
      {/* Backdrop modal — le DS n'expose pas (encore) de token "overlay-scrim".
         À ajouter dans globals.css si on en met d'autres. */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.40)" }}
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={app.name}
        className="fixed right-0 top-0 bottom-0 w-full max-w-md z-50 overflow-y-auto border-l panel-enter"
        style={{ background: "var(--bg)", borderColor: "var(--border-shell)" }}
      >
        <div
          className="px-6 py-5 border-b flex items-center justify-between"
          style={{ borderColor: "var(--border-shell)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="t-9 font-mono uppercase text-[var(--text-faint)] hover:text-[var(--text)]"
            style={{ letterSpacing: "var(--tracking-section)" }}
          >
            ← Fermer
          </button>
          {isConnected && (
            <span
              className="t-9 font-mono uppercase text-[var(--cykan)]"
              style={{ letterSpacing: "var(--tracking-section)" }}
            >
              ● connecté
            </span>
          )}
        </div>

        <div className="px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <AppLogo app={app} size={48} />
            <div>
              <h2
                className="t-18 m-0"
                style={{ fontWeight: "var(--weight-semibold)", color: "var(--text)" }}
              >
                {app.name}
              </h2>
              <p
                className="t-11 font-mono uppercase text-[var(--text-faint)] m-0 mt-1"
                style={{ letterSpacing: "var(--tracking-stretch)" }}
              >
                {categoryLabel(app)}
              </p>
            </div>
          </div>

          <p
            className="t-13 mb-6"
            style={{ color: "var(--text-soft)", lineHeight: "var(--leading-relaxed)" }}
          >
            {app.description}
          </p>

          {isConnected && (
            <div className="mb-6">
              <div
                className="t-9 font-mono uppercase mb-3 text-[var(--text-faint)]"
                style={{ letterSpacing: "var(--tracking-section)" }}
              >
                Actions disponibles
              </div>
              {loadingActions ? (
                <p className="t-11 text-[var(--text-faint)]">Chargement…</p>
              ) : actions && actions.length > 0 ? (
                <ul className="t-11 font-mono space-y-1">
                  {actions.slice(0, 5).map((a) => (
                    <li key={a.name} className="flex items-start gap-2">
                      <span className="text-[var(--cykan)] mt-1">·</span>
                      <span className="text-[var(--text-soft)]">{actionLabel(a)}</span>
                    </li>
                  ))}
                  {actions.length > 5 && (
                    <li className="t-11 text-[var(--text-faint)] pt-1">
                      + {actions.length - 5} autres
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

          {isConnected ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy}
              className="ghost-btn-solid ghost-btn-ghost w-full disabled:opacity-50"
              style={{
                color: "var(--color-error)",
                borderColor: "var(--color-error-border)",
              }}
            >
              {busy ? "Déconnexion…" : `Déconnecter ${app.name}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              disabled={busy}
              className="ghost-btn-solid ghost-btn-cykan w-full disabled:opacity-50"
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
  // Composio slug = APP_VERB_OBJECT → "Send email", etc.
  const parts = action.name.split("_");
  if (parts.length <= 1) return action.description || action.name;
  const verb = parts[1].toLowerCase();
  const object = parts.slice(2).join(" ").toLowerCase();
  return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${object}`.trim();
}
