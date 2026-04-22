"use client";

/**
 * HomePage — Manifestation Surface.
 *
 * No stage frame. No decorative effects.
 * Pure canvas for focal manifestation.
 */

import { ManifestationStage } from "@/app/components/system/ManifestationStage";

export default function HomePage() {
  return (
    <div className="flex h-full w-full flex-1 overflow-hidden">
      <div className="flex h-full w-full items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-[1120px]">
          <ManifestationStage />
        </div>
      </div>
    </div>
  );
}
