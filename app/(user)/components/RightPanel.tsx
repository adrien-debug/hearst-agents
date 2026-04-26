"use client";

/**
 * RightPanel — Responsive container with drawer behavior on mobile
 *
 * Desktop (>= md): Fixed sidebar inline with layout
 * Mobile (< md): Full-height drawer with toggle button and overlay
 */

import { useState, useEffect } from "react";
import { RightPanelContent } from "./RightPanelContent";
import { GhostIconMenu, GhostIconX } from "./ghost-icons";

export function RightPanel() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile breakpoint (md = 768px)
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <>
      {/* Mobile: Drawer with toggle */}
      {isMobile && (
        <>
          {/* Floating toggle button */}
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className={`fixed bottom-4 right-4 z-50 w-12 h-12 rounded-sm flex items-center justify-center border transition-all ${
              isMobileOpen
                ? "bg-[var(--bg-elev)] text-[var(--danger)] border-[var(--danger)]"
                : "bg-[var(--cykan)] text-black border-[var(--line-strong)]"
            }`}
            aria-label={isMobileOpen ? "Fermer le panneau" : "Ouvrir le panneau runtime"}
          >
            {isMobileOpen ? <GhostIconX className="w-5 h-5" /> : <GhostIconMenu className="w-5 h-5" />}
          </button>

          {isMobileOpen && (
            <div className="ghost-overlay-backdrop z-40" onClick={() => setIsMobileOpen(false)} aria-hidden />
          )}

          {/* Drawer panel */}
          <div
            className={`fixed top-0 right-0 h-full z-50 transform transition-transform duration-300 ease-out ${
              isMobileOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <RightPanelContent onClose={() => setIsMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Desktop: Inline panel (visibility controlled by layout.tsx) */}
      {!isMobile && <RightPanelContent />}
    </>
  );
}
