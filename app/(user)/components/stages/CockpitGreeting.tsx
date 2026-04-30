"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export function CockpitGreeting() {
  const { data: session } = useSession();
  const [time, setTime] = useState("--:--");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const firstName = session?.user?.name?.split(" ")[0] ?? "Adrien";

  return (
    <div className="px-12 pt-14 pb-10">
      <div className="flex items-start justify-between">
        <div>
          <p className="t-9 font-mono uppercase tracking-marquee mb-3"
            style={{ color: "var(--text-l3)", letterSpacing: "0.22em" }}>
            Welcome back
          </p>
          <h1 style={{
            fontSize: "clamp(48px, 5vw, 72px)",
            fontWeight: 600,
            lineHeight: 1.0,
            letterSpacing: "-0.03em",
            color: "var(--text-l0)",
          }}>
            {firstName}
          </h1>
        </div>
        <span className="t-15 font-mono font-light mt-2"
          style={{ color: "var(--text-l2)" }}>
          {time}
        </span>
      </div>

      {/* Soft gradient divider — fades into ambient */}
      <div
        className="mt-12"
        style={{
          height: "1px",
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.06) 70%, transparent 100%)",
        }}
      />
    </div>
  );
}
