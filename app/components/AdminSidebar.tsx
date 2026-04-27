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
    ],
  },
  {
    title: "Orchestration",
    links: [
      { href: "/admin/agents", label: "Agents" },
      { href: "/admin/runs", label: "Runs" },
      { href: "/admin/workflows", label: "Workflows" },
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
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-56 fixed left-0 top-0 bottom-0 overflow-y-auto border-r border-white/[0.06] bg-gradient-to-b from-[var(--mat-050)] via-[var(--mat-300)] to-[var(--mat-050)]"
    >
      <div className="p-4 border-b border-white/[0.06] bg-gradient-to-r from-white/[0.03] to-transparent">
        <span className="text-lg font-light text-white">Hearst</span>
        <span className="ml-2 t-10 font-mono uppercase tracking-[0.15em] text-white/40">Admin</span>
      </div>
      <nav className="p-2 space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 mb-1 t-10 font-mono uppercase tracking-[0.15em] text-white/30">{section.title}</p>
            {section.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  block px-3 py-2 text-sm transition-all border-l-2 rounded-none
                  ${pathname === link.href || (link.href !== "/admin" && pathname?.startsWith(link.href + "/"))
                    ? "border-[var(--cykan)] text-white bg-gradient-to-r from-white/[0.05] to-transparent"
                    : "border-transparent text-white/50 hover:text-white hover:bg-white/[0.03]"
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
