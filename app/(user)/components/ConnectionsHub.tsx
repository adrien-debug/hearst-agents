"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "@/app/hooks/use-toast";
import { useOAuthStore } from "@/stores/oauth";
import { useOAuthCompletionPoll } from "@/app/hooks/use-oauth-completion-poll";
import { openOAuthPopup } from "@/lib/oauth/popup";
import { Action } from "./ui";

interface ConnectedAccount {
  id: string;
  appName: string;
  status: string;
  // "composio" = OAuth via Composio (handleConnect popup + handleDisconnect).
  // "native"   = obtenu via le SSO NextAuth (Gmail/Cal/Drive après login
  //              Google, Outlook après login MS). Pas de OAuth séparé à
  //              tenter, le drawer affiche une note "géré via SSO" au lieu
  //              du bouton Connecter/Déconnecter.
  source?: "composio" | "native";
}

interface ComposioApp {
  key: string;
  name: string;
  description: string;
  logo: string;
  categories: string[];
  noAuth: boolean;
  // `false` = aucune auth-config côté tenant Composio → click "Connecter"
  // donnerait NO_INTEGRATION. UI : tile grayscale plus fort + cadenas, drawer
  // remplace le bouton OAuth par un lien vers la config Composio.
  connectable?: boolean;
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

// Search intent-based : mappings de mots-clés naturels (FR + EN) vers les
// slugs Composio. Quand l'utilisateur tape un mot d'intention au lieu d'un
// nom de service, on remonte les services pertinents en TÊTE des résultats
// (priorité éditoriale), avant le match fuzzy nom/description classique.
//
// Ex : "facturer" → Stripe en 1er même si Stripe ne contient pas le mot
// "facturer" dans sa description anglaise.
const INTENT_KEYWORDS: { keywords: string[]; slugs: string[] }[] = [
  {
    keywords: ["facture", "facturer", "facturation", "invoice", "billing", "paiement"],
    slugs: ["stripe", "quickbooks", "pennylane"],
  },
  {
    keywords: ["agenda", "calendrier", "rdv", "rendez-vous", "schedule", "planifier"],
    slugs: ["googlecalendar", "calendly", "outlook"],
  },
  {
    keywords: ["ticket", "issue", "bug", "sprint", "tracker"],
    slugs: ["linear", "github", "jira"],
  },
  {
    keywords: ["email", "mail", "courriel", "newsletter"],
    slugs: ["gmail", "outlook", "mailchimp", "sendgrid"],
  },
  {
    keywords: ["doc", "document", "note", "wiki", "documentation"],
    slugs: ["notion", "googledocs", "googledrive", "confluence"],
  },
  {
    keywords: ["crm", "contact", "lead", "deal", "prospect"],
    slugs: ["hubspot", "salesforce", "pipedrive", "attio"],
  },
  {
    keywords: ["chat", "messagerie", "channel", "équipe", "conversation"],
    slugs: ["slack", "discord", "teams"],
  },
  {
    keywords: ["design", "maquette", "wireframe", "ui"],
    slugs: ["figma"],
  },
  {
    keywords: ["code", "repo", "pr", "pull request", "commit", "review"],
    slugs: ["github", "gitlab", "bitbucket"],
  },
  {
    keywords: ["meet", "réunion", "visio", "video", "call"],
    slugs: ["zoom", "googlemeet", "teams"],
  },
  {
    keywords: ["analytics", "metric", "dashboard", "kpi"],
    slugs: ["mixpanel", "amplitude", "posthog", "segment"],
  },
  {
    keywords: ["support", "ticket client", "helpdesk"],
    slugs: ["zendesk", "intercom", "freshdesk", "helpscout"],
  },
];

// Picks recommandés par défaut. Liste large (≥10) pour qu'après filtrage
// des déjà-connectés on ait toujours 3 dispos. `hint` = micro-descripteur
// affiché sous le nom dans la card (remplace la catégorie générique pour
// donner du contexte utile : "que fait Hearst avec ce service").
const SUGGESTION_PICKS: { slug: string; hint: string }[] = [
  { slug: "stripe", hint: "facturation & paiements" },
  { slug: "linear", hint: "tickets & sprints produit" },
  { slug: "calendly", hint: "planification de RDV" },
  { slug: "hubspot", hint: "CRM, contacts & deals" },
  { slug: "github", hint: "PR, issues, code review" },
  { slug: "notion", hint: "docs, bases & comptes-rendus" },
  { slug: "googlecalendar", hint: "agenda & créneaux libres" },
  { slug: "slack", hint: "messages & mentions équipe" },
  { slug: "figma", hint: "specs design & maquettes" },
  { slug: "gmail", hint: "emails & threads priorisés" },
  { slug: "airtable", hint: "bases relationnelles" },
  { slug: "googledrive", hint: "fichiers & docs partagés" },
];

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
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [apps, setApps] = useState<ComposioApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(() => searchParams.get("category"));
  const [wallpaperLimit, setWallpaperLimit] = useState(WALLPAPER_PAGE);
  // Filtre "attentions" — quand actif, le wallpaper ne montre que les
  // services en pending/error/expired. Activé par click sur le badge ⚠ N
  // du header, désactivable par re-click ou bouton "réinitialiser".
  const [attentionFilter, setAttentionFilter] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [drawerActions, setDrawerActions] = useState<DiscoveredTool[] | null>(null);
  const [drawerLoadingActions, setDrawerLoadingActions] = useState(false);

