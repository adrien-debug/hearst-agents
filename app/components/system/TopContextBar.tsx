"use client";

const GHOST_SVG_VIEWBOX = "560 455 155 170";
const GHOST_SVG_PATHS = (
  <>
    <polygon points="601.74 466.87 572.6 466.87 572.6 609.73 601.74 609.73 601.74 549.07 633.11 579.43 665.76 579.43 601.74 517.46 601.74 466.87" />
    <polygon points="672.72 466.87 672.72 528.12 644.63 500.93 611.98 500.93 672.72 559.72 672.72 609.73 701.86 609.73 701.86 466.87 672.72 466.87" />
  </>
);

export function TopContextBar() {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/5 px-6">
      <div className="flex items-center gap-6">
        <svg className="dotted-logo w-8 h-8" viewBox={GHOST_SVG_VIEWBOX}>
          {GHOST_SVG_PATHS}
        </svg>
        <span className="w-px h-5 bg-white/10" />
        <span className="text-[10px] font-bold tracking-[0.4em] uppercase text-white/40">
          Hearst OS
        </span>
      </div>
      <div className="flex items-center gap-4">
        <button className="icon-container">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </button>
        <button className="icon-container">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>
        </button>
      </div>
    </div>
  );
}
