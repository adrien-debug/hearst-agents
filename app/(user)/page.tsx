"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

export default function HomePage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      return;
    }
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, [session]);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-[#050505] px-8">
      <div className={`transition-opacity duration-1000 ${loading ? 'opacity-0' : 'opacity-100'}`}>
        <div className="relative flex items-center justify-center">
          {/* Subtle perceptual energy field, no borders, no boxes */}
          <div className="absolute w-[600px] h-[600px] rounded-full bg-cyan-900/5 blur-[120px] pointer-events-none" />
          
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 opacity-50">
              <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[10px] font-mono tracking-[0.2em] text-cyan-400">HEARST OS</span>
            </div>
            <h1 className="text-2xl font-light tracking-widest text-white/20 select-none">
              SYSTEM READY
            </h1>
          </div>
        </div>
      </div>
    </div>
  );
}
