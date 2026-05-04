"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

interface CockpitHeaderProps {
  data: CockpitTodayPayload;
}

const FRENCH_DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const FRENCH_MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function formatNow(now: Date): string {
  const day = FRENCH_DAYS[now.getDay()];
  const dayN = now.getDate();
  const month = FRENCH_MONTHS[now.getMonth()];
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  return `${day} ${dayN} ${month} ${hh}:${mm}`;
}

export function CockpitHeader({ data }: CockpitHeaderProps) {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] ?? "";
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const runningCount = data.missionsRunning.filter((m) => m.status === "running").length;
  const greeting = firstName ? `Hello, ${firstName}.` : "Hello.";

  return (
    <header
      className="flex items-baseline justify-between gap-4 shrink-0"
      style={{ height: "var(--space-16)" }}
    >
      <h1 className="t-28 font-medium leading-tight text-[var(--text-l1)] truncate">{greeting}</h1>
      <div className="flex items-baseline gap-2 shrink-0">
        <span className="t-10 font-light text-[var(--text-faint)] tabular-nums">
          {formatNow(now)}
        </span>
        {runningCount > 0 && (
          <>
            <span className="t-11 text-[var(--text-faint)]">·</span>
            <span className="t-11 font-medium text-[var(--cykan)]">
              {runningCount} mission{runningCount > 1 ? "s" : ""} running
            </span>
          </>
        )}
      </div>
    </header>
  );
}
