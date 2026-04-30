"use client";

/**
 * Commandeur — Command palette globale (Cmd+K) sémantique.
 *
 * Sections (collapse-friendly visuellement, rendues si non-vide) :
 *   - Actions    → hardcoded (navigate, stages, quick actions)
 *   - Recent     → threads récents (max 5)
 *   - Assets     → résultats search /api/v2/search?q=
 *   - Missions   → idem
 *   - Threads    → idem (chat_messages content)
 *   - Tools      → placeholder Phase B suivante (apps connectées)
 *   - KG         → kg_nodes
 *
 * Comportement :
 *   - Query vide → Actions + Recent uniquement (pas de fetch)
 *   - Query non-vide → debounced fetch (200ms) + filtre local sur Actions
 *   - Hotkeys ⌘1-9 / ⌘K / ⌘B / ⌘⇧V intacts (gérés par useGlobalHotkeys)
 *   - Keyboard nav ↑↓ entre toutes les sections, Enter, Esc
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStageStore, type StagePayload } from "@/stores/stage";
import { useVoiceStore } from "@/stores/voice";
import { useNavigationStore } from "@/stores/navigation";
import { CommandeurResultRow, type CommandeurResultKind } from "./CommandeurResultRow";
import { useCommandeurData } from "./use-commandeur-data";

interface CommandRow {
  id: string;
  kind: CommandeurResultKind;
  label: string;
  hint?: string;
  hotkey?: string;
  disabled?: boolean;
  perform: () => void;
}

interface CommandSection {
  key: string;
  title: string;
  rows: CommandRow[];
}

export function Commandeur() {
  const router = useRouter();
  const isOpen = useStageStore((s) => s.commandeurOpen);
  const setOpen = useStageStore((s) => s.setCommandeurOpen);
  const setStageMode = useStageStore((s) => s.setMode);
  const lastAssetId = useStageStore((s) => s.lastAssetId);
  const threads = useNavigationStore((s) => s.threads);
  const setActiveThread = useNavigationStore((s) => s.setActiveThread);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const { results, loading } = useCommandeurData(query, isOpen);

  // ── Actions hardcoded (toujours présentes, filtrables localement) ──
  const allActions = useMemo<CommandRow[]>(() => [
    {
      id: "nav-reports",
      kind: "action",
      label: "Voir les rapports",
      hint: "Bibliothèque rapports",
      perform: () => {
        router.push("/reports");
        setOpen(false);
      },
    },
    {
      id: "nav-missions",
      kind: "action",
      label: "Voir les missions",
      hint: "Plans long-running",
      perform: () => {
        router.push("/missions");
        setOpen(false);
      },
    },
    {
      id: "nav-runs",
      kind: "action",
      label: "Voir les runs",
      hint: "Historique exécutions",
      perform: () => {
        router.push("/runs");
        setOpen(false);
      },
    },
    {
      id: "nav-notifications",
      kind: "action",
      label: "Voir les notifications",
      hint: "Centre signaux et alertes",
      perform: () => {
        router.push("/notifications");
        setOpen(false);
      },
    },
    {
      id: "nav-apps",
      kind: "action",
      label: "Voir les apps connectées",
      hint: "Connecteurs OAuth",
      perform: () => {
        router.push("/apps");
        setOpen(false);
      },
    },
    {
      id: "nav-marketplace",
      kind: "action",
      label: "Marketplace",
      hint: "Templates communautaires partagés",
      perform: () => {
        router.push("/marketplace");
        setOpen(false);
      },
    },
    {
      id: "nav-settings-alerting",
      kind: "action",
      label: "Paramètres alerting",
      hint: "Seuils · canaux · règles",
      perform: () => {
        router.push("/settings/alerting");
        setOpen(false);
      },
    },
    {
      id: "open-archive",
      kind: "action",
      label: "Voir l'archive",
      hint: "Threads + assets > 7 jours",
      perform: () => {
        router.push("/archive");
        setOpen(false);
      },
    },
    {
      id: "open-hospitality",
      kind: "action",
      label: "Hospitality Mode",
      hint: "Cockpit vertical hôtellerie",
      perform: () => {
        router.push("/hospitality");
        setOpen(false);
      },
    },
    {
      id: "open-admin",
      kind: "action",
      label: "Console admin",
      hint: "Pipeline · agents · profiles",
      perform: () => {
        router.push("/admin");
        setOpen(false);
      },
    },
    {
      id: "action-new-mission",
      kind: "action",
      label: "Nouvelle mission",
      hint: "Crée une mission",
      perform: () => {
        router.push("/missions?new=1");
        setOpen(false);
      },
    },
    {
      id: "action-launch-report",
      kind: "action",
      label: "Lancer un rapport",
      hint: "Choisis depuis le catalog",
      perform: () => {
        router.push("/reports");
        setOpen(false);
      },
    },
    {
      id: "go-cockpit",
      kind: "action",
      label: "Ouvrir le Cockpit",
      hint: "Briefing du jour",
      hotkey: "⌘1",
      perform: () => {
        setStageMode({ mode: "cockpit" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-chat",
      kind: "action",
      label: "Aller au Chat",
      hint: "Conversation active",
      hotkey: "⌘2",
      perform: () => {
        setStageMode({ mode: "chat" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-asset",
      kind: "action",
      label: "Ouvrir le dernier asset",
      hint: lastAssetId
        ? "Ré-ouvre l'asset le plus récent"
        : "Aucun asset ouvert récemment",
      hotkey: "⌘3",
      disabled: !lastAssetId,
      perform: () => {
        if (!lastAssetId) return;
        setStageMode({ mode: "asset", assetId: lastAssetId } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-browser",
      kind: "action",
      label: "Browser Stage",
      hint: "Co-pilote navigation web",
      hotkey: "⌘4",
      perform: () => {
        setStageMode({ mode: "browser", sessionId: "" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-meeting",
      kind: "action",
      label: "Meeting Stage",
      hint: "Bot meeting + action items",
      hotkey: "⌘5",
      perform: () => {
        setStageMode({ mode: "meeting", meetingId: "" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-kg",
      kind: "action",
      label: "Knowledge Graph",
      hint: "Mémoire personnelle",
      hotkey: "⌘6",
      perform: () => {
        setStageMode({ mode: "kg" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-voice",
      kind: "action",
      label: "Mode voix ambient",
      hint: "Conversation full-duplex",
      hotkey: "⌘7",
      perform: () => {
        useVoiceStore.getState().setVoiceActive(true);
        setStageMode({ mode: "voice" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-simulation",
      kind: "action",
      label: "Chambre de Simulation",
      hint: "DeepSeek scenarios chiffrés",
      hotkey: "⌘8",
      perform: () => {
        setStageMode({ mode: "simulation" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-artifact",
      kind: "action",
      label: "Artifact (code + E2B)",
      hint: "Éditeur Python/Node, run sandbox",
      hotkey: "⌘0",
      perform: () => {
        setStageMode({ mode: "artifact" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "action-compare-assets",
      kind: "action",
      label: "Comparer 2 assets",
      hint: "Split view + diff sémantique",
      perform: () => {
        const idA = window.prompt("ID du premier asset (A) :")?.trim();
        if (!idA) return;
        const idB = window.prompt("ID du deuxième asset (B) :")?.trim();
        if (!idB) return;
        setStageMode({
          mode: "asset_compare",
          assetIdA: idA,
          assetIdB: idB,
        } as StagePayload);
        setOpen(false);
      },
    },
  ], [setStageMode, setOpen, router, lastAssetId]);

  // ── Recent threads (depuis store nav, max 5) ───────────────────
  const recentRows = useMemo<CommandRow[]>(() => {
    return [...threads]
      .filter((t) => !t.archived)
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, 5)
      .map((thread) => ({
        id: `recent-${thread.id}`,
        kind: "thread" as const,
        label: thread.name || "Conversation",
        hint: new Date(thread.lastActivity).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "short",
        }),
        perform: () => {
          setActiveThread(thread.id);
          setStageMode({ mode: "chat", threadId: thread.id } as StagePayload);
          setOpen(false);
        },
      }));
  }, [threads, setActiveThread, setStageMode, setOpen]);

  // ── Sections rendues ───────────────────────────────────────────
  const sections = useMemo<CommandSection[]>(() => {
    const trimmed = query.trim().toLowerCase();
    const filteredActions = !trimmed
      ? allActions
      : allActions.filter(
          (a) =>
            a.label.toLowerCase().includes(trimmed) ||
            (a.hint ?? "").toLowerCase().includes(trimmed),
        );

    const out: CommandSection[] = [];
    if (filteredActions.length > 0) {
      out.push({ key: "actions", title: "Actions", rows: filteredActions });
    }

    if (!trimmed && recentRows.length > 0) {
      out.push({ key: "recent", title: "Récents", rows: recentRows });
    }

    if (trimmed) {
      if (results.assets.length > 0) {
        out.push({
          key: "assets",
          title: "Assets",
          rows: results.assets.map((a) => ({
            id: `asset-${a.id}`,
            kind: "asset",
            label: a.title,
            hint: a.kind,
            perform: () => {
              setStageMode({ mode: "asset", assetId: a.id } as StagePayload);
              setOpen(false);
            },
          })),
        });
      }
      if (results.missions.length > 0) {
        out.push({
          key: "missions",
          title: "Missions",
          rows: results.missions.map((m) => ({
            id: `mission-${m.id}`,
            kind: "mission",
            label: m.title,
            hint: m.status,
            perform: () => {
              setStageMode({ mode: "mission", missionId: m.id } as StagePayload);
              setOpen(false);
            },
          })),
        });
      }
      if (results.threads.length > 0) {
        out.push({
          key: "threads",
          title: "Conversations",
          rows: results.threads.map((t) => ({
            id: `thread-${t.id}`,
            kind: "thread",
            label: t.title,
            hint: t.preview.slice(0, 60),
            perform: () => {
              setActiveThread(t.id);
              setStageMode({ mode: "chat", threadId: t.id } as StagePayload);
              setOpen(false);
            },
          })),
        });
      }
      if (results.kgNodes.length > 0) {
        out.push({
          key: "kg",
          title: "Knowledge",
          rows: results.kgNodes.map((n) => ({
            id: `kg-${n.id}`,
            kind: "kg",
            label: n.label,
            hint: n.type,
            perform: () => {
              setStageMode({ mode: "kg", entityId: n.id } as StagePayload);
              setOpen(false);
            },
          })),
        });
      }
      if (results.runs.length > 0) {
        out.push({
          key: "runs",
          title: "Runs",
          rows: results.runs.map((r) => ({
            id: `run-${r.id}`,
            kind: "run",
            label: r.label,
            hint: r.createdAt ? new Date(r.createdAt).toLocaleDateString("fr-FR") : "",
            perform: () => {
              router.push(`/runs/${r.id}`);
              setOpen(false);
            },
          })),
        });
      }
    }

    return out;
  }, [allActions, recentRows, query, results, setStageMode, setActiveThread, setOpen, router]);

  // Flatten pour la nav clavier.
  const flatRows = useMemo<CommandRow[]>(
    () => sections.flatMap((s) => s.rows),
    [sections],
  );

  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset à la fermeture (pas de render-time pattern)
      setQuery("");
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset clavier index quand la query change
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatRows.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const row = flatRows[activeIndex];
        if (row && !row.disabled) row.perform();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, flatRows, activeIndex, setOpen]);

  if (!isOpen) return null;

  let runningIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center transition-all duration-500"
      style={{
        background: "var(--overlay-scrim)",
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        paddingTop: "15vh",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-3xl overflow-hidden transition-all duration-500 border-l border-[var(--border-shell)]"
        style={{ background: "transparent" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-8 px-12 py-8">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher..."
            className="flex-1 bg-transparent t-48 leading-none font-bold tracking-tight text-[var(--text)] placeholder-[var(--text-ghost)] outline-none"
          />
          {loading && (
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">
              Recherche…
            </span>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-12 pb-16 scrollbar-hide">
          {sections.length === 0 ? (
            <p className="t-13 text-[var(--text-ghost)] font-light">Aucun résultat.</p>
          ) : (
            <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
              {sections.map((section) => (
                <section key={section.key} className="flex flex-col gap-1">
                  <h2
                    className="t-9 font-mono uppercase tracking-marquee"
                    style={{
                      color: "var(--text-ghost)",
                      marginBottom: "var(--space-2)",
                    }}
                  >
                    {section.title}
                  </h2>
                  {section.rows.map((row) => {
                    const myIndex = runningIndex++;
                    return (
                      <CommandeurResultRow
                        key={row.id}
                        kind={row.kind}
                        label={row.label}
                        hint={row.hint}
                        hotkey={row.hotkey}
                        active={myIndex === activeIndex}
                        disabled={row.disabled}
                        onSelect={() => {
                          if (!row.disabled) row.perform();
                        }}
                        onHover={() => {
                          if (!row.disabled) setActiveIndex(myIndex);
                        }}
                      />
                    );
                  })}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
