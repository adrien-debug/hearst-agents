"use client";

import { SessionProvider } from "next-auth/react";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { TopBar } from "./components/TopBar";
import { ToastContainer } from "@/app/components/ToastContainer";
import { useToast } from "@/app/hooks/use-toast";
function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, dismiss } = useToast();
  return (
    <>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <div
          data-theme="light"
          className="h-screen w-full flex overflow-hidden"
          style={{ background: "var(--bg-center)", color: "var(--text)" }}
        >
          <div className="hidden md:block">
            <LeftPanel />
          </div>

          {/* Main content: TopBar puis surface */}
          <main className="flex-1 flex flex-col min-w-0 min-h-0 relative">
            <TopBar />
            {children}
          </main>

          {/* RightPanel: drawer on mobile, fixed width on desktop */}
          <RightPanel />
        </div>
      </ToastProvider>
    </SessionProvider>
  );
}
