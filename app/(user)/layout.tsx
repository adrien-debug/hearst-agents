"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AppNav from "../components/AppNav";
import RightPanel from "../components/right-panel/RightPanel";
import GlobalChat from "../components/GlobalChat";
import { MissionProvider } from "../lib/missions";
import { ChatProvider } from "../lib/chat-context";
import { ChatActivityProvider } from "../lib/chat-activity";
import { RunStreamProvider } from "../lib/run-stream-context";
import { HaloRuntimeProvider } from "../lib/halo-runtime-context";
import { SurfaceProvider } from "@/app/hooks/use-surface";
import { SidebarProvider } from "@/app/hooks/use-sidebar";
import SurfaceTracker from "../components/SurfaceTracker";
import { TopContextBar } from "../components/system/TopContextBar";
import { SidebarMargin } from "../components/SidebarMargin";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
      </div>
    );
  }

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
      <MissionProvider>
        <ChatProvider>
          <ChatActivityProvider>
            <RunStreamProvider>
            <HaloRuntimeProvider>
            <SidebarProvider>
            <SurfaceProvider>
            <div className="flex h-screen overflow-hidden">
              <AppNav />
              <SidebarMargin>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <TopContextBar />
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    {children}
                  </div>
                  <GlobalChat />
                </div>
                <RightPanel />
              </SidebarMargin>
            </div>
            <SurfaceTracker />
            </SurfaceProvider>
            </SidebarProvider>
            </HaloRuntimeProvider>
            </RunStreamProvider>
          </ChatActivityProvider>
        </ChatProvider>
      </MissionProvider>
    </AuthGate>
    </SessionProvider>
  );
}
