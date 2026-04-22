"use client";

/**
 * User Layout v4 — Clean, minimal
 *
 * Just: content + optional right panel
 * No left rail — chat-first, no explicit navigation
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
      <div className="flex h-screen w-full overflow-hidden bg-black text-white">
        {/* Main content — takes full width minus right panel */}
        <main className="flex flex-1 flex-col min-w-0 mr-0 xl:mr-[200px]">
          {/* Page content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {children}
          </div>

          {/* Chat input — always at bottom */}
          <ChatContainer />
        </main>

        {/* Right rail — Trust panel (xl only) */}
        <RightPanel />
      </div>
    </SessionProvider>
  );
}
