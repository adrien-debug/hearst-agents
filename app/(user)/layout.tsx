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
import { SidebarProvider } from "@/app/hooks/use-sidebar";
import SurfaceTracker from "../components/SurfaceTracker";
import { TopContextBar } from "../components/system/TopContextBar";
import { SidebarMargin } from "../components/SidebarMargin";

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
            <SidebarProvider>
            <SurfaceProvider>
            <div className="flex h-screen overflow-hidden">
              <AppNav />
              <SidebarMargin>
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  <TopContextBar />
                  <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
                  <GlobalChat />
                </div>
                <RightPanel />
              </SidebarMargin>
            </div>
            <SurfaceTracker />
            </SurfaceProvider>
            </SidebarProvider>
            </RunStreamProvider>
          </ChatActivityProvider>
        </ChatProvider>
      </MissionProvider>
    </SessionProvider>
  );
}
