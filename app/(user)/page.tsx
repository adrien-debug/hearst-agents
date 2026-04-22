"use client";

import { ManifestationStage } from "@/app/components/system/ManifestationStage";

export default function HomePage() {
  return (
    <div className="compact-shell-page flex h-full w-full flex-1 overflow-y-auto px-6 pb-8 pt-6 lg:px-10 lg:pb-10 lg:pt-8 xl:px-14">
      <div className="mx-auto flex min-h-full w-full max-w-[1120px] min-w-0 items-stretch">
        <section className="compact-shell-stage-frame relative flex min-h-[calc(100vh-8.75rem)] w-full items-center justify-center overflow-hidden rounded-[30px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.018),rgba(255,255,255,0.008))] px-6 py-10 shadow-[0_24px_80px_rgba(0,0,0,0.34)] lg:min-h-[calc(100vh-9.5rem)] lg:px-10 lg:py-12">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/12 to-transparent" />
          <div className="absolute inset-x-[14%] bottom-10 h-px bg-linear-to-r from-transparent via-white/8 to-transparent" />
          <div className="absolute inset-x-[22%] top-[18%] h-32 rounded-full bg-cyan-accent/[0.035] blur-3xl" />
          <div className="compact-shell-stage-inner relative z-10 w-full max-w-[980px]">
            <ManifestationStage />
          </div>
        </section>
      </div>
    </div>
  );
}
