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
    <aside
      className="w-56 fixed left-0 top-0 bottom-0 overflow-y-auto border-r border-[var(--line)]"
      style={{ background: "var(--rail)" }}
    >
      <div className="p-4 border-b border-[var(--line)]">
        <span className="text-lg font-light text-[var(--text)]">Hearst</span>
        <span className="ml-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Admin</span>
      </div>
      <nav className="p-2 space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 mb-1 ghost-meta-label">{section.title}</p>
            {section.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  block px-3 py-2 text-sm transition-colors border-l-2 rounded-none
                  ${pathname === link.href || (link.href !== "/admin" && pathname?.startsWith(link.href + "/"))
                    ? "border-[var(--cykan)] text-[var(--text)] bg-[var(--bg-soft)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-soft)]"
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
