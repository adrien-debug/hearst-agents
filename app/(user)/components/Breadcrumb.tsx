"use client";

import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
  accent?: boolean;
}

interface BreadcrumbProps {
  trail: Crumb[];
  className?: string;
}

export function Breadcrumb({ trail, className }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-2 t-9 font-mono uppercase tracking-marquee ${className ?? ""}`}
    >
      {trail.map((crumb, idx) => {
        const isLast = idx === trail.length - 1;
        const baseClass = isLast
          ? `${crumb.accent ? "text-[var(--cykan)] halo-cyan-sm" : "text-[var(--text)]"}`
          : "text-[var(--text-faint)] hover:text-[var(--text)] transition-colors";
        return (
          <span key={`${crumb.label}-${idx}`} className="flex items-center gap-2">
            {crumb.href && !isLast ? (
              <Link href={crumb.href} className={baseClass}>
                {crumb.label}
              </Link>
            ) : (
              <span className={baseClass}>{crumb.label}</span>
            )}
            {!isLast && (
              <span className="text-[var(--text-ghost)]" aria-hidden>
                ›
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
