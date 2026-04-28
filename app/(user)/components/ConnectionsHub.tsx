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

function categoryLabelById(id: string): string {
  return CATEGORY_LABEL[id] ?? id;
}

// Picks recommandés par défaut quand on en sait pas plus sur l'usage. Ordre =
// priorité ; on filtre les déjà-connectés et on garde les 3 premiers.
const SUGGESTION_PICKS = ["stripe", "linear", "calendly", "hubspot", "github"];

// Priorité de statut : plus petit = meilleur. Quand un service a plusieurs
// connexions (ex: Slack ACTIVE + EXPIRED), on affiche le plus favorable.
const STATUS_RANK: Record<string, number> = {
  active: 0, initiated: 1, pending: 2, failed: 3, error: 3, expired: 4,
};

// Wallpaper : combien de tuiles on affiche d'office. Sur 1030 apps, charger
// tout d'un coup tue le DOM ; on lazy-charge par paliers de WALLPAPER_PAGE.
const WALLPAPER_PAGE = 100;

// Catégories visibles en chips (les autres regroupées dans "+ N catégories").
const CATEGORIES_VISIBLE = 8;

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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [wallpaperLimit, setWallpaperLimit] = useState(WALLPAPER_PAGE);
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

  // Compté par SERVICE unique (pas par connexion) — un service avec 2 ACTIVE
  // + 1 EXPIRED ne compte pas comme attention puisque le meilleur statut
  // est ACTIVE.
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

  // Catégories effectivement présentes dans le catalogue, triées par
  // population décroissante pour mettre en avant celles qui couvrent le
  // plus de services.
  const categoriesWithCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const app of apps) {
      for (const cat of app.categories) {
        map.set(cat, (map.get(cat) ?? 0) + 1);
      }
    }
    const entries = Array.from(map.entries())
      .map(([id, count]) => ({ id, label: categoryLabelById(id), count }))
      .sort((a, b) => b.count - a.count);
    return entries;
  }, [apps]);

  // Ordre du wallpaper : connectés d'abord (lecture immédiate de l'état
  // de la stack), puis alphabétique. Filtre par activeCategory si défini.
  const wallpaperApps = useMemo(() => {
    const filtered = activeCategory
      ? apps.filter((a) => a.categories.includes(activeCategory))
      : apps;
    return [...filtered].sort((a, b) => {
      const aConn = connectedSlugs.has(a.key) ? 0 : 1;
      const bConn = connectedSlugs.has(b.key) ? 0 : 1;
      if (aConn !== bConn) return aConn - bConn;
      return a.name.localeCompare(b.name, "fr");
    });
  }, [apps, activeCategory, connectedSlugs]);

  const wallpaperVisible = useMemo(
    () => wallpaperApps.slice(0, wallpaperLimit),
    [wallpaperApps, wallpaperLimit],
  );

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

  // Quand on change de catégorie, on remet le wallpaper à zéro pour ne
  // pas garder un offset qui n'a plus de sens dans la nouvelle liste.
  const onCategoryChange = useCallback((cat: string | null) => {
    setActiveCategory(cat);
    setWallpaperLimit(WALLPAPER_PAGE);
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
          <SectionLabel label="Connectés" count={stats.connectedCount} />
          {connectedApps.length > 0 ? (
            <Stage
              apps={connectedApps}
              statusBySlug={statusBySlug}
              onSelect={openDrawer}
            />
          ) : (
            <EmptyStage />
          )}

          {suggestions.length > 0 && (
            <>
              <SectionLabel label="Pour aller plus loin" count={suggestions.length} />
              <SuggestionsGrid suggestions={suggestions} onSelect={openDrawer} />
            </>
          )}

          <SectionLabel label="Catalogue" count={apps.length} />
          <CategoriesBar
            categories={categoriesWithCount}
            active={activeCategory}
            onChange={onCategoryChange}
          />
          <Wallpaper
            apps={wallpaperVisible}
            totalFiltered={wallpaperApps.length}
            connectedSlugs={connectedSlugs}
            statusBySlug={statusBySlug}
            onSelect={openDrawer}
            canLoadMore={wallpaperVisible.length < wallpaperApps.length}
            onLoadMore={() => setWallpaperLimit((n) => n + WALLPAPER_PAGE)}
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

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div
      className="flex items-baseline gap-2 px-8 pt-8 pb-3 t-10 font-mono uppercase"
      style={{ letterSpacing: "var(--tracking-section)" }}
    >
      <span className="text-[var(--text)]">{label}</span>
      <span className="text-[var(--text-ghost)]">·</span>
      <span className="text-[var(--text-faint)]">{count}</span>
    </div>
  );
}

