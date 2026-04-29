"use client";

import { useState } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";

interface Props {
  children: React.ReactNode;
  userLabel: string;
  userInitial: string;
  env: string;
}

const STORAGE_KEY = "admin-sidebar-collapsed";

export default function AdminShell({ children, userLabel, userInitial, env }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Initialise depuis localStorage côté client (iife synchrone) pour éviter
  // le flash expanded→collapsed au premier render.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });

  const onToggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // localStorage unavailable — keep state in memory.
      }
      return next;
    });
  };

  const isCollapsed = collapsed;

  return (
    <div data-theme="light" className="flex h-screen w-screen bg-bg text-text overflow-hidden">
      {/* Desktop sidebar — width follows the persisted collapsed state. */}
      <div
        className="hidden md:flex shrink-0 transition-[width] duration-(--duration-base) ease-(--ease-standard)"
        style={{
          width: isCollapsed
            ? "var(--width-admin-sidebar-collapsed)"
            : "var(--width-admin-sidebar)",
        }}
      >
        <AdminSidebar
          userLabel={userLabel}
          userInitial={userInitial}
          collapsed={isCollapsed}
          onToggleCollapsed={onToggleCollapsed}
        />
      </div>

      {/* Mobile drawer — always full-width sidebar, no collapse toggle. */}
      {drawerOpen && (
        <>
          <div
            aria-hidden
            className="md:hidden fixed inset-0 z-40 bg-[var(--overlay-scrim)]"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="md:hidden fixed inset-y-0 left-0 w-(--width-admin-sidebar) z-50">
            <AdminSidebar
              userLabel={userLabel}
              userInitial={userInitial}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AdminTopbar onMenuClick={() => setDrawerOpen(true)} env={env} />
        <main className="flex-1 min-h-0 min-w-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
