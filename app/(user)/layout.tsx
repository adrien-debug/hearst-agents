"use client";

/**
 * User Layout v2 — Clean rebuild
 *
 * Structure: 72px rail | center + right panel | chat
 * State: Zustand (pas de Context Hell)
 */

import { SessionProvider } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AppNav from "../components/layout/AppNav";
import RightPanel from "../components/layout/RightPanel";
import ChatContainer from "../components/layout/ChatContainer";
import CenterStage from "../components/layout/CenterStage";

function AuthGate({ children }: { children: React.ReactNode }) {
  // Simplified auth - rely on middleware
  return <>{children}</>;
}

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AuthGate>
        <div className="flex h-screen overflow-hidden bg-black">
          {/* Left rail — 72px fixed */}
          <AppNav />

          {/* Center column */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ml-[72px]">
            {/* Main content area */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>

            {/* Chat container */}
            <ChatContainer />
          </div>

          {/* Right rail — 200px */}
          <RightPanel />
        </div>
      </AuthGate>
    </SessionProvider>
  );
}