// ─── Stage — grosses tiles carrées des connectés ──────────────

function Stage({
  apps,
  statusBySlug,
  onSelect,
}: {
  apps: ComposioApp[];
  statusBySlug: Map<string, string>;
  onSelect: (app: ComposioApp) => void;
}) {
  // Adapte le nombre de colonnes au count pour ne pas étirer chaque tile à
  // 100 % du viewport quand l'utilisateur n'a qu'un ou deux services.
  const cols =
    apps.length >= 5 ? "grid-cols-5"
      : apps.length === 4 ? "grid-cols-4"
        : apps.length === 3 ? "grid-cols-3"
          : apps.length === 2 ? "grid-cols-2"
            : "grid-cols-1";
  return (
    <div className={`grid ${cols} gap-3 px-8 pb-2`}>
      {apps.map((app) => (
        <StageTile
          key={app.key}
          app={app}
          status={statusBySlug.get(app.key) ?? "active"}
          onClick={() => onSelect(app)}
        />
      ))}
    </div>
  );
}

// Variante visuelle dérivée du status. Stage = signal fort visible d'un coup
// d'œil → ring colorée + ribbon en bas pour les états non-actifs.
function stageVariant(status: string): "active" | "warn" | "error" {
  switch (status) {
    case "initiated":
    case "pending":
      return "warn";
    case "error":
    case "failed":
    case "expired":
      return "error";
    default:
      return "active";
  }
}

function stageRibbon(variant: "active" | "warn" | "error", app: ComposioApp): string {
  if (variant === "warn") return "oauth en cours";
  if (variant === "error") return "reconnecter";
  return categoryLabel(app);
}

