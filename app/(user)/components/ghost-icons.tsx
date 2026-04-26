"use client";

import type { ReactNode, SVGProps } from "react";

const stroke = 1.25;

function SvgBox(props: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  const { children, className, ...rest } = props;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export function GhostIconX(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </SvgBox>
  );
}

export function GhostIconChevronLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M15 18l-6-6 6-6" />
    </SvgBox>
  );
}

export function GhostIconChevronRight(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M9 18l6-6-6-6" />
    </SvgBox>
  );
}

export function GhostIconChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M6 9l6 6 6-6" />
    </SvgBox>
  );
}

export function GhostIconLogOut(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </SvgBox>
  );
}

export function GhostIconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M12 5v14M5 12h14" />
    </SvgBox>
  );
}

export function GhostIconPlay(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <polygon points="8 5 19 12 8 19 8 5" />
    </SvgBox>
  );
}

export function GhostIconPencil(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </SvgBox>
  );
}

export function GhostIconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" />
    </SvgBox>
  );
}

export function GhostIconAlert(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </SvgBox>
  );
}

export function GhostIconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M20 6L9 17l-5-5" />
    </SvgBox>
  );
}

export function GhostIconMinus(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M5 12h14" />
    </SvgBox>
  );
}

export function GhostIconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </SvgBox>
  );
}

export function GhostIconDownload(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </SvgBox>
  );
}

export function GhostIconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </SvgBox>
  );
}

export function GhostIconInfo(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </SvgBox>
  );
}

export function GhostIconLayers(props: SVGProps<SVGSVGElement>) {
  return (
    <SvgBox {...props}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </SvgBox>
  );
}

/** Service icon — renders official SVG logo when available, fallback to mono text ref. */
export function ServiceIdGlyph({
  id,
  icon,
  size = "md",
  className = "",
}: {
  id: string;
  icon?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim =
    size === "sm" ? "w-5 h-5" : size === "lg" ? "w-8 h-8" : "w-6 h-6";

  if (icon) {
    return (
      <img
        src={icon}
        alt={id}
        title={id}
        className={`${dim} object-contain shrink-0 ${className}`}
        style={{ opacity: 0.85 }}
      />
    );
  }

  // Fallback: mono text glyph
  const raw = id.replace(/[^a-z0-9]/gi, "");
  const label = raw.slice(0, 4).toUpperCase() || "SRC";
  const sz =
    size === "sm"
      ? "text-[9px] min-w-[2rem] px-1.5 py-0.5"
      : size === "lg"
        ? "text-[11px] min-w-[3rem] px-2.5 py-2"
        : "text-[10px] min-w-[2.25rem] px-2 py-1";
  return (
    <span
      className={`inline-flex items-center justify-center border font-mono uppercase tracking-[0.12em] text-[var(--text-muted)] border-[var(--line-strong)] bg-transparent shrink-0 ${sz} ${className}`}
      title={`ID_REF: ${id}`}
    >
      {label}
    </span>
  );
}

/** Thin category glyph for section headers (stroke only). */
export function CategoryRailIcon({ categoryId, className }: { categoryId: string; className?: string }) {
  const c = categoryId.toLowerCase();
  const common = `${className ?? ""} text-[var(--text-muted)]`;
  if (c === "communication")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeWidth={stroke} />
      </svg>
    );
  if (c === "productivity")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeWidth={stroke} />
      </svg>
    );
  if (c === "storage")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" strokeWidth={stroke} />
      </svg>
    );
  if (c === "project")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M3 3v18h18M7 16l4-4 4 4 6-6" strokeWidth={stroke} />
      </svg>
    );
  if (c === "crm")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeWidth={stroke} />
      </svg>
    );
  if (c === "dev")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" strokeWidth={stroke} />
      </svg>
    );
  if (c === "design")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-6-6a2 2 0 00-3 3l6 6M12 5l-2-2" strokeWidth={stroke} />
      </svg>
    );
  if (c === "finance")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeWidth={stroke} />
      </svg>
    );
  if (c === "support")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M3 18v-6a9 9 0 0118 0v6M21 19a2 2 0 01-2 2h-2a2 2 0 01-2-2v-3M7 19a2 2 0 002 2h2a2 2 0 002-2v-3" strokeWidth={stroke} />
      </svg>
    );
  if (c === "analytics")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M18 20V10M12 20V4M6 20v-6" strokeWidth={stroke} />
      </svg>
    );
  if (c === "automation")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeWidth={stroke} />
      </svg>
    );
  if (c === "commerce")
    return (
      <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <circle cx="9" cy="21" r="1" strokeWidth={stroke} />
        <circle cx="20" cy="21" r="1" strokeWidth={stroke} />
        <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" strokeWidth={stroke} />
      </svg>
    );
  return (
    <svg className={common} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="1" strokeWidth={stroke} />
      <path d="M9 9h6M9 15h6" strokeWidth={stroke} />
    </svg>
  );
}
