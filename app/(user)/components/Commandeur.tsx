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
import { useVoiceStore } from "@/stores/voice";

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
        useVoiceStore.getState().setVoiceActive(true);
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
      className="fixed inset-0 z-50 flex items-start justify-center transition-all duration-300"
      style={{
        background: "var(--overlay-scrim)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        paddingTop: "20vh"
      }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden transition-all duration-300"
        style={{
          background: "var(--surface-1)",
          boxShadow: "var(--shadow-card-hover)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-4 px-6 py-5"
          style={{ boxShadow: "var(--shadow-divider-bottom)" }}
        >
          <span className="t-9 tracking-display uppercase text-[var(--cykan)]">CMDK</span>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Que veux-tu faire ?"
            className="flex-1 bg-transparent t-18 font-light text-[var(--text-soft)] placeholder-[var(--text-ghost)] outline-none"
          />
          <span className="t-9 tracking-display uppercase text-[var(--text-ghost)]">ESC</span>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-2 scrollbar-hide">
          {filtered.length === 0 ? (
            <p className="t-13 text-[var(--text-ghost)] text-center py-8 font-light">Aucune action ne correspond.</p>
          ) : (
            filtered.map((action, i) => (
              <button
                key={action.id}
                type="button"
                disabled={action.disabled}
                onClick={action.perform}
                onMouseEnter={() => !action.disabled && setActiveIndex(i)}
                className={`w-full px-6 py-3 flex items-center gap-4 text-left transition-colors duration-150 ${
                  action.disabled
                    ? "opacity-30 cursor-not-allowed"
                    : i === activeIndex
                    ? "bg-[var(--surface-2)]"
                    : "hover:bg-[var(--surface-1)]"
                }`}
              >
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className={`t-13 truncate transition-colors duration-150 ${i === activeIndex && !action.disabled ? "text-[var(--text-soft)] font-medium" : "text-[var(--text-muted)] font-light"}`}>{action.label}</span>
                  <span className={`t-11 truncate transition-colors duration-150 ${i === activeIndex && !action.disabled ? "text-[var(--text-muted)]" : "text-[var(--text-ghost)]"}`}>{action.hint}</span>
                </span>
                {action.hotkey && (
                  <span className="t-9 tracking-display uppercase shrink-0" style={{ color: i === activeIndex && !action.disabled ? "var(--cykan)" : "var(--text-ghost)" }}>
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
