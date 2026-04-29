"use client";

/**
 * useGlobalHotkeys — Hooks raccourcis globaux pour Hearst OS.
 *
 * - ⌘K        : toggle Commandeur (palette)
 * - ⌘L        : toggle floating chat
 * - ⌘⇧V       : mode voix ambient
 * - ⌘1..⌘7    : switch direct vers un Stage
 * - ⌘⌫        : back stage
 *
 * Ignore les inputs / textarea / contenteditable pour ne pas voler les
 * touches au user en pleine saisie.
 */

import { useEffect } from "react";
import { useStageStore, STAGE_HOTKEYS, type StagePayload } from "@/stores/stage";

export function useGlobalHotkeys() {
  const toggleCommandeur = useStageStore((s) => s.toggleCommandeur);
  const toggleFloatingChat = useStageStore((s) => s.toggleFloatingChat);
  const setMode = useStageStore((s) => s.setMode);
  const back = useStageStore((s) => s.back);

  useEffect(() => {
    const isInInput = (e: KeyboardEvent): boolean => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable === true;
    };

    const onKey = (e: KeyboardEvent) => {
      // ⌘K et ⌘L : autorisés même en input (palette / chat flottant)
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        toggleCommandeur();
        return;
      }

      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        toggleFloatingChat();
        return;
      }

      // Le reste : skip si user en train de taper
      if (isInInput(e)) return;

      // ⌘⇧V : mode voix
      if (e.shiftKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        setMode({ mode: "voice" } as StagePayload);
        return;
      }

      // ⌘1..⌘7 : switch stages
      const hk = STAGE_HOTKEYS.find((h) => h.key === e.key);
      if (hk) {
        e.preventDefault();
        // Dispatch avec payload minimal — les modes browser/meeting/kg/asset
        // qui requièrent un payload spécifique gèrent l'empty state
        // gracieusement (sessionId vide → empty state Stage).
        switch (hk.mode) {
          case "cockpit":
            setMode({ mode: "cockpit" });
            break;
          case "chat":
            setMode({ mode: "chat" });
            break;
          case "asset": {
            // Ré-ouvre le dernier asset cliqué (depuis stage store).
            // No-op silencieux si aucun asset n'a encore été ouvert —
            // évite de push un AssetStage avec assetId vide qui afficherait
            // un placeholder dénué de sens.
            const lastAssetId = useStageStore.getState().lastAssetId;
            if (lastAssetId) {
              setMode({ mode: "asset", assetId: lastAssetId });
            }
            break;
          }
          case "browser":
            setMode({ mode: "browser", sessionId: "" });
            break;
          case "meeting":
            setMode({ mode: "meeting", meetingId: "" });
            break;
          case "kg":
            setMode({ mode: "kg" });
            break;
          case "voice":
            setMode({ mode: "voice" });
            break;
        }
        return;
      }

      // ⌘⌫ : back
      if (e.key === "Backspace") {
        e.preventDefault();
        back();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCommandeur, toggleFloatingChat, setMode, back]);
}