  const refreshAccounts = useCallback(async () => {
    // Fusion de 2 sources de connexions :
    // 1) Composio (OAuth via popup) — l'historique du composant
    // 2) Native (SSO Google/Microsoft initial) — Gmail/Cal/Drive sont déjà
    //    accessibles à l'agent dès le login, pas besoin de redemander
    //    OAuth Composio (qui se prendrait un access_denied par Google).
    // Si une app apparaît dans les deux, le composio gagne (cas où l'user
    // a explicitement re-OAuth via Composio par-dessus le SSO).
    try {
      const [composioRes, nativeRes] = await Promise.all([
        fetch("/api/composio/connections", { credentials: "include" }),
        fetch("/api/connections/native", { credentials: "include" }).catch(
          () => null,
        ),
      ]);

      if (composioRes.status === 503) {
        const data = (await composioRes.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setEnabled(false);
        setSdkError(data.message ?? "Composio not configured");
        return;
      }
      if (!composioRes.ok) {
        const data = (await composioRes.json().catch(() => ({}))) as { error?: string };
        setSdkError(data.error ?? `HTTP ${composioRes.status}`);
        return;
      }
      setSdkError(null);

      const composioData = (await composioRes.json()) as {
        connections?: ConnectedAccount[];
      };
      const composioConns: ConnectedAccount[] = (composioData.connections ?? []).map(
        (c) => ({ ...c, source: "composio" }),
      );

      let nativeConns: ConnectedAccount[] = [];
      if (nativeRes && nativeRes.ok) {
        const nativeData = (await nativeRes.json()) as {
          connections?: ConnectedAccount[];
        };
        nativeConns = nativeData.connections ?? [];
      }

      // Dédup : si un slug existe en composio ET en native, on garde le
      // composio (qui prouve un OAuth explicite, plus "fort"). Le natif est
      // un fallback automatique du SSO.
      const composioSlugs = new Set(
        composioConns.map((c) => c.appName.toLowerCase()),
      );
      const filteredNative = nativeConns.filter(
        (n) => !composioSlugs.has(n.appName.toLowerCase()),
      );
      setAccounts([...composioConns, ...filteredNative]);
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
      // Filtre source : on n'affiche que les toolkits qui ont une auth-config
      // côté Composio (managed ou custom). Les ~910 non-connectables sont
      // masqués pour ne pas frustrer l'utilisateur avec des NO_INTEGRATION.
      // Le code de différenciation visuelle (LockBadge, NotConnectableFooter)
      // reste en place comme safety net si le flag bouge en runtime.
      const all = data.apps ?? [];
      const connectableOnly = all.filter((a) => a.connectable !== false);
      setApps(connectableOnly);
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

    // Match classique fuzzy nom/key/description.
    const fuzzy = apps.filter(
      (a) =>
        a.key.includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q),
    );

    // Match intent : la query contient-elle un mot-clé d'une famille ?
    // Si oui, on remonte les slugs de cette famille EN TÊTE — sauf ceux
    // déjà dans fuzzy (pour éviter les doublons).
    const intentSlugs = new Set<string>();
    for (const intent of INTENT_KEYWORDS) {
      if (intent.keywords.some((kw) => q.includes(kw))) {
        for (const s of intent.slugs) intentSlugs.add(s);
      }
    }
    const fuzzyKeys = new Set(fuzzy.map((a) => a.key));
    const intentMatches = Array.from(intentSlugs)
      .map((slug) => apps.find((a) => a.key === slug))
      .filter((a): a is ComposioApp => {
        if (!a) return false;
        return !fuzzyKeys.has(a.key);
      });

    return [...intentMatches, ...fuzzy];
  }, [apps, searchQuery]);

  // Suggestions = picks par défaut filtrés des déjà-connectés. Toujours 3.
  // Si la liste éditoriale est épuisée (rare — 12 picks + ~5 connectés
  // typiques ⇒ jamais), on complète avec des apps non-connectées du
  // catalogue, hint = leur catégorie en lower-case.
  const suggestions = useMemo(() => {
    type Sugg = { app: ComposioApp; hint: string };
    const fromPicks: Sugg[] = SUGGESTION_PICKS
      .map((p) => {
        const app = apps.find((a) => a.key === p.slug);
        if (!app || connectedSlugs.has(p.slug)) return null;
        return { app, hint: p.hint };
      })
      .filter((s): s is Sugg => s !== null);

    if (fromPicks.length >= 3) return fromPicks.slice(0, 3);

    // Fallback : compléter avec des apps connectables pas encore dans la
    // liste, hint = leur catégorie. Garantit qu'on affiche toujours 3 cards.
    const usedKeys = new Set(fromPicks.map((s) => s.app.key));
    const needed = 3 - fromPicks.length;
    const fallbacks: Sugg[] = apps
      .filter((a) => !connectedSlugs.has(a.key) && !usedKeys.has(a.key))
      .slice(0, needed)
      .map((app) => ({ app, hint: categoryLabel(app).toLowerCase() }));

    return [...fromPicks, ...fallbacks].slice(0, 3);
  }, [apps, connectedSlugs]);

  // Catégories effectivement présentes dans le catalogue. Les apps connectées
  // sont exclues — elles ne figurent plus dans le wallpaper, leur catégorie
  // ne doit pas gonfler les compteurs.
  const categoriesWithCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const app of apps) {
      if (connectedSlugs.has(app.key)) continue;
      for (const cat of app.categories) {
        map.set(cat, (map.get(cat) ?? 0) + 1);
      }
    }
    const entries = Array.from(map.entries())
      .map(([id, count]) => ({ id, label: categoryLabelById(id), count }))
      .sort((a, b) => b.count - a.count);
    return entries;
  }, [apps, connectedSlugs]);

  // Wallpaper = catalogue des apps NON connectées. Les apps déjà branchées
  // sont visibles dans la section "Connectés" en haut, on évite la
  // duplication. Exception : `attentionFilter` cible justement les
  // connexions dégradées (expired/error) — on les laisse passer.
  const wallpaperApps = useMemo(() => {
    let filtered = attentionFilter ? apps : apps.filter((a) => !connectedSlugs.has(a.key));
    if (activeCategory) {
      filtered = filtered.filter((a) => a.categories.includes(activeCategory));
    }
    if (attentionFilter) {
      filtered = filtered.filter((a) => {
        const status = statusBySlug.get(a.key);
        return status && status !== "active";
      });
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [apps, activeCategory, attentionFilter, connectedSlugs, statusBySlug]);

  const wallpaperVisible = useMemo(
    () => wallpaperApps.slice(0, wallpaperLimit),
    [wallpaperApps, wallpaperLimit],
  );

  const openDrawer = useCallback(
    async (app: ComposioApp) => {
      const connected = accounts.find((a) => a.appName.toLowerCase() === app.key);
      setDrawer({ app, connectedAccount: connected });
      setDrawerActions(null);

      // On charge les actions pour TOUTES les apps (connectées ou pas) pour
      // que le drawer puisse décrire "ce que ton agent pourra faire" même
      // en mode discovery.
      setDrawerLoadingActions(true);
      try {
        const res = await fetch(
          `/api/composio/app-actions?app=${encodeURIComponent(app.key)}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const data = (await res.json()) as { tools?: DiscoveredTool[] };
          setDrawerActions(data.tools ?? []);
        }
      } finally {
        setDrawerLoadingActions(false);
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

      // Ouvrir la popup IMMÉDIATEMENT en réponse au click. Si on attend la fin
      // du fetch /api/composio/connect, le browser perd le contexte de geste
      // utilisateur et le popup blocker la rejette. On ouvre vide, on
      // navigue ensuite quand on a la redirectUrl.
      const popup = openOAuthPopup();

      useOAuthStore.getState().start({
        slug: app.key,
        appName: app.name,
        popup,
      });

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
          // NO_INTEGRATION / AUTH_CONFIG_REQUIRED = état attendu (le toolkit
          // n'a pas d'auth-config côté dashboard Composio). Pas un bug client,
          // donc pas de console.error qui crie en rouge dans devtools.
          const isMissingIntegration =
            data.errorCode === "NO_INTEGRATION" ||
            data.errorCode === "AUTH_CONFIG_REQUIRED";
          if (!isMissingIntegration) {
            console.warn(
              `[Composio] Connect failed for ${app.key}: code=${data.errorCode} message=${message}`,
              data.details,
            );
          }
          toast.error(`Connexion ${app.name} impossible`, message);

          if (isMissingIntegration) {
            // Réutiliser la popup déjà ouverte pour rediriger vers le dashboard
            // Composio plutôt qu'ouvrir une 2ème window. Le user voit direct
            // la page de configuration du toolkit, sans flash de popup vide.
            const dashboardUrl = `https://app.composio.dev/app/${encodeURIComponent(app.key)}`;
            if (popup && !popup.closed) {
              popup.navigate(dashboardUrl);
            } else {
              window.open(dashboardUrl, "_blank", "noopener,noreferrer");
            }
          } else if (popup && !popup.closed) {
            popup.close();
          }

          useOAuthStore.getState().setStatus("error", message);
          return;
        }
        if (data.redirectUrl) {
          // Naviguer la popup vers l'URL OAuth. Si la popup a été bloquée
          // (popup === null), on retombe sur la nav de la fenêtre principale
          // — comportement de fallback acceptable, l'utilisateur revient via
          // le redirectUri vers /apps?connected=slug.
          if (popup && !popup.closed) {
            popup.navigate(data.redirectUrl);
            useOAuthStore.getState().setStatus("active");
          } else {
            useOAuthStore.getState().clear();
            window.location.href = data.redirectUrl;
          }
          return;
        }
        // Pas de redirect = déjà connecté côté Composio (apps no-auth).
        if (popup && !popup.closed) popup.close();
        useOAuthStore.getState().setStatus("success");
        toast.success(`${app.name} connecté`, "Demande à Hearst d'utiliser ce service");
        await refreshAccounts();
        setTimeout(() => useOAuthStore.getState().clear(), 3000);
      } catch (err) {
        toast.error("Connexion impossible", err instanceof Error ? err.message : "Erreur réseau");
        if (popup && !popup.closed) popup.close();
        useOAuthStore.getState().setStatus(
          "error",
          err instanceof Error ? err.message : "Erreur réseau",
        );
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
  // Deux cas :
  // 1) On est dans la popup OAuth (window.opener pointe vers la fenêtre
  //    principale Hearst) → postMessage au parent puis self.close.
  // 2) Pas de popup (fallback historique : redirect full page) → toast
  //    + refresh comme avant.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (!connected) return;

    const isPopup =
      window.opener &&
      window.opener !== window &&
      !(window.opener as Window).closed;

    if (isPopup) {
      try {
        (window.opener as Window).postMessage(
          { type: "hearst_oauth_complete", status: "success", slug: connected },
          window.location.origin,
        );
      } catch (err) {
        console.error("[Composio] postMessage to opener failed", err);
      }
      // On laisse 50 ms au parent pour traiter le message avant de fermer la
      // popup, sinon Chrome peut perdre le message en transit.
      setTimeout(() => window.close(), 50);
      return;
    }

    // Fallback : nav full-page (popup bloquée par le browser ou flow legacy).
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
  }, [refreshAccounts]);

  // Listener postMessage pour les callbacks venant de la popup OAuth.
  // Filtre par origin pour rejeter les messages externes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; status?: string; slug?: string; error?: string };
      if (data?.type !== "hearst_oauth_complete") return;

      if (data.status === "success" && data.slug) {
        useOAuthStore.getState().setStatus("success");
        toast.success(
          `${data.slug} connecté ✓`,
          `Demande à Hearst d'utiliser ${data.slug} dans le chat`,
        );
        void fetch("/api/composio/invalidate-cache", {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
        void refreshAccounts();
        setTimeout(() => useOAuthStore.getState().clear(), 3000);
      } else if (data.status === "error") {
        useOAuthStore.getState().setStatus("error", data.error ?? "Connexion refusée");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [refreshAccounts]);

  // Détecte la fermeture manuelle de la popup (croix / cmd+W) sans callback.
  // Toutes les ~500ms, on regarde si la popup référencée par le store est
  // close. Si oui, on bascule en "cancelled" pour que la carte du RightPanel
  // sache. Note : le hook useOAuthCompletionPoll plus bas peut détecter une
  // connexion réussie avant cet interval (status passe à "success") — dans
  // ce cas la condition (status === "opening" || "active") devient fausse,
  // donc on ne trigger pas un faux "cancelled".
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      const { popup, status } = useOAuthStore.getState();
      if (!popup) return;
      if (popup.closed && (status === "opening" || status === "active")) {
        useOAuthStore.getState().setStatus("cancelled");
      }
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // Composio termine ses flows OAuth sur leur propre page de confirmation
  // (cross-origin → postMessage bloqué). On poll l'API connections pour
  // détecter le moment où le slug visé devient ACTIVE et déclencher la
  // confirmation côté Hearst sans attendre que l'utilisateur ferme la popup.
  const onOAuthSuccess = useCallback(
    (slug: string) => {
      toast.success(
        `${slug} connecté ✓`,
        `Demande à Hearst d'utiliser ${slug} dans le chat`,
      );
      void fetch("/api/composio/invalidate-cache", {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
      void refreshAccounts();
      // Auto-clear la carte du RightPanel après un délai court — laisse le
      // temps de voir la confirmation, sans encombrer le panel.
      setTimeout(() => useOAuthStore.getState().clear(), 3000);
    },
    [refreshAccounts],
  );
  useOAuthCompletionPoll(onOAuthSuccess);

  // Sync drawer ↔ accounts. Quand un OAuth réussit pendant que le drawer
  // est ouvert, accounts bouge mais drawer.connectedAccount resterait figé
  // à la valeur capturée au clic. On dérive donc `liveDrawer` à chaque
  // render au lieu d'un setState dans useEffect (anti-pattern react-hooks).
  const liveDrawer = useMemo(() => {
    if (!drawer) return null;
    const matched = accounts.find(
      (a) => a.appName.toLowerCase() === drawer.app.key,
    );
    return { ...drawer, connectedAccount: matched };
  }, [accounts, drawer]);

  // Quand on change de catégorie, on remet le wallpaper à zéro pour ne
  // pas garder un offset qui n'a plus de sens dans la nouvelle liste.
  const onCategoryChange = useCallback((cat: string | null) => {
    setActiveCategory(cat);
    setWallpaperLimit(WALLPAPER_PAGE);
  }, []);

  if (!enabled) return <DisabledState message={sdkError} />;
  if (loading) return <LoadingState />;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-elev)" }}>
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        connectedCount={stats.connectedCount}
        catalogCount={stats.catalogCount}
        attentions={stats.attentions}
        attentionFilter={attentionFilter}
        onToggleAttentionFilter={() => {
          setAttentionFilter((s) => !s);
          setActiveCategory(null);
          setWallpaperLimit(WALLPAPER_PAGE);
        }}
      />

      {searchResults !== null ? (
        <SearchResultsSection
          results={searchResults}
          totalCount={apps.length}
          connectedSlugs={connectedSlugs}
          onSelect={openDrawer}
        />
      ) : (
        <div
          className="flex flex-col"
          style={{ padding: "var(--space-4)", gap: "var(--space-4)" }}
        >
          {/* CONNECTÉS */}
          <div
            className=""
          >
            <SectionLabel label="Connectés" count={stats.connectedCount} />
            {connectedApps.length > 0 ? (
              <Stage
                apps={connectedApps}
                statusBySlug={statusBySlug}
                onSelect={openDrawer}
              />
            ) : (
              <OnboardingStage apps={apps} onSelect={openDrawer} />
            )}
          </div>

          {/* POUR ALLER PLUS LOIN */}
          {suggestions.length > 0 && (
            <div
              className=""
            >
              <SectionLabel label="Pour aller plus loin" count={suggestions.length} />
              <SuggestionsGrid suggestions={suggestions} onSelect={openDrawer} />
            </div>
          )}

          {/* CATALOGUE */}
          <div
            className=""
          >
            <SectionLabel
              label={attentionFilter ? "À vérifier" : "Catalogue"}
              count={wallpaperApps.length}
            />
            {attentionFilter && (
              <div className="px-8 pb-3">
                <button
                  type="button"
                  onClick={() => setAttentionFilter(false)}
                  className="t-11 font-medium text-[var(--cykan-deep)] hover:text-[var(--cykan)] transition-colors"
                >
                  ← Voir tout le catalogue
                </button>
              </div>
            )}
            {!attentionFilter && (
              <CategoriesBar
                categories={categoriesWithCount}
                active={activeCategory}
                onChange={onCategoryChange}
              />
            )}
            <Wallpaper
              apps={wallpaperVisible}
              totalFiltered={wallpaperApps.length}
              connectedSlugs={connectedSlugs}
              statusBySlug={statusBySlug}
              onSelect={openDrawer}
              canLoadMore={wallpaperVisible.length < wallpaperApps.length}
              onLoadMore={() => setWallpaperLimit((n) => n + WALLPAPER_PAGE)}
            />
          </div>
        </div>
      )}

      {liveDrawer && (
        <AppDrawer
          state={liveDrawer}
          actions={drawerActions}
          loadingActions={drawerLoadingActions}
          busy={busy === liveDrawer.app.key || busy === liveDrawer.connectedAccount?.id}
          onClose={closeDrawer}
          onConnect={() => handleConnect(liveDrawer.app)}
          onDisconnect={
            liveDrawer.connectedAccount
              ? () => handleDisconnect(liveDrawer.connectedAccount!)
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
      <p className="t-15 font-medium text-[var(--text-muted)]">
        Composio indisponible
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
  attentionFilter,
  onToggleAttentionFilter,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  connectedCount: number;
  catalogCount: number;
  attentions: number;
  attentionFilter: boolean;
  onToggleAttentionFilter: () => void;
}) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-4 px-8 py-3 border-b"
      style={{ background: "var(--bg-elev)", borderColor: "var(--border-shell)" }}
    >
      <span className="t-13 font-medium whitespace-nowrap text-[var(--cykan)]">
        Apps
      </span>

      <label
        className="flex-1 flex items-center gap-3 px-0 py-3 border-b rounded-none transition-colors"
        style={{
          background: "transparent",
          borderColor: searchQuery ? "var(--cykan)" : "var(--border-shell)",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
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
          className="t-9 font-mono px-1.5 py-px border"
          style={{
            background: "transparent",
            borderColor: "var(--border-shell)",
            color: "var(--text-faint)",
          }}
        >
          ⌘ K
        </kbd>
      </label>

      <div className="flex items-center gap-3 t-11 font-medium whitespace-nowrap">
        <span className="flex items-center gap-2 text-[var(--text)]">
          <span
            className="w-1 h-1 rounded-pill halo-dot"
            style={{ background: "var(--cykan)" }}
            aria-hidden
          />
          {connectedCount}
        </span>
        <span className="text-[var(--text-ghost)]">/</span>
        <span className="text-[var(--text-faint)]">{catalogCount}</span>
        {attentions > 0 && (
          <button
            type="button"
            onClick={onToggleAttentionFilter}
            aria-pressed={attentionFilter}
            title={
              attentionFilter
                ? "Cliquer pour réinitialiser le filtre"
                : "Filtrer le catalogue aux services qui demandent ton attention"
            }
            className="px-2 py-1 rounded-pill border ml-1 transition-all cursor-pointer hover:opacity-80"
            style={{
              color: "var(--color-error)",
              background: attentionFilter
                ? "var(--color-error)"
                : "var(--color-error-bg)",
              borderColor: "var(--color-error-border)",
              ...(attentionFilter
                ? { color: "var(--bg)", fontWeight: "var(--weight-semibold)" }
                : null),
            }}
          >
            ⚠ {attentions}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Section label sobre — pas de marker éditorial ────────────

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2 px-8 pt-5 pb-3 t-13 font-medium">
      <span className="text-[var(--text)]">{label}</span>
      <span className="text-[var(--text-ghost)]">·</span>
      <span className="text-[var(--text-faint)] font-light">{count}</span>
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
  return (
    <div
      className="grid gap-6 px-8 pb-6"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
      }}
    >
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

// Variante visuelle dérivée du status. Active = silencieux ; warn/error =
// dot coloré + label texte sous le nom.
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
  const dotColor =
    variant === "warn" ? "var(--color-warning)"
      : variant === "error" ? "var(--color-error)"
        : "var(--cykan)";
  const statusLabel =
    variant === "warn" ? "OAuth en cours"
      : variant === "error" ? "À reconnecter"
        : null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${app.name}${statusLabel ? ` — ${statusLabel}` : ""}`}
      className="group flex flex-col items-center gap-2"
    >
      {/* Logo en relatif → permet d'ancrer le dot status en coin du logo
          (pas de la card — il n'y a plus de card). Le dot est petit et
          discret, sauf pour warn/error où il prend la couleur du status. */}
      <span className="relative inline-flex">
        <AppLogo app={app} size={48} />
        <span
          aria-hidden
          className="absolute w-2 h-2 rounded-pill"
          style={{
            top: "calc(-1 * var(--space-1))",
            right: "calc(-1 * var(--space-1))",
            background: dotColor,
            boxShadow: `0 0 8px color-mix(in srgb, ${dotColor} 60%, transparent)`,
            animation: variant === "warn" ? "blink 1.4s infinite" : undefined,
          }}
        />
      </span>
      <span
        className="t-11 text-center group-hover:text-[var(--cykan)] transition-colors"
        style={{
          fontWeight: "var(--weight-medium)",
          color: "var(--text)",
          lineHeight: "var(--leading-snug)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          wordBreak: "break-word",
        }}
      >
        {app.name}
      </span>
      {statusLabel && (
        <span
          className="t-9 font-light"
          style={{ color: dotColor }}
        >
          {statusLabel}
        </span>
      )}
    </button>
  );
}

// Starter pack pour les utilisateurs sans connexion. Quatre slugs Composio
// "essentiels" pour 80 % des cas d'usage (agenda, équipe, doc, fichiers).
// Si ces apps sont absentes du catalogue (ex: connectable=false côté tenant),
// elles n'apparaissent simplement pas dans le starter pack.
const STARTER_PICKS = ["googlecalendar", "slack", "notion", "googledrive"];

function OnboardingStage({
  apps,
  onSelect,
}: {
  apps: ComposioApp[];
  onSelect: (app: ComposioApp) => void;
}) {
  const starters = STARTER_PICKS
    .map((slug) => apps.find((a) => a.key === slug))
    .filter((a): a is ComposioApp => Boolean(a));

  return (
    <div className="px-8 pb-2">
      {starters.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {starters.map((app) => (
            <StarterTile key={app.key} app={app} onClick={() => onSelect(app)} />
          ))}
        </div>
      ) : (
        <div
          className="px-6 py-8 text-center rounded-none border-b border-[var(--border-shell)]"
          style={{
            background: "transparent",
          }}
        >
          <p className="t-13 text-[var(--text-soft)]">
            Pioche un logo dans le catalogue ci-dessous pour étendre ton agent.
          </p>
        </div>
      )}
    </div>
  );
}

function StarterTile({
  app,
  onClick,
}: {
  app: ComposioApp;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-2 transition-opacity hover:opacity-90"
    >
      <AppLogo app={app} size={48} />
      <span
        className="t-11 text-center group-hover:text-[var(--cykan)] transition-colors"
        style={{
          fontWeight: "var(--weight-medium)",
          color: "var(--text)",
          lineHeight: "var(--leading-snug)",
        }}
      >
        {app.name}
      </span>
      <span
        className="t-9 font-light text-[var(--cykan-deep)] opacity-0 group-hover:opacity-100 transition-opacity"
      >
        Connecter →
      </span>
    </button>
  );
}

// ─── Suggestions : strip horizontal compact ────────────────────

function SuggestionsGrid({
  suggestions,
  onSelect,
}: {
  suggestions: { app: ComposioApp; hint: string }[];
  onSelect: (app: ComposioApp) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-8 pb-6">
      {suggestions.map((s, i) => (
        <SuggestionCard
          key={s.app.key}
          app={s.app}
          hint={s.hint}
          featured={i === 0}
          onClick={() => onSelect(s.app)}
        />
      ))}
    </div>
  );
}

function SuggestionCard({
  app,
  hint,
  featured,
  onClick,
}: {
  app: ComposioApp;
  hint: string;
  featured: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 text-left transition-colors"
    >
      <AppLogo app={app} size={40} />
      <div className="flex-1 min-w-0">
        <div
          className="t-13 truncate group-hover:text-[var(--cykan)] transition-colors"
          style={{
            fontWeight: "var(--weight-semibold)",
            color: featured ? "var(--cykan-deep)" : "var(--text)",
          }}
        >
          {app.name}
        </div>
        <div
          className="t-11 mt-1 text-[var(--text-faint)] truncate"
          style={{ lineHeight: "var(--leading-snug)" }}
        >
          {hint}
        </div>
      </div>
      <span
        className="text-[var(--text-ghost)] group-hover:text-[var(--cykan-deep)] transition-colors"
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
      className="flex items-center gap-6 px-8 py-3 overflow-x-auto"
      style={{
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
        <span className="t-11 font-light whitespace-nowrap text-[var(--text-faint)] ml-auto">
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
      className="t-11 whitespace-nowrap transition-colors"
      style={{
        color: on ? "var(--cykan)" : "var(--text-faint)",
        fontWeight: on ? "var(--weight-semibold)" : "var(--weight-regular)",
      }}
    >
      {label}
      <span
        className="ml-2"
        style={{ color: on ? "var(--cykan)" : "var(--text-ghost)", opacity: on ? 0.6 : 1 }}
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
    <div className="px-8 pt-4 pb-8">
      {apps.length === 0 ? (
        <p className="t-13 font-light text-center py-10 text-[var(--text-faint)]">
          Aucun service dans cette catégorie.
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
        className="mt-5 pt-4 flex items-center justify-between t-11 font-light border-t"
        style={{
          borderColor: "var(--border-shell)",
          color: "var(--text-faint)",
        }}
      >
        <span>
          {apps.length} / {totalFiltered}
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
  // Trois états visuels :
  //  - connected      : couleur normale + dot cykan en coin + ring cykan
  //  - connectable    : grayscale léger (0.55) + retour couleur au hover
  //  - non-connectable: grayscale fort (0.85) + cadenas SVG en coin
  // Le cadenas vient d'un mini SVG inline (pas d'emoji — interdit par DS).
  const isConnectable = app.connectable !== false; // undefined = legacy, on assume connectable
  const variant = connected ? stageVariant(status ?? "active") : "active";
  const dotColor =
    variant === "warn" ? "var(--color-warning)"
      : variant === "error" ? "var(--color-error)"
        : "var(--cykan)";

  // Logos brand : on atténue saturation+luminance pour ne pas casser la palette
  // monochrome+cyan globale du produit. Connected reste reconnaissable mais ne
  // crie plus ; non-connectés gardent leur grayscale plus fort déjà existant.
  const filter = connected
    ? "saturate(0.6) brightness(0.92)"
    : isConnectable
      ? "grayscale(0.55) opacity(0.65)"
      : "grayscale(0.95) opacity(0.4)";

  return (
    <button
      type="button"
      onClick={onClick}
      title={isConnectable ? app.name : `${app.name} — config Composio requise`}
      aria-label={app.name}
      className="group relative aspect-square flex items-center justify-center rounded-none border transition-all"
      style={{
        borderColor: connected ? "var(--cykan-border)" : "var(--border-soft)",
        filter,
      }}
    >
      <AppLogo app={app} size={28} />
      {connected && (
        <span
          aria-hidden
          className="absolute w-2 h-2 rounded-pill"
          style={{
            top: "calc(-1 * var(--space-1))",
            right: "calc(-1 * var(--space-1))",
            background: dotColor,
            boxShadow: `0 0 4px color-mix(in srgb, ${dotColor} 60%, transparent)`,
          }}
        />
      )}
      {!connected && !isConnectable && <LockBadge />}
    </button>
  );
}

// Mini SVG cadenas pour les tiles non-connectables (auth-config Composio
// manquante). Couleur via currentColor → hérite de var(--text-faint).
function LockBadge() {
  return (
    <span
      aria-hidden
      className="absolute top-1 right-1 inline-flex items-center justify-center"
      style={{ color: "var(--text-faint)" }}
    >
      <svg width="9" height="11" viewBox="0 0 16 20" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="9" width="12" height="9" rx="1.5" />
        <path d="M5 9V6a3 3 0 0 1 6 0v3" strokeLinecap="round" />
      </svg>
    </span>
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
        <p className="t-15 font-medium text-[var(--text-muted)]">
          Aucun résultat
        </p>
      </div>
    );
  }
  return (
    <div className="px-8 pt-8 pb-8">
      <div className="flex items-baseline gap-2 mb-4 t-13 font-medium">
        <span className="text-[var(--text)]">Résultats</span>
        <span className="text-[var(--text-ghost)]">·</span>
        <span className="text-[var(--text-faint)] font-light">
          {results.length} sur {totalCount}
        </span>
      </div>
      <div className="flex flex-col divide-y">
        {results.map((app) => (
          <button
            key={app.key}
            type="button"
            onClick={() => onSelect(app)}
            className="group flex items-center gap-3 px-8 py-3 text-left transition-colors rounded-none"
            style={{
              background: "transparent",
              borderBottom: "1px solid var(--border-soft)",
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
              <div className="t-11 font-light mt-1 text-[var(--text-faint)] truncate">
                {connectedSlugs.has(app.key) ? "Connecté" : categoryLabel(app)}
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
  const wrapperClass = "shrink-0 inline-flex items-center justify-center overflow-hidden rounded-none";
  const inner = size >= 32 ? Math.round(size * 0.78) : size;

  if (app.logo && app.logo.startsWith("http")) {
    return (
      <span
        className={wrapperClass}
        style={{ width: size, height: size }}
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
  // Fallback (pas de logo distant) : pastille discrète avec l'initiale.
  return (
    <span
      className={wrapperClass}
      style={{
        width: size,
        height: size,
        fontSize: inner * 0.6,
        background: "var(--surface-2)",
        color: "var(--text-faint)",
        borderRadius: "0",
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

const ACTIONS_PREVIEW = 8;

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
  const [showAll, setShowAll] = useState(false);

  const totalActions = actions?.length ?? 0;
  const visibleActions = showAll
    ? actions ?? []
    : (actions ?? []).slice(0, ACTIONS_PREVIEW);
  const overflow = totalActions - visibleActions.length;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "var(--overlay-scrim)" }}
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={app.name}
        className="fixed right-0 top-0 bottom-0 w-full max-w-md z-50 flex flex-col border-l panel-enter"
        style={{ background: "var(--bg-elev)", borderColor: "var(--border-shell)" }}
      >
        {/* Header — close + status badge, fixe en haut */}
        <div
          className="shrink-0 px-6 py-5 border-b flex items-center justify-between"
          style={{ borderColor: "var(--border-shell)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="t-11 font-medium text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
          >
            ← Fermer
          </button>
          {isConnected && (
            <span className="t-11 font-medium text-[var(--cykan)]">
              ● Connecté
            </span>
          )}
        </div>

        {/* Body scrollable — titre, description, liste d'actions */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <AppLogo app={app} size={48} />
            <div className="min-w-0">
              <h2
                className="t-18 m-0"
                style={{ fontWeight: "var(--weight-semibold)", color: "var(--text)" }}
              >
                {app.name}
              </h2>
              <p className="t-11 font-light text-[var(--text-faint)] m-0 mt-1">
                {categoryLabel(app)}
              </p>
            </div>
          </div>

          {app.description && (
            <p
              className="t-13 mb-6"
              style={{ color: "var(--text-soft)", lineHeight: "var(--leading-relaxed)" }}
            >
              {app.description}
            </p>
          )}

          <ActionsSection
            isConnected={isConnected}
            loading={loadingActions}
            actions={visibleActions}
            totalActions={totalActions}
            overflow={overflow}
            showAll={showAll}
            onToggleShowAll={() => setShowAll((s) => !s)}
          />
        </div>

        {/* Footer sticky — bouton connect/disconnect en bas */}
        <div
          className="shrink-0 px-6 py-4 border-t"
          style={{ background: "var(--bg-elev)", borderColor: "var(--border-shell)" }}
        >
          {isConnected && connectedAccount?.source === "native" ? (
            <NativeFooter />
          ) : isConnected ? (
            <Action
              variant="secondary"
              tone="danger"
              onClick={onDisconnect}
              loading={busy}
              className="w-full"
            >
              {`Déconnecter ${app.name}`}
            </Action>
          ) : app.connectable === false ? (
            <NotConnectableFooter app={app} />
          ) : (
            <Action
              variant="primary"
              tone="brand"
              onClick={onConnect}
              loading={busy}
              className="w-full"
            >
              {`Connecter ${app.name}`}
            </Action>
          )}
        </div>
      </aside>
    </>
  );
}

// Footer pour les services connectés via le SSO initial (Google/Microsoft).
// Pas de bouton "Déconnecter" parce que ces tokens viennent du login —
// pour révoquer, l'utilisateur doit logout / changer de compte SSO.
function NativeFooter() {
  return (
    <div className="flex flex-col gap-2">
      <p className="t-11 font-medium" style={{ color: "var(--cykan-deep)" }}>
        Géré via le SSO
      </p>
      <p
        className="t-11"
        style={{ color: "var(--text-soft)", lineHeight: "var(--leading-snug)" }}
      >
        L&apos;accès à ce service vient de ton login Google/Microsoft initial —
        Hearst l&apos;utilise nativement, sans OAuth additionnel. Pour révoquer,
        change de session ou retire les permissions côté provider.
      </p>
    </div>
  );
}

// Footer alternatif quand le toolkit n'a pas d'auth-config Composio →
// le flow OAuth standard donnerait NO_INTEGRATION. On bascule sur un
// lien direct vers le dashboard Composio pour configurer l'intégration.
function NotConnectableFooter({ app }: { app: ComposioApp }) {
  const dashboardUrl = `https://app.composio.dev/app/${encodeURIComponent(app.key)}`;
  return (
    <div className="flex flex-col gap-2">
      <p
        className="t-11"
        style={{ color: "var(--text-soft)", lineHeight: "var(--leading-snug)" }}
      >
        Ce service demande une auth-config personnalisée côté Composio avant
        d&apos;être connectable depuis Hearst.
      </p>
      <a
        href={dashboardUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ghost-btn-solid ghost-btn-ghost w-full text-center"
        style={{
          color: "var(--text)",
          borderColor: "var(--border-default)",
          textDecoration: "none",
        }}
      >
        Configurer sur Composio →
      </a>
    </div>
  );
}

function ActionsSection({
  isConnected,
  loading,
  actions,
  totalActions,
  overflow,
  showAll,
  onToggleShowAll,
}: {
  isConnected: boolean;
  loading: boolean;
  actions: DiscoveredTool[];
  totalActions: number;
  overflow: number;
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3 t-13 font-medium">
        <span className="text-[var(--text)]">
          {isConnected ? "Ce que Hearst fait pour toi" : "Ce que ton agent pourra faire"}
        </span>
        {totalActions > 0 && (
          <>
            <span className="text-[var(--text-ghost)]">·</span>
            <span className="text-[var(--text-faint)] font-light">{totalActions}</span>
          </>
        )}
      </div>

      {loading ? (
        <ul className="space-y-1">
          {[0, 1, 2, 3].map((i) => (
            <li
              key={i}
              className="rounded-none"
              style={{
                background: "var(--surface-2)",
                height: "var(--space-8)",
                opacity: 0.6,
              }}
              aria-hidden
            />
          ))}
        </ul>
      ) : actions.length === 0 ? (
        <p className="t-11 text-[var(--text-faint)]">
          Aucune action listée pour ce service. Connecte-le et Hearst découvrira automatiquement ce qu&apos;il peut faire.
        </p>
      ) : (
        <ul className="space-y-px">
          {actions.map((a) => (
            <ActionBullet key={a.name} action={a} />
          ))}
          {(overflow > 0 || showAll) && (
            <li className="pt-2">
              <button
                type="button"
                onClick={onToggleShowAll}
                className="t-11 font-medium text-[var(--cykan-deep)] hover:text-[var(--cykan)] transition-colors"
              >
                {showAll
                  ? "← Réduire"
                  : `Voir les ${totalActions} actions →`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function ActionBullet({ action }: { action: DiscoveredTool }) {
  const title = actionLabel(action);
  const desc = truncateDescription(action.description);
  return (
    <li
      className="flex items-start gap-3 py-2 border-b"
      style={{ borderColor: "var(--border-soft)" }}
    >
      <span
        className="t-13 leading-none text-[var(--cykan)] mt-1"
        aria-hidden
      >
        ·
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="t-13"
          style={{ fontWeight: "var(--weight-medium)", color: "var(--text)" }}
        >
          {title}
        </div>
        {desc && (
          <div
            className="t-11 mt-1 text-[var(--text-faint)]"
            style={{ lineHeight: "var(--leading-snug)" }}
          >
            {desc}
          </div>
        )}
      </div>
    </li>
  );
}

// Première phrase de la description Composio, tronquée à ~120 chars. Évite les
// blocs verbeux remplis de "This action allows you to…".
function truncateDescription(desc: string): string | null {
  if (!desc) return null;
  const cleaned = desc.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  const max = 120;
  if (firstSentence.length <= max) return firstSentence;
  return firstSentence.slice(0, max).trimEnd() + "…";
}

function actionLabel(action: DiscoveredTool): string {
  // Composio slug = APP_VERB_OBJECT → "Send email", etc.
  const parts = action.name.split("_");
  if (parts.length <= 1) return action.description || action.name;
  const verb = parts[1].toLowerCase();
  const object = parts.slice(2).join(" ").toLowerCase();
  return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${object}`.trim();
}
