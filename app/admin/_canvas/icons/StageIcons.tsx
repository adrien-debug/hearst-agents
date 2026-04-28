import type { StageKind } from "../topology";

/**
 * Stage icons — 24×24 stroke-based SVGs indexed by `StageKind`. Keep them
 * minimal: 1.5px stroke, no fill, line caps round.
 *
 * The SVG owns its className so the caller controls sizing directly via
 * `size-(--space-*)` etc. (the previous wrapper-span layout silently
 * collapsed the SVG to 0×0 in some scaled contexts).
 */

interface IconProps {
  kind: StageKind;
  className?: string;
}

const ICON_PATHS: Record<StageKind, React.ReactNode> = {
  // entry — arrow flowing in
  entry: (
    <>
      <path d="M5 8h6a3 3 0 0 1 3 3v8" />
      <path d="M11 16l3 3 3-3" />
    </>
  ),
  // router — git branch
  router: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M6 8v8" />
      <path d="M18 8v2a4 4 0 0 1-4 4H10" />
    </>
  ),
  // gate — shield
  gate: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  // intent — tag
  intent: (
    <>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </>
  ),
  // check — checked clipboard
  check: (
    <>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  // tools — wrench
  tools: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  // search — magnifying glass
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  // llm — cpu / brain core
  llm: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2v3" />
      <path d="M15 2v3" />
      <path d="M9 19v3" />
      <path d="M15 19v3" />
      <path d="M2 9h3" />
      <path d="M2 15h3" />
      <path d="M19 9h3" />
      <path d="M19 15h3" />
    </>
  ),
  // agent — user circle
  agent: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  // complete — check in circle
  complete: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </>
  ),
};

export default function StageIcon({ kind, className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[kind]}
    </svg>
  );
}
