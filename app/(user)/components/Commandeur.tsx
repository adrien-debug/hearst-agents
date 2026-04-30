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

type CommandSection = "navigate" | "action" | "stage";

interface CommandAction {
  id: string;
  label: string;
  hint: string;
  hotkey?: string;
  /** Catégorie visuelle dans la palette (Naviguer / Action rapide / Stages). */
  section: CommandSection;
  /** True quand l'action ne peut pas être exécutée (pas de prérequis).
   * L'item reste visible pour discoverability mais le button est inactif. */
  disabled?: boolean;
  perform: () => void;
}

const SECTION_LABEL: Record<CommandSection, string> = {
  navigate: "Naviguer",
  action: "Action rapide",
  stage: "Stages",
};

const SECTION_ORDER: CommandSection[] = ["navigate", "action", "stage"];

export function Commandeur() {
  const router = useRouter();
  const isOpen = useStageStore((s) => s.commandeurOpen);
  const setOpen = useStageStore((s) => s.setCommandeurOpen);
  const setStageMode = useStageStore((s) => s.setMode);
  const lastAssetId = useStageStore((s) => s.lastAssetId);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const actions = useMemo<CommandAction[]>(() => [
    // ── Naviguer ────────────────────────────────────────────────────────────
    {
      id: "nav-reports",
      label: "Voir les rapports",
      hint: "Bibliothèque rapports · catalog + historique",
      section: "navigate",
      perform: () => {
        router.push("/reports");
        setOpen(false);
      },
    },
    {
      id: "nav-missions",
      label: "Voir les missions",
      hint: "Plans long-running · runs en cours",
      section: "navigate",
      perform: () => {
        router.push("/missions");
        setOpen(false);
      },
    },
    {
      id: "nav-runs",
      label: "Voir les runs",
      hint: "Historique exécutions · logs et résultats",
      section: "navigate",
      perform: () => {
        router.push("/runs");
        setOpen(false);
      },
    },
    {
      id: "nav-notifications",
      label: "Voir les notifications",
      hint: "Centre de notifications · signaux et alertes",
      section: "navigate",
      perform: () => {
        router.push("/notifications");
        setOpen(false);
      },
    },
    {
      id: "nav-apps",
      label: "Voir les apps connectées",
      hint: "Connecteurs OAuth · statut intégrations",
      section: "navigate",
      perform: () => {
        router.push("/apps");
        setOpen(false);
      },
    },
    {
      id: "nav-settings-alerting",
      label: "Voir les paramètres alerting",
      hint: "Seuils · canaux · règles de notification",
      section: "navigate",
      perform: () => {
        router.push("/settings/alerting");
        setOpen(false);
      },
    },
    {
      id: "open-archive",
      label: "Voir l'archive",
      hint: "Tous les threads + assets > 7 jours",
      section: "navigate",
      perform: () => {
        router.push("/archive");
        setOpen(false);
      },
    },
    {
      id: "open-admin",
      label: "Console admin",
      hint: "Pipeline · agents · model profiles",
      section: "navigate",
      perform: () => {
        router.push("/admin");
        setOpen(false);
      },
    },

    // ── Action rapide ───────────────────────────────────────────────────────
    {
      id: "action-new-mission",
      label: "Nouvelle mission",
      hint: "Crée une mission avec l'éditeur",
      section: "action",
      perform: () => {
        router.push("/missions?new=1");
        setOpen(false);
      },
    },
    {
      id: "action-launch-report",
      label: "Lancer un rapport",
      hint: "Choisis un report depuis le catalog",
      section: "action",
      perform: () => {
        router.push("/reports");
        setOpen(false);
      },
    },

    // ── Stages ──────────────────────────────────────────────────────────────
    {
      id: "go-cockpit",
      label: "Ouvrir le Cockpit",
      hint: "Home configurable · briefing du jour",
      hotkey: "⌘1",
      section: "stage",
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
      section: "stage",
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
      section: "stage",
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
      section: "stage",
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
      section: "stage",
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
      section: "stage",
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
      section: "stage",
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
      section: "stage",
      perform: () => {
        setStageMode({ mode: "simulation" } as StagePayload);
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
      className="fixed inset-0 z-50 flex items-start justify-center transition-all duration-500"
      style={{
        background: "var(--overlay-scrim)",
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        paddingTop: "15vh"
      }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-3xl overflow-hidden transition-all duration-500 border-l border-[var(--border-shell)]"
        style={{
          background: "transparent",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-8 px-12 py-8"
        >
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Rechercher..."
            className="flex-1 bg-transparent t-48 leading-none font-bold tracking-tight text-[var(--text)] placeholder-[var(--text-ghost)] outline-none"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-12 pb-16 scrollbar-hide">
          {filtered.length === 0 ? (
            <p className="t-13 text-[var(--text-ghost)] font-light">Aucun résultat.</p>
          ) : (
            <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
              {SECTION_ORDER.map((section) => {
                const items = filtered.filter((a) => a.section === section);
                if (items.length === 0) return null;
                return (
                  <section key={section} className="flex flex-col gap-1">
                    <h2
                      className="t-9 font-mono uppercase tracking-marquee"
                      style={{
                        color: "var(--text-ghost)",
                        marginBottom: "var(--space-2)",
                      }}
                    >
                      {SECTION_LABEL[section]}
                    </h2>
                    {items.map((action) => {
                      const i = filtered.indexOf(action);
                      return (
                        <button
                          key={action.id}
                          type="button"
                          disabled={action.disabled}
                          onClick={action.perform}
                          onMouseEnter={() => !action.disabled && setActiveIndex(i)}
                          className={`w-full py-3 flex items-baseline gap-6 text-left transition-all duration-200 ${
                            action.disabled
                              ? "opacity-20 cursor-not-allowed"
                              : i === activeIndex
                              ? "translate-x-2"
                              : "hover:translate-x-1"
                          }`}
                        >
                          <span className={`t-24 leading-none tracking-tight transition-colors duration-200 ${i === activeIndex && !action.disabled ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                            {action.label}
                          </span>
                          <span className={`t-9 font-mono uppercase tracking-snug transition-colors duration-200 ${i === activeIndex && !action.disabled ? "text-[var(--text-muted)]" : "text-[var(--text-ghost)]"}`}>
                            {action.hint}
                          </span>
                          {action.hotkey && (
                            <span
                              className="t-9 font-mono uppercase tracking-marquee ml-auto shrink-0"
                              style={{ color: "var(--text-ghost)" }}
                            >
                              {action.hotkey}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
