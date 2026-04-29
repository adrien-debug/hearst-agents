import type { StageKind } from "../topology";

interface IconProps {
  kind: StageKind;
  className?: string;
}

const ICON_PATHS: Record<StageKind, React.ReactNode> = {
  entry: (
    <>
      <path d="M3 12h13" />
      <path d="M11 7l5 5-5 5" />
      <path d="M21 5v14" />
    </>
  ),
  router: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M8 6h2a4 4 0 0 1 4 4v0" />
      <path d="M8 18h2a4 4 0 0 0 4-4v0" />
    </>
  ),
  gate: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  intent: (
    <>
      <path d="M20.5 13.5l-7 7a2 2 0 0 1-2.83 0L3 13V3h10l7.5 7.5a2 2 0 0 1 0 2.83z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  tools: (
    <>
      <path d="M14 7a4 4 0 1 1-7 4l-4 4a2 2 0 0 0 3 3l4-4a4 4 0 0 1 4-7z" />
      <circle cx="14" cy="7" r="1.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-3.8-3.8" />
    </>
  ),
  llm: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
    </>
  ),
  agent: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  complete: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
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
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[kind]}
    </svg>
  );
}
