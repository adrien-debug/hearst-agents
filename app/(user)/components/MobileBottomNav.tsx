"use client";

/**
 * MobileBottomNav — C8 Mobile companion.
 *
 * Visible uniquement < md (Tailwind `md:hidden`). Fixed bottom, safe-area
 * inset bottom respecté pour iOS notch.
 *
 * 5 actions :
 *   Cockpit / Chat / Voice (central, large, accent cykan) / Asset / Commandeur
 *
 * Voice est central car c'est le moonshot du C8 (voice-first quick access).
 * Asset ouvre le dernier asset focalisé (lastAssetId), fallback Commandeur.
 *
 * Tokens uniquement (cf. CLAUDE.md). Pas d'icônes lourdes — glyphes texte
 * minimalistes pour réduire le poids et rester cohérent avec le reste de
 * l'app (PulseBar, ghost-icons).
 */

import { useStageStore } from "@/stores/stage";
import { useVoiceStore } from "@/stores/voice";

interface NavItem {
  id: "cockpit" | "chat" | "voice" | "asset" | "commandeur";
  label: string;
  glyph: string;
  emphasis?: boolean;
}

const ITEMS: NavItem[] = [
  { id: "cockpit", label: "Cockpit", glyph: "▦" },
  { id: "chat", label: "Chat", glyph: "✱" },
  { id: "voice", label: "Voice", glyph: "◉", emphasis: true },
  { id: "asset", label: "Asset", glyph: "◰" },
  { id: "commandeur", label: "Cmd", glyph: "⌘" },
];

export function MobileBottomNav() {
  const setMode = useStageStore((s) => s.setMode);
  const currentMode = useStageStore((s) => s.current.mode);
  const lastAssetId = useStageStore((s) => s.lastAssetId);
  const setCommandeurOpen = useStageStore((s) => s.setCommandeurOpen);
  const setVoiceActive = useVoiceStore((s) => s.setVoiceActive);

  const handlePress = (id: NavItem["id"]) => {
    switch (id) {
      case "cockpit":
        setMode({ mode: "cockpit" });
        break;
      case "chat":
        setMode({ mode: "chat" });
        break;
      case "voice":
        setMode({ mode: "voice" });
        setVoiceActive(true);
        break;
      case "asset":
        if (lastAssetId) {
          setMode({ mode: "asset", assetId: lastAssetId });
        } else {
          setCommandeurOpen(true);
        }
        break;
      case "commandeur":
        setCommandeurOpen(true);
        break;
    }
  };

  const isActive = (id: NavItem["id"]) => {
    if (id === "asset") return currentMode === "asset";
    if (id === "voice") return currentMode === "voice";
    if (id === "chat") return currentMode === "chat";
    if (id === "cockpit") return currentMode === "cockpit";
    return false;
  };

  return (
    <nav
      aria-label="Navigation mobile"
      className="md:hidden fixed bottom-0 left-0 right-0 flex items-stretch justify-between"
      style={{
        zIndex: 40,
        background: "var(--bg)",
        borderTop: "1px solid var(--border-default)",
        paddingLeft: "var(--space-2)",
        paddingRight: "var(--space-2)",
        paddingTop: "var(--space-2)",
        paddingBottom: "calc(var(--space-2) + env(safe-area-inset-bottom, 0px))",
        gap: "var(--space-1)",
      }}
    >
      {ITEMS.map((item) => {
        const active = isActive(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handlePress(item.id)}
            aria-label={item.label}
            data-testid={`mobile-nav-${item.id}`}
            data-active={active}
            className="flex flex-col items-center justify-center transition-colors"
            style={{
              flex: item.emphasis ? "1.6" : "1",
              padding: "var(--space-2)",
              borderRadius: "var(--radius-md)",
              border: "none",
              cursor: "pointer",
              gap: "var(--space-1)",
              background: item.emphasis
                ? active
                  ? "var(--cykan)"
                  : "var(--cykan-surface)"
                : active
                  ? "var(--surface-1)"
                  : "transparent",
              color: item.emphasis
                ? active
                  ? "var(--text-on-cykan)"
                  : "var(--cykan)"
                : active
                  ? "var(--cykan)"
                  : "var(--text-muted)",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: "var(--space-4)", lineHeight: 1 }}>
              {item.glyph}
            </span>
            <span className="t-9 font-mono uppercase tracking-marquee">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
