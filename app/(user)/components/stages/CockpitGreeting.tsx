"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export function CockpitGreeting() {
  const { data: session } = useSession();
  const [time, setTime] = useState<string>("--:--");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      setTime(`${hours}:${minutes}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const firstName = session?.user?.name?.split(" ")[0] || "Utilisateur";

  return (
    <div className="flex items-start justify-between pt-32 px-12">
      <div className="flex flex-col gap-2">
        <h1 className="t-60 font-medium tracking-tighter text-[var(--text)] bg-gradient-to-b from-[var(--text)] to-[var(--text-muted)] bg-clip-text text-transparent">
          {firstName}
        </h1>
        <div className="flex items-center gap-3">
          <div className="w-8 h-[1px] bg-[var(--cykan)] opacity-50" />
          <p className="t-11 font-mono uppercase tracking-brand text-[var(--text-ghost)]">
            Système en ligne
          </p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="t-34 font-light text-[var(--text)] tabular-nums tracking-tighter">{time}</span>
        <span className="t-9 font-mono uppercase tracking-display text-[var(--text-ghost)] opacity-40">UTC+4</span>
      </div>
    </div>
  );
}
