"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { LeftPanelShell } from "./components/LeftPanelShell";
import { RightPanel } from "./components/RightPanel";
import { Commandeur } from "./components/Commandeur";
import { ChatDock } from "./components/ChatDock";
import { VoicePulse } from "./components/voice/VoicePulse";
import { ToastContainer } from "@/app/components/ToastContainer";
import { useToast } from "@/app/hooks/use-toast";
import { useGlobalHotkeys } from "@/app/hooks/use-global-hotkeys";
import { useVoiceStore } from "@/stores/voice";

function BriefingAutoTrigger() {
  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 6 && h <= 10) {
      void fetch("/api/briefing", { method: "POST" }).catch(() => {});
    }
  }, []);
  return null;
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, dismiss } = useToast();
  return (
    <>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

/**
 * VoiceMount — Mount conditionnel du pipeline WebRTC voix.
 *
 * Vit au root layout pour ne JAMAIS unmount lors de la navigation entre
 * Stages. La connexion OpenAI Realtime ne s'ouvre que quand
 * `useVoiceStore.voiceActive` passe à true (déclenché par ⌘7, ⌘⇧V, ou
 * Commandeur). Avant : VoicePulse était dans VoiceStage → mount/unmount
 * à chaque navigation → 14 sessions accumulées + 4 agents qui parlaient
 * en chœur.
 */
function VoiceMount() {
  const voiceActive = useVoiceStore((s) => s.voiceActive);
  if (!voiceActive) return null;
  return <VoicePulse />;
}

/**
 * UserLayout — Post-pivot 2026-04-29.
 *
 * Layout cockpit :
 *   PulseBar (top fixed, état système + jobs + voice + credits)
 *   ┌──────────┬───────────────────────────────────┬──────────┐
 *   │ Timeline │  Stage polymorphe (page.tsx)      │ Context  │
 *   │   Rail   │                                   │   Rail   │
 *   └──────────┴───────────────────────────────────┴──────────┘
 *   Commandeur (overlay Cmd+K, monté toujours, hidden if !isOpen)
 *
 * useGlobalHotkeys branche les raccourcis : Cmd+K, Cmd+1..7
 * (cockpit/chat/asset/browser/meeting/kg/voice), Cmd+Backspace.
 */
export default function UserLayout({ children }: { children: React.ReactNode }) {
  useGlobalHotkeys();

  return (
    <SessionProvider>
      <BriefingAutoTrigger />
      <ToastProvider>
        <div
          className="h-screen w-full flex flex-col overflow-hidden"
          style={{ background: "var(--bg-center)", color: "var(--text)" }}
        >
          <div className="flex flex-1 min-h-0 w-full">
            <LeftPanelShell />

            <div
              data-theme="light"
              className="flex-1 flex flex-col min-w-0 min-h-0 relative"
              style={{ background: "var(--surface)", color: "var(--text)" }}
            >
              <main className="flex-1 flex flex-col min-w-0 min-h-0 relative">
                {children}
              </main>
              <ChatDock />
            </div>

            <RightPanel />
          </div>

          {/* Overlay global — toujours monté, contrôlé par useStageStore.commandeurOpen */}
          <Commandeur />

          {/* Pipeline WebRTC voix — vit au root, n'est rendu que si voiceActive */}
          <VoiceMount />
        </div>
      </ToastProvider>
    </SessionProvider>
  );
}
