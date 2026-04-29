"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { NAV_SECTIONS, type NavItem } from "./nav";

interface Props {
  userLabel: string;
  userInitial: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg
      className="w-(--space-4) h-(--space-4) shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, "") || "/";
}

function isActive(pathname: string, item: NavItem): boolean {
  const n = normalizePath(pathname ?? "");
  if (item.href === "/admin") return n === "/admin";
  return n === item.href || n.startsWith(`${item.href}/`);
}

export default function AdminSidebar({
  userLabel,
  userInitial,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col h-full bg-bg-elev border-r border-line shrink-0 w-full">
      <div
        className={[
          "flex items-center gap-(--space-3) border-b border-line pt-(--space-5) pb-(--space-4)",
          collapsed ? "justify-center px-(--space-2)" : "px-(--space-5)",
        ].join(" ")}
      >
        <span className="size-(--space-6) rounded-(--radius-sm) bg-(--cykan-bg-active) border border-(--cykan)/40 flex items-center justify-center shrink-0">
          <span className="t-9 font-mono uppercase tracking-(--tracking-stretch) text-(--cykan)">H</span>
        </span>
        {!collapsed && (
          <div className="flex flex-col leading-tight min-w-0">
            <span className="t-13 font-medium text-text truncate">Hearst OS</span>
            <span className="t-9 font-mono uppercase tracking-(--tracking-stretch) text-(--cykan)">Admin</span>
          </div>
        )}
      </div>

      <nav
        className={[
          "flex-1 overflow-y-auto py-(--space-4) flex flex-col gap-(--space-5)",
          collapsed ? "px-(--space-2)" : "px-(--space-3)",
        ].join(" ")}
      >
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="flex flex-col gap-(--space-1)">
            {!collapsed && (
              <p className="px-(--space-3) t-9 font-mono uppercase tracking-(--tracking-stretch) text-text-faint mb-(--space-1)">
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const active = isActive(pathname ?? "", item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={[
                    "group flex items-center rounded-(--radius-sm) transition-colors duration-(--duration-fast) ease-(--ease-standard)",
                    collapsed
                      ? "justify-center size-(--space-10)"
                      : "gap-(--space-3) px-(--space-3) py-(--space-2)",
                    active
                      ? "bg-(--cykan-bg-active) text-text"
                      : "text-text-muted hover:text-text hover:bg-(--surface-1)",
                  ].join(" ")}
                >
                  <span
                    className={
                      active
                        ? "text-(--cykan)"
                        : "text-text-faint group-hover:text-text-muted transition-colors"
                    }
                  >
                    <NavIcon d={item.iconPath} />
                  </span>
                  {!collapsed && (
                    <span className="t-12 truncate">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div
        className={[
          "shrink-0 border-t border-line py-(--space-3) flex flex-col gap-(--space-2)",
          collapsed ? "px-(--space-2)" : "px-(--space-3)",
        ].join(" ")}
      >
        <Link
          href="/"
          onClick={onNavigate}
          title={collapsed ? "Retour au workspace" : undefined}
          className={[
            "flex items-center rounded-(--radius-sm) text-text-muted hover:text-text hover:bg-(--surface-1) transition-colors duration-(--duration-fast) ease-(--ease-standard)",
            collapsed
              ? "justify-center size-(--space-10)"
              : "gap-(--space-3) px-(--space-3) py-(--space-2)",
          ].join(" ")}
        >
          <span className="text-text-faint transition-colors">
            <NavIcon d="M19 12H5M12 19l-7-7 7-7" />
          </span>
          {!collapsed && <span className="t-12">Retour au workspace</span>}
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? `${userLabel} — Se déconnecter` : "Se déconnecter"}
          className={[
            "flex items-center rounded-(--radius-sm) hover:bg-(--surface-1) transition-colors duration-(--duration-fast) ease-(--ease-standard) group",
            collapsed
              ? "justify-center size-(--space-10)"
              : "w-full gap-(--space-3) px-(--space-3) py-(--space-2)",
          ].join(" ")}
        >
          <span className="size-(--space-6) rounded-(--radius-pill) bg-(--surface-2) border border-line-strong flex items-center justify-center shrink-0">
            <span className="t-11 font-medium text-text-muted group-hover:text-(--danger) transition-colors">
              {userInitial}
            </span>
          </span>
          {!collapsed && (
            <span className="flex-1 text-left t-12 font-light text-text-muted group-hover:text-(--danger) transition-colors truncate">
              {userLabel}
            </span>
          )}
        </button>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={collapsed ? "Étendre la sidebar" : "Réduire la sidebar"}
            className="flex items-center justify-center text-text-ghost hover:text-(--cykan) transition-colors py-(--space-1)"
          >
            <NavIcon d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
          </button>
        )}
      </div>
    </aside>
  );
}
