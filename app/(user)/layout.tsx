"use client";

import { SessionProvider } from "next-auth/react";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div
        className="h-screen w-full text-white flex overflow-hidden"
        style={{
          background: "var(--bg)",
        }}
      >
        <LeftPanel />
        <main className="flex-1 flex flex-col min-w-0 relative">{children}</main>
        <RightPanel />
      </div>
    </SessionProvider>
  );
}
