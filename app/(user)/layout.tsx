"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { LeftPanelShell } from "./components/LeftPanelShell";
import { RightPanel } from "./components/RightPanel";
import { Commandeur } from "./components/Commandeur";
import { ChatDock } from "./components/ChatDock";
import { PulseBar } from "./components/PulseBar";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { ServiceWorkerRegister } from "./components/ServiceWorkerRegister";
import { VoicePulse } from "./components/voice/VoicePulse";
import { ToastContainer } from "@/app/components/ToastContainer";
import { useToast } from "@/app/hooks/use-toast";
import { useGlobalHotkeys } from "@/app/hooks/use-global-hotkeys";
import { useVoiceStore } from "@/stores/voice";
import { useNotificationsStore } from "@/stores/notifications";
import { OAuthExpiryBanner } from "./components/OAuthExpiryBanner";
import { initWebVitals } from "@/app/web-vitals";

function BriefingAutoTrigger() {
  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 6 && h <= 10) {
      void fetch("/api/briefing", { method: "POST" }).catch(() => {});
    }
  }, []);
  return null;
}

function WebVitalsInit() {
  useEffect(() => {
    initWebVitals("/api/admin/vitals");
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
 * NotificationsHydrate — Hydrate le store notifications dès le mount du
 * layout pour que le badge NotificationBell affiche le compte initial sans
 * attendre l'ouverture du dropdown. Le polling/realtime continuera ensuite
 * via NotificationBell lui-même.
 */
function NotificationsHydrate() {
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications);
  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);
  return null;
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
      <WebVitalsInit />
      <NotificationsHydrate />
      <ServiceWorkerRegister />
      <ToastProvider>
        <div
          className="h-screen w-full flex flex-col overflow-hidden"
          style={{ background: "var(--bg)", color: "var(--text)" }}
        >
          {/* PulseBar — top fixed, état système + Cmd+K + voice + notifications */}
          <PulseBar />

          {/* Row 3 colonnes : TimelineRail / Stage / ContextRail
             Pivot UI 2026-05-01 : suppression de la coquille rounded-2xl autour
             du centre + des paddings/gaps extérieurs. Le centre devient un vrai
             canvas bord-à-bord ; la séparation avec les rails est portée par un
             simple 1px var(--border-shell), pas par une carte flottante avec
             shadow halo cykan. Mobile : pb-20 préservé pour MobileBottomNav. */}
          <div
            className="flex-1 flex min-h-0 w-full overflow-hidden pb-20 md:pb-0"
            style={{ background: "var(--bg)", color: "var(--text)" }}
          >
            <LeftPanelShell />

            <div
              className="flex-1 flex flex-col min-w-0 min-h-0 relative overflow-hidden border-l border-r border-[var(--border-subtle)]"
              style={{
                background: "var(--bg-elev)",
                color: "var(--text)",
                // Matière : highlight top 1px + side highlights pour donner
                // du relief sans chrome supplémentaire. Pivot 2026-05-01 v3.
                boxShadow:
                  "inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 1px 0 0 rgba(255, 255, 255, 0.04), inset -1px 0 0 rgba(255, 255, 255, 0.04)",
              }}
            >
              {/* Banner alerte tokens OAuth expirants — discret, dismissable */}
              <OAuthExpiryBanner />

              <main className="flex-1 flex flex-col min-w-0 min-h-0 relative">
                {children}
              </main>
              <ChatDock />
            </div>

            <RightPanel />
          </div>

          {/* Bottom nav mobile — < md uniquement, fixed bottom */}
          <MobileBottomNav />

          {/* Overlay global — toujours monté, contrôlé par useStageStore.commandeurOpen */}
          <Commandeur />

          {/* Pipeline WebRTC voix — vit au root, n'est rendu que si voiceActive */}
          <VoiceMount />
        </div>
      </ToastProvider>
    </SessionProvider>
  );
}
