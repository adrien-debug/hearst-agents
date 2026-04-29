"use client";

/**
 * Commandeur — Command palette globale (Cmd+K).
 *
 * Entrée universelle indépendante du chat. Permet de :
 *  - Switcher de Stage (Cockpit, Chat, Asset, Browser, Meeting, KG, Voice)
 *  - Lancer une mission (Phase B branchera la création directe)
 *  - Query KG ("qu'est-ce que je sais sur X")
 *  - Ouvrir l'archive
 *  - Activer le mode voix
 *
 * V1 (Phase A) : actions hardcodées + filtre par query. V2 ajoutera les
 * actions dynamiques depuis le tool registry + l'historique récent.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStageStore, type StagePayload } from "@/stores/stage";

interface CommandAction {
  id: string;
  label: string;
  hint: string;
  hotkey?: string;
  /** True quand l'action ne peut pas être exécutée (pas de prérequis).
   * L'item reste visible pour discoverability mais le button est inactif. */
  disabled?: boolean;
  perform: () => void;
}

export function Commandeur() {
  const router = useRouter();
  const isOpen = useStageStore((s) => s.commandeurOpen);
  const setOpen = useStageStore((s) => s.setCommandeurOpen);
  const setStageMode = useStageStore((s) => s.setMode);
  const lastAssetId = useStageStore((s) => s.lastAssetId);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const actions = useMemo<CommandAction[]>(() => [
    {
      id: "go-cockpit",
      label: "Ouvrir le Cockpit",
      hint: "Home configurable · briefing du jour",
      hotkey: "⌘1",
      perform: () => {
        setStageMode({ mode: "cockpit" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-chat",
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
      label: "Ouvrir le dernier asset",
      hint: lastAssetId
        ? "Ré-ouvre l'asset cliqué le plus récemment"
        : "Aucun asset ouvert récemment — clique-en un d'abord",
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
      label: "Ouvrir Browser Stage",
      hint: "Co-pilote navigation web",
      hotkey: "⌘4",
      perform: () => {
        setStageMode({ mode: "browser", sessionId: "" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-meeting",
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
      label: "Knowledge Graph",
      hint: "Mémoire personnelle queryable",
      hotkey: "⌘6",
      perform: () => {
        setStageMode({ mode: "kg" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-voice",
      label: "Mode voix ambient",
      hint: "Conversation full-duplex < 500ms",
      hotkey: "⌘7",
      perform: () => {
        setStageMode({ mode: "voice" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "go-simulation",
      label: "Chambre de Simulation",
      hint: "DeepSeek R1 — 3-5 scénarios chiffrés",
      hotkey: "⌘8",
      perform: () => {
        setStageMode({ mode: "simulation" } as StagePayload);
        setOpen(false);
      },
    },
    {
      id: "open-archive",
      label: "Voir l'archive",
      hint: "Tous les threads + assets > 7 jours",
      perform: () => {
        router.push("/archive");
        setOpen(false);
      },
    },
    {
      id: "open-admin",
      label: "Console admin",
      hint: "Pipeline · agents · model profiles",
      perform: () => {
        router.push("/admin");
        setOpen(false);
      },
    },
  ], [setStageMode, setOpen, router, lastAssetId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q));
  }, [actions, query]);

  // Reset query on open/close
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset de l'état interne requis à la fermeture, le render-time pattern déclencherait set-state-in-render
      setQuery("");
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Keyboard nav inside palette
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
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const action = filtered[activeIndex];
        if (action) action.perform();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, filtered, activeIndex, setOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ background: "var(--overlay-scrim)", paddingTop: "var(--space-24)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-md border border-[var(--border-shell)] bg-[var(--bg-elev)]"
        style={{ boxShadow: "var(--shadow-card-hover)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--surface-2)]">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">CMDK</span>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Que veux-tu faire ?"
            className="flex-1 bg-transparent t-15 text-[var(--text)] placeholder-[var(--text-faint)] outline-none"
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">ESC</span>
        </div>

        <div className="max-h-96 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="t-13 text-[var(--text-faint)] text-center py-8">Aucune action ne correspond.</p>
          ) : (
            filtered.map((action, i) => (
              <button
                key={action.id}
                type="button"
                disabled={action.disabled}
                onClick={action.perform}
                onMouseEnter={() => !action.disabled && setActiveIndex(i)}
                className={`w-full px-6 py-3 flex items-center gap-4 text-left transition-colors ${
                  action.disabled
                    ? "opacity-40 cursor-not-allowed"
                    : i === activeIndex
                    ? "bg-[var(--surface-2)]"
                    : "hover:bg-[var(--surface-1)]"
                }`}
              >
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="t-13 font-medium text-[var(--text)] truncate">{action.label}</span>
                  <span className="t-11 font-light text-[var(--text-faint)] truncate">{action.hint}</span>
                </span>
                {action.hotkey && (
                  <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)] shrink-0">
                    {action.hotkey}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
