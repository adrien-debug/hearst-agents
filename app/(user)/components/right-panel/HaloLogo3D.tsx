"use client";

/**
 * HaloLogo3D — signature 3D « Pulsar Gyroscope » de la PulseStrip.
 *
 * Concept graphique original (pas un rappel du logo Hearst) : un cœur
 * sphérique émissif au centre, encerclé de 3 anneaux orthogonaux qui
 * tournent indépendamment (running) ou se figent / se désalignent
 * (autres états). Particules orbitales en running, glitch + chromatic
 * aberration en error.
 *
 * Direction technique : @react-three/fiber + @react-three/drei +
 * postprocessing. Lazy-chargé via `next/dynamic({ ssr: false })` →
 * le bundle WebGL n'arrive qu'au montage du composant ; pendant le
 * chunk download, on rend le fallback statique 2D ci-dessous.
 *
 * Reduced-motion → fallback statique permanent (pas de canvas WebGL,
 * pas d'animation).
 */

import dynamic from "next/dynamic";
import { useId, useSyncExternalStore } from "react";

type HaloState = "idle" | "running" | "awaiting" | "error";

interface HaloLogo3DProps {
  size?: number;
  state?: HaloState;
}

// Bundle three+r3f+drei lazy-chargé : ne sort pas du chunk initial.
const HaloCanvas = dynamic(() => import("./HaloLogo3D.canvas"), {
  ssr: false,
  loading: () => null, // le fallback 2D du wrapper reste visible pendant le download
});

export function HaloLogo3D({ size = 56, state = "idle" }: HaloLogo3DProps) {
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <FallbackStatic
        size={size}
        state={state}
        className="halo-logo-3d halo-logo-3d--reduced"
      />
    );
  }

  return (
    <div
      className="halo-logo-3d"
      data-state={state}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Fallback 2D toujours rendu derrière le canvas — il sera couvert
          quand le canvas WebGL aura monté. Évite un trou visuel pendant
          le lazy-load (~250 KB de three+r3f). */}
      <FallbackStatic size={size} state={state} className="halo-logo-3d__fallback" />
      {/* Wrap rendu à 160% de la taille nominale, centré via inset
          négatif → la 3D (rings, particules, bloom) déborde la box sans
          être clippée par overflow:hidden. Le composant garde size×size
          comme dimension de layout pour la PulseStrip. */}
      <div className="halo-logo-3d__canvas-wrap">
        <HaloCanvas state={state} />
      </div>
    </div>
  );
}

/* ── Fallback statique — pas de WebGL, juste SVG ─────────────────
 * Composition minimaliste : 3 anneaux SVG orthogonaux + un dot central.
 * Sert à la fois pour reduced-motion et pour la phase de chargement
 * du chunk WebGL (~150-300 ms en dev). */

interface FallbackStaticProps {
  size: number;
  state: HaloState;
  className?: string;
}

function FallbackStatic({ size, state, className }: FallbackStaticProps) {
  const uid = useId().replace(/:/g, "_");
  return (
    <div
      className={className}
      data-state={state}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox="-1.8 -1.8 3.6 3.6"
        className="halo-logo-3d__fallback-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id={`halo-fb-core-${uid}`} cx="0" cy="0" r="0.4">
            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* 3 ellipses orthogonales — illusion 3D du gyroscope */}
        <ellipse cx="0" cy="0" rx="1" ry="1" fill="none" stroke="currentColor" strokeWidth="0.04" opacity="0.55" />
        <ellipse cx="0" cy="0" rx="1" ry="0.32" fill="none" stroke="currentColor" strokeWidth="0.04" opacity="0.55" />
        <ellipse cx="0" cy="0" rx="0.32" ry="1" fill="none" stroke="currentColor" strokeWidth="0.04" opacity="0.55" />
        {/* Cœur central */}
        <circle cx="0" cy="0" r="0.55" fill={`url(#halo-fb-core-${uid})`} />
        <circle cx="0" cy="0" r="0.22" fill="currentColor" />
      </svg>
    </div>
  );
}

/* ── Hook : prefers-reduced-motion via useSyncExternalStore ────── */

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}
