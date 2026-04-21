"use client";

import { useSession } from "next-auth/react";

function greetingText(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function HomePage() {
  const { data: session } = useSession();
  const name = session?.user?.name?.split(" ")[0];

  return (
    <div className="flex h-full items-center justify-center">
      {/* glow removed — invariant: no blur, no shadow */}
      <div className="relative flex flex-col items-center gap-4">
        <h1 className="text-2xl font-light tracking-tight text-white">
          {greetingText()}{name ? `, ${name}` : ""}
        </h1>
        <div className="flex items-center gap-2 opacity-30">
          <div className="h-1 w-1 rounded-full bg-white/30 animate-[pulse_4s_ease-in-out_infinite]" />
          <span className="text-[8px] font-mono tracking-[0.25em] text-white/50 uppercase">System ready</span>
        </div>
      </div>
    </div>
  );
}
