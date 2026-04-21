"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  {
    title: null,
    links: [
      { href: "/admin", label: "Dashboard" },
    ],
  },
  {
    title: "Agents",
    links: [
      { href: "/admin/agents", label: "Tous les agents" },
      { href: "/admin/runs", label: "Runs & traces" },
    ],
  },
  {
    title: "Composants",
    links: [
      { href: "/admin/skills", label: "Skills" },
      { href: "/admin/tools", label: "Tools" },
    ],
  },
  {
    title: "Orchestration",
    links: [
      { href: "/admin/workflows", label: "Workflows" },
      { href: "/admin/datasets", label: "Datasets" },
    ],
  },
  {
    title: "Opérations",
    links: [
      { href: "/admin/reports", label: "Reports" },
    ],
  },
  {
    title: "Décisions",
    links: [
      { href: "/admin/signals", label: "Signaux" },
      { href: "/admin/changes", label: "Historique" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-56 flex-col border-r border-zinc-800 bg-zinc-950 px-4 py-6">
      <Link href="/" className="mb-8 flex flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-[0.4em] text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">
          Hearst
        </span>
        <span className="text-lg font-semibold tracking-tight text-white">
          Agents
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-4">
        {sections.map((section, si) => (
          <div key={si}>
            {section.title && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {section.title}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {section.links.map((l) => {
                const active =
                  l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <Link href="/" className="mt-auto mb-2 rounded-lg px-3 py-2 text-xs text-zinc-600 transition-colors hover:bg-zinc-900 hover:text-zinc-400">
        ← Retour à l&apos;app
      </Link>
      <p className="text-[10px] text-zinc-600">v1.0.0</p>
    </aside>
  );
}
