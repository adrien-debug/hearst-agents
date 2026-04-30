"use client";

/**
 * PageHeader — header standardisé pour les pages standalone.
 *
 * Source unique pour les <h1> de toutes les pages /reports, /missions,
 * /runs, /assets, /apps, /archive, /notifications, /settings/* et leurs
 * deep-links. Visuel cohérent : t-28 font-light + tracking-tight, optionnel
 * subtitle, breadcrumb, slot actions à droite, ou CTA "back" côté gauche.
 *
 * Tokens uniquement (CLAUDE.md §1).
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { Breadcrumb, type Crumb } from "./Breadcrumb";

interface BackLink {
  label: string;
  href: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: Crumb[];
  actions?: ReactNode;
  back?: BackLink;
}

const ChevronLeftIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  back,
}: PageHeaderProps) {
  return (
    <header
      className="flex flex-col px-12 py-8 border-b border-[var(--border-shell)]"
      style={{ gap: "var(--space-3)" }}
    >
      {/* Top row : breadcrumb OU back link */}
      {back ? (
        <Link
          href={back.href}
          className="inline-flex items-center gap-2 t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors w-fit"
        >
          <ChevronLeftIcon />
          <span>{back.label}</span>
        </Link>
      ) : breadcrumb && breadcrumb.length > 0 ? (
        <Breadcrumb trail={breadcrumb} />
      ) : null}

      {/* Title row */}
      <div
        className="flex items-start justify-between"
        style={{ gap: "var(--space-4)" }}
      >
        <div className="flex flex-col min-w-0" style={{ gap: "var(--space-2)" }}>
          <h1 className="t-28 font-light tracking-tight text-[var(--text)]">
            {title}
          </h1>
          {subtitle && (
            <p className="t-13 font-light text-[var(--text-muted)]">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center shrink-0" style={{ gap: "var(--space-2)" }}>{actions}</div>}
      </div>
    </header>
  );
}
