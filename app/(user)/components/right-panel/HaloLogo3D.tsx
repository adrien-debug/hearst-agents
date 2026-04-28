"use client";

/**
 * HaloLogo3D — H Hearst en illusion 3D pour la PulseStrip.
 *
 * 6 couches du même H SVG empilées sur l'axe Z avec opacités croissantes,
 * effet d'extrusion. Le wrapper a `perspective` + `transform-style: preserve-3d`,
 * permettant rotation Y douce en mode `running`. Pas de WebGL, juste CSS pur.
 *
 * États (data-state) :
 *   - idle      : statique, opacité atténuée, pas de rotation
 *   - running   : rotation Y continue 10s, couleur cykan plein
 *   - awaiting  : pas de rotation, couleur warn, leger oscillation
 *   - error     : pas de rotation, couleur danger, statique
 */

type HaloState = "idle" | "running" | "awaiting" | "error";

interface HaloLogo3DProps {
  size?: number;
  state?: HaloState;
}

const LAYER_COUNT = 6;

export function HaloLogo3D({ size = 56, state = "idle" }: HaloLogo3DProps) {
  return (
    <div
      className="halo-logo-3d shrink-0"
      data-state={state}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div className="halo-logo-3d-inner">
        {Array.from({ length: LAYER_COUNT }).map((_, i) => {
          // Couches arrière (i=0) → couches avant (i=LAYER_COUNT-1)
          const z = (i - (LAYER_COUNT - 1)) * 1.5;
          const opacity = 0.12 + (i / (LAYER_COUNT - 1)) * 0.88;
          return (
            <div
              key={i}
              className="halo-logo-3d-layer"
              style={{ transform: `translateZ(${z}px)`, opacity }}
            >
              <HMark />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Le "H AI" Hearst (deux polygones cykan extraits de HearstLogo).
 * `currentColor` permet au layer de hériter de la couleur sémantique.
 */
function HMark() {
  return (
    <svg
      viewBox="570 462 135 152"
      className="w-full h-full"
      fill="currentColor"
      preserveAspectRatio="xMidYMid meet"
    >
      <polygon points="601.7 466.9 572.6 466.9 572.6 609.7 601.7 609.7 601.7 549.1 633.1 579.4 665.8 579.4 601.7 517.5 601.7 466.9" />
      <polygon points="672.7 466.9 672.7 528.1 644.6 500.9 612 500.9 672.7 559.7 672.7 609.7 701.9 609.7 701.9 466.9 672.7 466.9" />
    </svg>
  );
}
