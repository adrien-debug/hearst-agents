"use client";

/**
 * User Layout v3 — Clean, no overlap
 *
 * Structure:
 * - Left: AppNav (72px fixed)
 * - Center: Content + Chat (flex column)
 * - Right: RightPanel (200px, xl only)
 */

import { SessionProvider } from "next-auth/react";
import AppNav from "../components/layout/AppNav";
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
        {/* Left rail — 72px */}
        <AppNav />

        {/* Center — takes remaining space */}
        <main className="flex flex-1 flex-col min-w-0 ml-[72px] mr-0 xl:mr-[200px]">
          {/* Page content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {children}
          </div>

          {/* Chat input — always at bottom */}
          <ChatContainer />
        </main>

        {/* Right rail — 200px, hidden below xl */}
        <RightPanel />
      </div>
    </SessionProvider>
  );
}
