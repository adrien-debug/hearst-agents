"use client";

import { SessionProvider } from "next-auth/react";
import { LeftPanelShell } from "./components/LeftPanelShell";
import { RightPanel } from "./components/RightPanel";
import { TopBar } from "./components/TopBar";
import { PulseBar } from "./components/PulseBar";
import { Commandeur } from "./components/Commandeur";
import { ToastContainer } from "@/app/components/ToastContainer";
import { useToast } from "@/app/hooks/use-toast";
import { useGlobalHotkeys } from "@/app/hooks/use-global-hotkeys";

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
 * useGlobalHotkeys branche les raccourcis : Cmd+K, Cmd+L, Cmd+1..7,
 * Cmd+Shift+V, Cmd+Backspace.
 */
export default function UserLayout({ children }: { children: React.ReactNode }) {
  useGlobalHotkeys();

  return (
    <SessionProvider>
      <ToastProvider>
        <div
          data-theme="light"
          className="h-screen w-full flex flex-col overflow-hidden"
          style={{ background: "var(--bg-center)", color: "var(--text)" }}
        >
          <PulseBar />

          <div className="flex flex-1 min-h-0 w-full">
            <LeftPanelShell />

            <main className="flex-1 flex flex-col min-w-0 min-h-0 relative">
              <TopBar />
              {children}
            </main>

            <RightPanel />
          </div>

          {/* Overlay global — toujours monté, contrôlé par useStageStore.commandeurOpen */}
          <Commandeur />
        </div>
      </ToastProvider>
    </SessionProvider>
  );
}
