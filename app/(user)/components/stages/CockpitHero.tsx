"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

/**
 * CockpitHero — Shared hero component for the home stage.
 *
 * Used by both CockpitStage (mode="cockpit") and WelcomePanel (chat empty state)
 * so the visual identity is identical at 1px precision across both rendering paths.
 *
 * Layout grid:
 *   padding:  var(--space-12) horizontal, var(--space-14) top, var(--space-12) bottom
 *   headline: clamp(48px, 5vw, 72px), --text-l0
 *   label:    10px / --tracking-label / --text-l3
 *   time:     15px / --text-l2
 *   divider:  gradient transparent → 6% → transparent
 */
export function CockpitHero() {
  const { data: session } = useSession();
  const [time, setTime] = useState("--:--");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const firstName = session?.user?.name?.split(" ")[0] ?? "Adrien";

  return (
    <div
      style={{
        padding: "var(--space-14) var(--space-12) var(--space-12)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p
            className="font-mono uppercase"
            style={{
              fontSize: "10px",
              fontWeight: 500,
              letterSpacing: "var(--tracking-label)",
              color: "var(--text-l3)",
              marginBottom: "var(--space-3)",
            }}
          >
            Welcome back
          </p>
          <h1
            style={{
              fontSize: "clamp(48px, 5vw, 72px)",
              fontWeight: 600,
              lineHeight: 1.0,
              letterSpacing: "-0.03em",
              color: "var(--text-l0)",
            }}
          >
            {firstName}
          </h1>
        </div>
        <span
          className="font-mono"
          style={{
            fontSize: "15px",
            fontWeight: 300,
            color: "var(--text-l2)",
            marginTop: "var(--space-2)",
          }}
        >
          {time}
        </span>
      </div>

      {/* Soft gradient divider — fades into ambient */}
      <div
        style={{
          height: "1px",
          marginTop: "var(--space-12)",
          background: "linear-gradient(90deg, transparent 0%, var(--sep) 30%, var(--sep) 70%, transparent 100%)",
        }}
      />
    </div>
  );
}
