"use client";

/**
 * HaloLogo3D — signature 3D du H Hearst pour la PulseStrip.
 *
 * Direction technique : SVG + CSS 3D pur. Three.js a été écarté
 * (~200kb gzip pour un logo 56px = surcoût injustifié, et SVG gère
 * 4 instances simultanées sans contexte WebGL). Composition en
 * 4 strates synchronisées par data-state :
 *   1. Halo orbital      → anneaux + particules (SVG, GPU)
 *   2. Stack volumétrique → 10 couches H sur axe Z (CSS preserve-3d)
 *   3. Shimmer cykan      → linearGradient animé sur la face avant
 *   4. Glitch overlay     → chromatic aberration + scan (état error)
 *
 * Les deux polygones du H Hearst (cf. HearstLogo.tsx) sont réutilisés
 * tels quels et restent **statiques en 2D** : le H demeure 100%
 * lisible quel que soit l'état. La sensation 3D vient de la profondeur
 * de stack et du jeu de lumière, pas d'une rotation qui désorienterait
 * la lecture du logo.
 *
 * Reduced-motion : bascule sur une version statique 2D mono-couche.
 * Hover desktop : optionnel, pas implémenté (composant aria-hidden).
 */

import { useId, useSyncExternalStore } from "react";

type HaloState = "idle" | "running" | "awaiting" | "error";

interface HaloLogo3DProps {
  size?: number;
  state?: HaloState;
}

const STACK_DEPTH = 10;

export function HaloLogo3D({ size = 56, state = "idle" }: HaloLogo3DProps) {
  const reactId = useId();
  // useId() peut contenir ":" (React 18+) qui casse url(#…) dans SVG
  const uid = reactId.replace(/:/g, "_");
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <div
        className="halo-logo-3d halo-logo-3d--reduced"
        data-state={state}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <HMark className="halo-logo-3d__static" />
      </div>
    );
  }

  return (
    <div
      className="halo-logo-3d"
      data-state={state}
      style={
        {
          width: size,
          height: size,
          "--halo-size": `${size}px`,
        } as React.CSSProperties
      }
      aria-hidden
    >
      {/* Strate 1 — halo orbital (anneaux + particules) */}
      <Halo uid={uid} />

      {/* Strate 2 — stack volumétrique */}
      <div className="halo-logo-3d__stage">
        <div className="halo-logo-3d__stack">
          {Array.from({ length: STACK_DEPTH }).map((_, i) => {
            // Couche 0 = arrière, couche STACK_DEPTH-1 = avant
            const t = i / (STACK_DEPTH - 1);
            const isFront = i === STACK_DEPTH - 1;
            // Le shimmer cykan ne s'applique qu'en running ; sur les autres
            // états la couche avant reste sur currentColor pour préserver
            // la couleur sémantique (warn / danger / faint).
            const useShimmer = isFront && state === "running";
            return (
              <div
                key={i}
                className="halo-logo-3d__layer"
                data-position={i === 0 ? "back" : isFront ? "front" : "mid"}
                style={
                  {
                    "--layer-z": `${(t - 1) * 9}px`,
                    "--layer-opacity": String(0.18 + t * 0.82),
                  } as React.CSSProperties
                }
              >
                <HMark
                  className="halo-logo-3d__h"
                  fill={useShimmer ? `url(#halo-shimmer-${uid})` : undefined}
                  shimmerId={`halo-shimmer-${uid}`}
                  defineGradient={useShimmer}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Strate 4 — overlay glitch (visible uniquement en état error) */}
      <div className="halo-logo-3d__glitch" aria-hidden>
        <HMark className="halo-logo-3d__glitch-ghost halo-logo-3d__glitch-ghost--cyan" />
        <HMark className="halo-logo-3d__glitch-ghost halo-logo-3d__glitch-ghost--magenta" />
        <span className="halo-logo-3d__scanline" />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * Sous-composants
 * ────────────────────────────────────────────────────────────── */

interface HMarkProps {
  className?: string;
  fill?: string;
  shimmerId?: string;
  defineGradient?: boolean;
}

/** H Hearst — deux polygones canoniques. Coordonnées issues de HearstLogo.tsx. */
function HMark({ className, fill, shimmerId, defineGradient }: HMarkProps) {
  return (
    <svg
      viewBox="570 462 135 152"
      className={className}
      fill={fill ?? "currentColor"}
      preserveAspectRatio="xMidYMid meet"
    >
      {defineGradient && shimmerId ? (
        <defs>
          {/* Gradient cykan animé : translation horizontale → effet
              "shimmer" sur la face avant. gradientUnits=userSpaceOnUse
              pour que le translate soit cohérent avec le viewBox. */}
          <linearGradient
            id={shimmerId}
            x1="572"
            y1="462"
            x2="702"
            y2="610"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="var(--halo-shade-cool)" />
            <stop offset="0.45" stopColor="var(--halo-shade-bright)" />
            <stop offset="0.55" stopColor="var(--halo-shade-bright)" />
            <stop offset="1" stopColor="var(--halo-shade-cool)" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              values="-260 0; 260 0; -260 0"
              dur="4.5s"
              repeatCount="indefinite"
            />
          </linearGradient>
        </defs>
      ) : null}
      <polygon points="601.7 466.9 572.6 466.9 572.6 609.7 601.7 609.7 601.7 549.1 633.1 579.4 665.8 579.4 601.7 517.5 601.7 466.9" />
      <polygon points="672.7 466.9 672.7 528.1 644.6 500.9 612 500.9 672.7 559.7 672.7 609.7 701.9 609.7 701.9 466.9 672.7 466.9" />
    </svg>
  );
}

/** Halo orbital — anneaux concentriques + particules en orbite. */
function Halo({ uid }: { uid: string }) {
  return (
    <svg
      className="halo-logo-3d__halo"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        {/* Soft radial pour l'aura de fond */}
        <radialGradient id={`halo-aura-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.12" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Aura diffuse sous le H — visible dès idle */}
      <circle
        className="halo-logo-3d__aura"
        cx="50"
        cy="50"
        r="42"
        fill={`url(#halo-aura-${uid})`}
      />

      {/* 3 anneaux pulse — désynchronisés par animation-delay */}
      <circle className="halo-logo-3d__ring halo-logo-3d__ring--1" cx="50" cy="50" r="32" />
      <circle className="halo-logo-3d__ring halo-logo-3d__ring--2" cx="50" cy="50" r="32" />
      <circle className="halo-logo-3d__ring halo-logo-3d__ring--3" cx="50" cy="50" r="32" />

      {/* Particules orbitales — group rotatif autour du centre */}
      <g className="halo-logo-3d__orbit halo-logo-3d__orbit--cw">
        <circle className="halo-logo-3d__particle" cx="50" cy="8" r="1.3" />
        <circle className="halo-logo-3d__particle" cx="50" cy="92" r="0.9" />
      </g>
      <g className="halo-logo-3d__orbit halo-logo-3d__orbit--ccw">
        <circle className="halo-logo-3d__particle" cx="6" cy="50" r="1.1" />
        <circle className="halo-logo-3d__particle" cx="94" cy="50" r="0.7" />
      </g>
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────
 * Hook utilitaire — prefers-reduced-motion
 * ────────────────────────────────────────────────────────────── */

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
