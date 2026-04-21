"use client";

import { useSidebarOptional } from "@/app/hooks/use-sidebar";
import type { ReactNode } from "react";

export function SidebarMargin({ children }: { children: ReactNode }) {
  const sidebar = useSidebarOptional();
  const isCollapsed = sidebar?.isCollapsed ?? false;

  return (
    <main
      className="flex min-w-0 flex-1 transition-[margin-left] duration-300"
      style={{ marginLeft: `var(--sidebar-w)` }}
    >
      <style>{`
        :root { --sidebar-w: 0px; }
        @media (min-width: 768px) {
          :root { --sidebar-w: ${isCollapsed ? "60px" : "240px"}; }
        }
      `}</style>
      {children}
    </main>
  );
}
