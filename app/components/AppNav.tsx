"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

/**
 * AppNav — Chat is the operating system. Legacy routes exist but
 * are collapsed behind a subtle expansion affordance.
 */

const LEGACY_ITEMS = [
  { href: "/inbox", icon: "inbox", label: "Messages" },
  { href: "/calendar", icon: "calendar", label: "Agenda" },
  { href: "/files", icon: "files", label: "Fichiers" },
  { href: "/tasks", icon: "tasks", label: "Tâches" },
] as const;

const ICONS: Record<string, React.ReactNode> = {
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
  files: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.204-.107-.397.165-.71.505-.78.929l-.15.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export default function AppNav() {
  const pathname = usePathname();
  const [legacyExpanded, setLegacyExpanded] = useState(false);
  const legacyActive = LEGACY_ITEMS.some((item) => pathname.startsWith(item.href));

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-full w-[60px] flex-col items-center border-r border-zinc-800/50 bg-zinc-950 py-4 md:flex">
      <Link href="/" className="mb-6 flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 transition-all duration-200 hover:bg-zinc-700">
        <span className="text-xs font-bold text-white">H</span>
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1">
        {/* Chat — sole primary entry point */}
        <Link
          href="/"
          title="Chat"
          className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
            pathname === "/"
              ? "bg-cyan-500/10 text-cyan-400"
              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 active:scale-[0.98]"
          }`}
        >
          {pathname === "/" && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-cyan-400" />
          )}
          {ICONS.chat}
        </Link>

        {/* Legacy routes — collapsed, expandable */}
        <button
          onClick={() => setLegacyExpanded((v) => !v)}
          title="Surfaces classiques"
          className={`relative mt-3 flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ${
            legacyActive && !legacyExpanded
              ? "text-zinc-400"
              : "text-zinc-700 hover:text-zinc-500"
          }`}
        >
          {legacyActive && !legacyExpanded && (
            <span className="absolute left-0 top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-r-full bg-zinc-600" />
          )}
          {ICONS.more}
        </button>

        <div
          className={`flex flex-col items-center gap-1 overflow-hidden transition-all duration-300 ${
            legacyExpanded ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          {LEGACY_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 ${
                  active
                    ? "bg-zinc-800/50 text-zinc-400"
                    : "text-zinc-700 hover:bg-zinc-800/30 hover:text-zinc-500 active:scale-[0.98]"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-r-full bg-zinc-600" />
                )}
                {ICONS[item.icon]}
              </Link>
            );
          })}
        </div>
      </nav>

      <Link
        href="/admin"
        title="Administration"
        className={`mt-auto flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
          pathname.startsWith("/admin")
            ? "bg-zinc-800 text-white"
            : "text-zinc-600 hover:bg-zinc-800/50 hover:text-zinc-400 active:scale-[0.98]"
        }`}
      >
        {ICONS.admin}
      </Link>
    </aside>
  );
}
