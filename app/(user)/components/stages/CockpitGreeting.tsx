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
    <div className="flex items-start justify-between pt-12 px-12">
      <div className="flex flex-col gap-3">
        <p className="t-11 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
          Welcome back,
        </p>
        <h1 className="t-42 font-medium tracking-tight text-[var(--text)]">
          {firstName}
        </h1>
      </div>
      <span className="t-34 font-light text-[var(--text-muted)]">{time}</span>
    </div>
  );
}
