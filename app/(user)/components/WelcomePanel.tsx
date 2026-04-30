"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRightPanelData } from "./right-panel/useRightPanelData";
import { useRouter } from "next/navigation";

export function WelcomePanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const { missions } = useRightPanelData();
  const [now, setNow] = useState(() => Date.now());
  const userName = session?.user?.name?.split(" ")[0] ?? "Adrien";

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const nowDate = new Date(now);
  const hours = String(nowDate.getHours()).padStart(2, "0");
  const minutes = String(nowDate.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  // Top 3 unique customers from missions (based on name)
  const customerSet = new Set<string>();
  const topCustomers: string[] = [];
  for (const m of missions) {
    if (customerSet.size >= 3) break;
    const name = m.name || "Unknown";
    if (!customerSet.has(name)) {
      customerSet.add(name);
      topCustomers.push(name);
    }
  }

  // Top 2 active missions
  const topMissions = missions
    .filter((m) => m.opsStatus === "running" || m.enabled)
    .slice(0, 2);

  const quickActions = [
    { label: "Nouveau brief", icon: "+" },
    { label: "Nouvelle requête", icon: "⚡" },
    { label: "Voir les documents", icon: "📋" },
  ];

  return (
    <div className="flex-1 flex flex-col items-start justify-start px-16 py-20 max-w-4xl mx-auto w-full">
      {/* Greeting */}
      <div className="w-full mb-16">
        <div className="flex items-baseline justify-between mb-2">
          <p className="t-9 font-mono uppercase tracking-display text-[var(--text-ghost)]">
            Système opérationnel
          </p>
          <span className="t-9 font-mono text-[var(--text-ghost)]">
            {timeStr}
          </span>
        </div>
        <h1 className="t-60 leading-[0.9] font-bold tracking-tight text-[var(--text)]">
          {userName}.
        </h1>
      </div>

      {/* Section 1 — Last Customers */}
      {topCustomers.length > 0 && (
        <div className="w-full mb-12">
          <p className="t-9 font-mono uppercase tracking-body text-[var(--text-ghost)] mb-4">Clients récents</p>
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            {topCustomers.map((customer) => (
              <button
                key={customer}
                onClick={() => {}}
                className="group text-left cursor-pointer transition-colors duration-base"
              >
                <span className="t-11 font-medium text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors">
                  {customer}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section 2 — Quick Actions */}
      <div className="w-full mb-12">
        <p className="t-9 font-mono uppercase tracking-body text-[var(--text-ghost)] mb-4">Actions rapides</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
          {quickActions.map((action, idx) => (
            <button
              key={action.label}
              onClick={() => {
                if (action.label === "Voir les documents") router.push("/assets");
              }}
              className="group flex items-center justify-between py-3 border-b border-[var(--border-shell)] cursor-pointer transition-colors duration-base"
            >
              <span className="t-11 text-[var(--text-muted)] group-hover:text-[var(--text)] text-left transition-colors">
                {action.label}
              </span>
              <span className="t-9 font-mono text-[var(--text-ghost)] group-hover:text-[var(--text-muted)]">
                {idx === 0 ? "⌘B" : idx === 1 ? "⌘Q" : "⌘A"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Hint */}
      <div className="w-full mt-auto pt-12 border-t border-[var(--border-default)] opacity-30">
        <p className="t-9 font-mono uppercase tracking-display text-[var(--text-ghost)]">
          ⌘1 Cockpit · ⌘K Commandeur
        </p>
      </div>
    </div>
  );
}
