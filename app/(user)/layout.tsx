"use client";

import { SessionProvider } from "next-auth/react";
import AppNav from "../components/AppNav";
import ControlPanel from "../components/ControlPanel";
import GlobalChat from "../components/GlobalChat";
import { MissionProvider } from "../lib/missions";
import { ChatProvider } from "../lib/chat-context";
import SurfaceTracker from "../components/SurfaceTracker";

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <MissionProvider>
        <ChatProvider>
          <div className="flex h-screen overflow-hidden">
            <AppNav />
            <main className="flex min-w-0 flex-1 md:ml-[60px]">
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
                <GlobalChat />
              </div>
              <ControlPanel />
            </main>
          </div>
          <SurfaceTracker />
        </ChatProvider>
      </MissionProvider>
    </SessionProvider>
  );
}
