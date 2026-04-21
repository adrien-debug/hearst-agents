"use client";

import { ManifestationStage } from "@/app/components/system/ManifestationStage";

export default function HomePage() {
  return (
    <div className="flex min-h-[200px] w-full flex-1 flex-col items-center justify-center">
      <ManifestationStage />
    </div>
  );
}
