"use client";

/**
 * AdminSidebar — Navigation admin minimaliste
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/runs", label: "Runs" },
  { href: "/admin/scheduler", label: "Scheduler" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/signals", label: "Signals" },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 fixed left-0 top-0 bottom-0 bg-rail border-r border-white/[0.06] overflow-y-auto">
      <div className="p-4 border-b border-white/[0.06]">
        <span className="text-lg font-light text-white/90">Hearst</span>
        <span className="ml-2 text-xs text-white/40">Admin</span>
      </div>
      <nav className="p-2">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`
              block px-3 py-2 rounded-lg text-sm transition-colors
              ${pathname === link.href || pathname?.startsWith(link.href + "/")
                ? "bg-white/10 text-white"
                : "text-white/60 hover:text-white hover:bg-white/5"
              }
            `}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
