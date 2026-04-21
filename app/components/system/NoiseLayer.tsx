"use client";

import { memo } from "react";

export const NoiseLayer = memo(function NoiseLayer() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 z-[999] h-full w-full opacity-[0.02]"
      aria-hidden="true"
    >
      <filter id="hearst-noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#hearst-noise)" />
    </svg>
  );
});