function StageTile({
  app,
  status,
  onClick,
}: {
  app: ComposioApp;
  status: string;
  onClick: () => void;
}) {
  const variant = stageVariant(status);
  const ribbon = stageRibbon(variant, app);

  // Couleurs par variant. On reste sur les tokens DS et on compose le glow
  // via color-mix qui est exposé par tous les browsers Hearst-supportés.
  const colorMap: Record<typeof variant, { dot: string; ring: string; bg: string; ribbonColor: string; ribbonBorder: string; ribbonBg: string }> = {
    active: {
      dot: "var(--cykan)",
      ring: "var(--cykan-border)",
      bg: "var(--surface)",
      ribbonColor: "var(--text-faint)",
      ribbonBorder: "var(--border-shell)",
      ribbonBg: "var(--bg-elev)",
    },
    warn: {
      dot: "var(--color-warning)",
      ring: "var(--color-warning-border)",
      bg: "var(--color-warning-bg)",
      ribbonColor: "var(--color-warning)",
      ribbonBorder: "var(--color-warning-border)",
      ribbonBg: "var(--color-warning-bg)",
    },
    error: {
      dot: "var(--color-error)",
      ring: "var(--color-error-border)",
      bg: "var(--color-error-bg)",
      ribbonColor: "var(--color-error)",
      ribbonBorder: "var(--color-error-border)",
      ribbonBg: "var(--color-error-bg)",
    },
  };
  const c = colorMap[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${app.name} — ${ribbon}`}
      className="group relative aspect-square flex flex-col items-center justify-center gap-3 overflow-hidden rounded-md border transition-all"
      style={{
        background: c.bg,
        borderColor: c.ring,
        boxShadow: `0 0 0 1px ${c.ring}, 0 4px 24px color-mix(in srgb, ${c.dot} 12%, transparent)`,
      }}
    >
      <AppLogo app={app} size={72} />
      <span
        className="t-13 text-center px-2"
        style={{ fontWeight: "var(--weight-semibold)", color: "var(--text)", letterSpacing: "-0.005em" }}
      >
        {app.name}
      </span>
      <span
        aria-hidden
        className="absolute top-2 right-2 w-2 h-2 rounded-full"
        style={{
          background: c.dot,
          boxShadow: `0 0 8px color-mix(in srgb, ${c.dot} 50%, transparent)`,
          animation: variant === "warn" ? "blink 1.4s infinite" : undefined,
        }}
      />
      <span
        className="absolute bottom-0 left-0 right-0 t-9 font-mono uppercase text-center py-2 border-t"
        style={{
          letterSpacing: "var(--tracking-section)",
          color: c.ribbonColor,
          borderColor: c.ribbonBorder,
          background: c.ribbonBg,
        }}
      >
        {ribbon}
      </span>
    </button>
  );
}

function EmptyStage() {
  return (
    <div className="px-8 pb-2">
      <div
        className="px-6 py-10 text-center rounded-md"
        style={{ background: "var(--bg-elev)", border: "1px dashed var(--border-default)" }}
      >
        <p
          className="t-11 font-mono uppercase mb-2 text-[var(--text-faint)]"
          style={{ letterSpacing: "var(--tracking-brand)" }}
        >
          AUCUN SERVICE CONNECTÉ
        </p>
        <p className="t-13 text-[var(--text-soft)] leading-relaxed max-w-md mx-auto">
          Pioche un logo dans le catalogue ci-dessous pour étendre ton agent.
        </p>
      </div>
    </div>
  );
}

// ─── Suggestions : strip horizontal compact ────────────────────

function SuggestionsGrid({
  suggestions,
  onSelect,
}: {
  suggestions: ComposioApp[];
  onSelect: (app: ComposioApp) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-8 pb-2">
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
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 px-4 py-3 text-left border rounded-md transition-colors"
      style={{
        background: featured ? "var(--cykan-bgsoft)" : "var(--surface)",
        borderColor: featured ? "var(--cykan-border)" : "var(--border-shell)",
      }}
    >
      <AppLogo app={app} size={40} />
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
        className="font-mono text-[var(--text-ghost)] group-hover:text-[var(--cykan-deep)] transition-colors"
        aria-hidden
      >
        →
      </span>
    </button>
  );
}

// ─── Categories bar — chips scrollables, filtre le wallpaper ──

function CategoriesBar({
  categories,
  active,
  onChange,
}: {
  categories: { id: string; label: string; count: number }[];
  active: string | null;
  onChange: (cat: string | null) => void;
}) {
  const visible = categories.slice(0, CATEGORIES_VISIBLE);
  const hiddenCount = Math.max(0, categories.length - visible.length);
  return (
    <div
      className="flex items-center gap-2 px-8 py-3 overflow-x-auto"
      style={{
        background: "var(--bg-elev)",
        borderTop: "1px solid var(--border-shell)",
        borderBottom: "1px solid var(--border-shell)",
      }}
    >
      <CategoryChip
        label="Tout"
        count={categories.reduce((sum, c) => sum + c.count, 0)}
        on={active === null}
        onClick={() => onChange(null)}
      />
      {visible.map((c) => (
        <CategoryChip
          key={c.id}
          label={c.label}
          count={c.count}
          on={active === c.id}
          onClick={() => onChange(active === c.id ? null : c.id)}
        />
      ))}
      {hiddenCount > 0 && (
        <span
          className="t-10 font-mono uppercase whitespace-nowrap text-[var(--text-faint)] ml-auto"
          style={{ letterSpacing: "var(--tracking-section)" }}
        >
          + {hiddenCount} catégorie{hiddenCount > 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  count,
  on,
  onClick,
}: {
  label: string;
  count: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="t-10 font-mono uppercase rounded-pill px-3 py-1 border whitespace-nowrap transition-colors"
      style={{
        letterSpacing: "var(--tracking-section)",
        background: on ? "var(--text)" : "var(--surface)",
        color: on ? "var(--bg)" : "var(--text-muted)",
        borderColor: on ? "var(--text)" : "var(--border-shell)",
        fontWeight: on ? "var(--weight-semibold)" : "var(--weight-regular)",
      }}
    >
      {label}
      <span
        className="ml-2"
        style={{ color: on ? "color-mix(in srgb, var(--bg) 55%, transparent)" : "var(--text-ghost)" }}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Wallpaper — grille dense du catalogue ─────────────────────

function Wallpaper({
  apps,
  totalFiltered,
  connectedSlugs,
  statusBySlug,
  onSelect,
  canLoadMore,
  onLoadMore,
}: {
  apps: ComposioApp[];
  totalFiltered: number;
  connectedSlugs: Set<string>;
  statusBySlug: Map<string, string>;
  onSelect: (app: ComposioApp) => void;
  canLoadMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="px-8 pt-6 pb-8" style={{ background: "var(--bg)" }}>
      {apps.length === 0 ? (
        <p
          className="t-11 font-mono uppercase text-center py-10 text-[var(--text-faint)]"
          style={{ letterSpacing: "var(--tracking-brand)" }}
        >
          AUCUN SERVICE DANS CETTE CATÉGORIE
        </p>
      ) : (
        <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
          {apps.map((app) => (
            <WallpaperTile
              key={app.key}
              app={app}
              connected={connectedSlugs.has(app.key)}
              status={statusBySlug.get(app.key)}
              onClick={() => onSelect(app)}
            />
          ))}
        </div>
      )}
      <div
        className="mt-5 pt-4 flex items-center justify-between t-10 font-mono uppercase border-t"
        style={{
          borderColor: "var(--border-shell)",
          letterSpacing: "var(--tracking-section)",
          color: "var(--text-faint)",
        }}
      >
        <span>
          {apps.length} visible{apps.length > 1 ? "s" : ""} · {totalFiltered} dans la catégorie
        </span>
        {canLoadMore && (
          <button
            type="button"
            onClick={onLoadMore}
            className="text-[var(--cykan-deep)] hover:text-[var(--cykan)] transition-colors"
          >
            charger plus →
          </button>
        )}
      </div>
    </div>
  );
}

function WallpaperTile({
  app,
  connected,
  status,
  onClick,
}: {
  app: ComposioApp;
  connected: boolean;
  status: string | undefined;
  onClick: () => void;
}) {
  // Non-connectés en grayscale/faded → la couleur des connectés saute aux
  // yeux et fait office d'index visuel ("ce que j'ai déjà").
  const dim = !connected;
  const variant = connected ? stageVariant(status ?? "active") : "active";
  const dotColor =
    variant === "warn" ? "var(--color-warning)"
      : variant === "error" ? "var(--color-error)"
        : "var(--cykan)";
  return (
    <button
      type="button"
      onClick={onClick}
      title={app.name}
      aria-label={app.name}
      className="group relative aspect-square flex items-center justify-center rounded-xs border transition-all"
      style={{
        background: "var(--surface)",
        borderColor: connected ? "var(--cykan-border)" : "var(--border-shell)",
        boxShadow: connected
          ? "inset 0 0 0 1px var(--cykan-bg)"
          : undefined,
        filter: dim ? "grayscale(0.85) opacity(0.55)" : undefined,
      }}
    >
      <AppLogo app={app} size={28} />
      {connected && (
        <span
          aria-hidden
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
          style={{
            background: dotColor,
            boxShadow: `0 0 4px color-mix(in srgb, ${dotColor} 60%, transparent)`,
          }}
        />
      )}
    </button>
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
            className="group flex items-center gap-3 px-3 py-3 text-left border transition-colors rounded-sm"
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
      {/* Backdrop modal — le DS n'expose pas (encore) de token "overlay-scrim". */}
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
