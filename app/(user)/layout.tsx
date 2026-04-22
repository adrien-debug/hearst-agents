"use client";

/**
 * User Layout v5 — Strict coherence
 *
 * - Main: full width minus right panel
 * - RightPanel: 240px fixed
 * - Spacing: 4px base everywhere
 */

import { SessionProvider } from "next-auth/react";
import RightPanel from "../components/layout/RightPanel";
import ChatContainer from "../components/layout/ChatContainer";

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="flex h-screen w-full bg-black text-white overflow-hidden">
        {/* Main area — takes remaining space */}
        <main className="flex flex-col flex-1 min-w-0 mr-0 xl:mr-[240px]">
          {/* Page content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {children}
          </div>

          {/* Chat input */}
          <ChatContainer />
        </main>

        {/* Right panel — fixed */}
        <RightPanel />
      </div>
    </SessionProvider>
  );
}
