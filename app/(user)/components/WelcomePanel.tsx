"use client";

import { useRouter } from "next/navigation";
import { useNavigationStore } from "@/stores/navigation";
import { useStageStore } from "@/stores/stage";
import { CockpitHero } from "./stages/CockpitHero";

/**
 * WelcomePanel — Empty state du ChatStage (mode="chat" sans messages).
 *
 * Si un thread est déjà actif, on skip le greeting CockpitHero : il fait
 * doublon avec <ConversationHeader> (titre + date) qui est rendu par
 * ChatStage juste au-dessus. Sinon (cas rare : ChatStage sans thread),
 * on garde le greeting éditorial pour ne pas atterrir sur un écran vide.
 */
export function WelcomePanel() {
  const router = useRouter();
  const addThread = useNavigationStore((s) => s.addThread);
  const setStageMode = useStageStore((s) => s.setMode);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);

  const newBrief = () => {
    const threadId = addThread("New", "home");
    setStageMode({ mode: "chat", threadId });
  };

  const focusInput = () => {
    const ta = document.querySelector<HTMLTextAreaElement>("textarea");
    ta?.focus();
  };

  const QUICK_ACTIONS = [
    { label: "Brief du jour",      hotkey: "⌘B", action: newBrief },
    { label: "Lancer une recherche", hotkey: "⌘Q", action: focusInput },
    { label: "Mes artefacts",      hotkey: "⌘A", action: () => router.push("/assets") },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {!activeThreadId && <CockpitHero />}

      <div
        style={{
          padding: activeThreadId
            ? "var(--space-12)"
            : "0 var(--space-12) var(--space-12)",
        }}
      >
        <p
          className="t-13 font-medium"
          style={{
            color: "var(--text-l1)",
            marginBottom: "var(--space-8)",
          }}
        >
          Raccourcis
        </p>
        {QUICK_ACTIONS.map((a) => (
          <button key={a.label} type="button" onClick={a.action} className="cockpit-action">
            <span className="ca-label">{a.label}</span>
            <span className="ca-hotkey">{a.hotkey}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0" />
    </div>
  );
}
