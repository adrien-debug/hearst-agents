"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface CockpitHeroProps {
  /** Briefing optionnel : si fourni, on rend la zone summary sous le greeting. */
  briefing?: {
    headline: string;
    body: string | null;
    empty: boolean;
  };
  /** CTA contextuel rendu sous le briefing (ex : "Connecte tes apps"). */
  emptyAction?: { label: string; href: string };
}

/**
 * CockpitHero — Hero unifié cockpit & welcome.
 *
 * Utilisé à la fois par CockpitStage (mode="cockpit") avec briefing et par
 * WelcomePanel (chat empty state) sans briefing — l'identité visuelle reste
 * identique au pixel.
 *
 * Layout grid :
 *   padding   : --space-12 horizontal, --space-14 top, --space-12 bottom
 *   headline  : .t-48 / --text-l0
 *   label     : .t-9 / --tracking-label / --text-l3
 *   time      : .t-15 / --text-l2
 *   divider   : gradient transparent → --sep → transparent
 *   briefing  : --space-8 top spacing, .t-15 / --text-l1
 */
export function CockpitHero({ briefing, emptyAction }: CockpitHeroProps = {}) {
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
        <h1
          className="t-30"
          style={{
            fontWeight: 500,
            lineHeight: "var(--leading-tight)",
            color: "var(--text-l1)",
          }}
        >
          {firstName}
        </h1>
        <span
          className="t-15 font-light"
          style={{
            color: "var(--text-l2)",
            marginTop: "var(--space-2)",
          }}
        >
          {time}
        </span>
      </div>

      {briefing && !briefing.empty && (
        <div style={{ marginTop: "var(--space-8)", maxWidth: "var(--width-actions)" }}>
          <p
            className="t-15"
            style={{
              fontWeight: 400,
              lineHeight: "var(--leading-tight)",
              color: "var(--text-l1)",
            }}
          >
            {briefing.headline}
          </p>
          {briefing.body && (
            <p
              className="t-13"
              style={{
                lineHeight: "var(--leading-tight)",
                color: "var(--text-l2)",
                marginTop: "var(--space-3)",
                whiteSpace: "pre-wrap",
              }}
            >
              {briefing.body}
            </p>
          )}
        </div>
      )}

      {briefing?.empty && emptyAction && (
        <div style={{ marginTop: "var(--space-8)" }}>
          <p
            className="t-13"
            style={{
              color: "var(--text-l2)",
              marginBottom: "var(--space-3)",
            }}
          >
            Pas encore de signal d{"'"}activité. Connecte tes apps pour que Hearst commence à apprendre.
          </p>
          <a
            href={emptyAction.href}
            className="t-11 font-mono uppercase inline-flex items-center"
            style={{
              letterSpacing: "var(--tracking-marquee)",
              color: "var(--cykan)",
              gap: "var(--space-2)",
            }}
          >
            {emptyAction.label} →
          </a>
        </div>
      )}

      <div
        style={{
          height: "1px",
          marginTop: "var(--space-12)",
          background:
            "linear-gradient(90deg, transparent 0%, var(--sep) 30%, var(--sep) 70%, transparent 100%)",
        }}
      />
    </div>
  );
}
