"use client";

/**
 * AdminSidebar — Navigation admin minimaliste
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavSection {
  title: string;
  links: { href: string; label: string }[];
}

const SECTIONS: NavSection[] = [
  {
    title: "Overview",
    links: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/reports", label: "Reports" },
    ],
  },
  {
    title: "Orchestration",
    links: [
      { href: "/admin/agents", label: "Agents" },
      { href: "/admin/runs", label: "Runs" },
      { href: "/admin/workflows", label: "Workflows" },
      { href: "/admin/scheduler", label: "Scheduler" },
    ],
  },
  {
    title: "Knowledge",
    links: [
      { href: "/admin/datasets", label: "Datasets" },
      { href: "/admin/tools", label: "Tools" },
      { href: "/admin/skills", label: "Skills" },
    ],
  },
  {
    title: "System",
    links: [
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/health", label: "Health" },
      { href: "/admin/audit", label: "Audit Log" },
      { href: "/admin/signals", label: "Signals" },
      { href: "/admin/changes", label: "Changelog" },
      { href: "/admin/architecture", label: "Architecture" },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 fixed left-0 top-0 bottom-0 bg-rail border-r border-white/[0.06] overflow-y-auto">
      <div className="p-4 border-b border-white/[0.06]">
        <span className="text-lg font-light text-white/90">Hearst</span>
        <span className="ml-2 text-xs text-white/40">Admin</span>
      </div>
      <nav className="p-2 space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 mb-1 text-[10px] uppercase tracking-wider text-white/30 font-medium">
              {section.title}
            </p>
            {section.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  block px-3 py-1.5 rounded-lg text-sm transition-colors
                  ${pathname === link.href || (link.href !== "/admin" && pathname?.startsWith(link.href + "/"))
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
