"use client";

/**
 * LeftPanelShell — Container responsive autour de LeftPanel.
 *
 * Desktop (>= md): rendu inline classique, sidebar fixe.
 * Mobile (< md): drawer caché par défaut, ouvert via hamburger TopBar
 * (`useNavigationStore.toggleLeftDrawer`). Backdrop cliquable pour fermer.
 *
 * Mirroir du pattern utilisé par [RightPanel.tsx](./RightPanel.tsx). Z-index
 * cohérent : drawer 50, backdrop 40, sous le ToastContainer (z-60).
 */

import { useEffect, useState } from "react";
import { useNavigationStore } from "@/stores/navigation";
import { LeftPanel } from "./LeftPanel";

export function LeftPanelShell() {
  const [isMobile, setIsMobile] = useState(false);
  const leftDrawerOpen = useNavigationStore((s) => s.leftDrawerOpen);
  const closeLeftDrawer = useNavigationStore((s) => s.closeLeftDrawer);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Si on revient en desktop alors que le drawer était ouvert, on le ferme
  // pour éviter un état orphelin (drawer "ouvert" derrière la sidebar inline).
  useEffect(() => {
    if (!isMobile && leftDrawerOpen) {
      closeLeftDrawer();
    }
  }, [isMobile, leftDrawerOpen, closeLeftDrawer]);

  if (!isMobile) {
    return <LeftPanel />;
  }

  return (
    <>
      {leftDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={closeLeftDrawer}
          aria-hidden
        />
      )}
      <div
        className={`fixed top-0 left-0 h-full z-50 transform transition-transform duration-300 ease-out ${
          leftDrawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <LeftPanel />
      </div>
    </>
  );
}
