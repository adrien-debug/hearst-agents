"use client";

import { SessionProvider } from "next-auth/react";
import AppNav from "../components/AppNav";
import RightPanel from "../components/right-panel/RightPanel";
import GlobalChat from "../components/GlobalChat";
import { MissionProvider } from "../lib/missions";
import { ChatProvider } from "../lib/chat-context";
import { ChatActivityProvider } from "../lib/chat-activity";
import { RunStreamProvider } from "../lib/run-stream-context";
import { SurfaceProvider } from "@/app/hooks/use-surface";
import SurfaceTracker from "../components/SurfaceTracker";
import { TopContextBar } from "../components/system/TopContextBar";

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <MissionProvider>
        <ChatProvider>
          <ChatActivityProvider>
            <RunStreamProvider>
            <SurfaceProvider>
            <div className="flex h-screen overflow-hidden">
              <AppNav />
              <main className="flex min-w-0 flex-1 md:ml-[60px]">
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  <TopContextBar />
                  <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
                  <GlobalChat />
                </div>
                <RightPanel />
              </main>
            </div>
            <SurfaceTracker />
            </SurfaceProvider>
            </RunStreamProvider>
          </ChatActivityProvider>
        </ChatProvider>
      </MissionProvider>
    </SessionProvider>
  );
}
