"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  {
    title: null,
    links: [
      { href: "/", label: "Dashboard" },
    ],
  },
  {
    title: "Agents",
    links: [
      { href: "/agents", label: "Tous les agents" },
      { href: "/runs", label: "Runs & traces" },
    ],
  },
  {
    title: "Composants",
    links: [
      { href: "/skills", label: "Skills" },
      { href: "/tools", label: "Tools" },
    ],
  },
  {
    title: "Orchestration",
    links: [
      { href: "/workflows", label: "Workflows" },
      { href: "/datasets", label: "Datasets" },
    ],
  },
  {
    title: "Opérations",
    links: [
      { href: "/reports", label: "Reports" },
    ],
  },
  {
    title: "Décisions",
    links: [
      { href: "/signals", label: "Signaux" },
      { href: "/changes", label: "Historique" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-56 flex-col border-r border-zinc-800 bg-zinc-950 px-4 py-6">
      <Link href="/" className="mb-8 flex flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-[0.4em] text-zinc-500">
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
                  l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
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

      <p className="mt-auto text-[10px] text-zinc-600">v1.0.0</p>
    </aside>
  );
}
