"use client";

import { SessionProvider } from "next-auth/react";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
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
          className="h-screen w-full text-white flex overflow-hidden"
          style={{ background: "var(--bg)" }}
        >
          {/* LeftPanel: conversations — hidden on mobile */}
          <div className="hidden md:block">
            <LeftPanel />
          </div>

          {/* Main content: always visible, full width on mobile */}
          <main className="flex-1 flex flex-col min-w-0 relative">{children}</main>

          {/* RightPanel: drawer on mobile, fixed width on desktop */}
          <RightPanel />
        </div>
      </ToastProvider>
    </SessionProvider>
  );
}
