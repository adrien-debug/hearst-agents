"use client";

import { usePathname } from "next/navigation";
import AdminTopbarKpis from "./AdminTopbarKpis";
import { activeItem } from "./nav";

interface Props {
  onMenuClick: () => void;
  env: string;
}

export default function AdminTopbar({ onMenuClick, env }: Props) {
  const pathname = usePathname();
  const current = activeItem(pathname ?? "");

  return (
    <header className="shrink-0 h-(--space-12) flex items-center gap-(--space-3) px-(--space-5) border-b border-line bg-surface relative z-10">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Ouvrir la navigation"
        className="md:hidden size-(--space-8) flex items-center justify-center rounded-(--radius-sm) text-text-muted hover:text-text hover:bg-(--surface-1) transition-colors"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      <nav aria-label="Fil d'Ariane" className="flex items-center gap-(--space-2) min-w-0">
        <span className="t-10 font-mono uppercase tracking-(--tracking-stretch) text-text-faint">
          Admin
        </span>
        {current && (
          <>
            <span className="t-10 text-text-faint">/</span>
            <span className="t-12 font-medium text-text truncate">{current.label}</span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-(--space-5)">
        <AdminTopbarKpis />
        <span className="t-9 font-mono uppercase tracking-(--tracking-stretch) text-(--cykan) px-(--space-2) py-(--space-1) rounded-(--radius-xs) border border-(--cykan)/30 bg-(--cykan-bg-active)">
          {env}
        </span>
      </div>
    </header>
  );
}
