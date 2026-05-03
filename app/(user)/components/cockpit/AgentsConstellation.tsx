"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useServicesStore } from "@/stores/services";
import { useRuntimeStore } from "@/stores/runtime";
import { SectionHeader } from "../ui/SectionHeader";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";

interface AgentsConstellationProps {
  data: CockpitTodayPayload;
}

const MAX_VISIBLE = 11; // 12e tile = "+N"
const ACTIVE_WINDOW_MS = 5_000;

function glyphFor(service: ServiceWithConnectionStatus): string {
  return service.icon || service.name.charAt(0).toUpperCase();
}

/**
 * Détecte les agents "actifs" maintenant : croise les events SSE récents
 * (< 5s) avec les missions running pour produire un Set<serviceId>.
 */
function useActiveAgents(data: CockpitTodayPayload): Set<string> {
  const events = useRuntimeStore((s) => s.events);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(() => {
    const active = new Set<string>();
    for (const ev of events) {
      if (now - ev.timestamp > ACTIVE_WINDOW_MS) continue;
      const providerId = typeof ev["providerId"] === "string" ? (ev["providerId"] as string) : null;
      if (providerId) active.add(providerId.toLowerCase());
      const label = typeof ev["label"] === "string" ? (ev["label"] as string).toLowerCase() : "";
      for (const m of data.missionsRunning) {
        if (m.status !== "running") continue;
        const mname = m.name.toLowerCase();
        if (label.includes(mname) || mname.includes(label)) {
          active.add(mname);
        }
      }
    }
    for (const m of data.missionsRunning) {
      if (m.status === "running") {
        active.add(m.name.toLowerCase());
      }
    }
    return active;
  }, [events, data.missionsRunning, now]);
}

function isActive(service: ServiceWithConnectionStatus, active: Set<string>): boolean {
  return (
    active.has(service.id.toLowerCase()) ||
    active.has(service.providerId.toLowerCase()) ||
    Array.from(active).some((a) => a.includes(service.id.toLowerCase()))
  );
}

export function AgentsConstellation({ data }: AgentsConstellationProps) {
  const services = useServicesStore((s) => s.services);
  const router = useRouter();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const activeAgents = useActiveAgents(data);

  // Tri : connected actifs → connected idle → pending → error → disconnected
  const sorted = useMemo(() => {
    const order: Record<string, number> = {
      connected: 0,
      pending: 1,
      error: 2,
      disconnected: 3,
    };
    return [...services].sort((a, b) => {
      const aActive = isActive(a, activeAgents) ? -1 : 0;
      const bActive = isActive(b, activeAgents) ? -1 : 0;
      if (aActive !== bActive) return aActive - bActive;
      return (order[a.connectionStatus] ?? 4) - (order[b.connectionStatus] ?? 4);
    });
  }, [services, activeAgents]);

  const visible = sorted.slice(0, MAX_VISIBLE);
  const hiddenCount = Math.max(0, sorted.length - MAX_VISIBLE);
  const connectedCount = services.filter((s) => s.connectionStatus === "connected").length;

  const handleClick = (service: ServiceWithConnectionStatus) => {
    if (service.connectionStatus === "connected") {
      router.push(`/apps#${service.id}`);
    } else if (service.connectionStatus === "pending" || service.connectionStatus === "error") {
      router.push(`/apps#${service.id}?retry=1`);
    } else {
      router.push(`/apps#${service.id}?connect=1`);
    }
  };

  return (
    <section className="flex flex-col min-h-0 min-w-0" aria-label="Agents connectés">
      <SectionHeader
        label="Agents connectés"
        action={
          <Link
            href="/apps"
            className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors tabular-nums"
          >
            {connectedCount}/{services.length} →
          </Link>
        }
      />
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gridTemplateRows: "repeat(3, minmax(0, 1fr))",
          gap: "var(--space-2)",
          flex: 1,
          minHeight: 0,
        }}
      >
        {visible.map((s) => {
          const active = isActive(s, activeAgents) && s.connectionStatus === "connected";
          const status = s.connectionStatus;
          return (
            <button
              key={s.id}
              onClick={() => handleClick(s)}
              onMouseEnter={() => setHoverId(s.id)}
              onMouseLeave={() => setHoverId(null)}
              onFocus={() => setHoverId(s.id)}
              onBlur={() => setHoverId(null)}
              title={`${s.name} — ${status === "connected" ? (active ? "actif" : "connecté") : status === "pending" ? "en attente d'OAuth" : status === "error" ? "erreur" : "déconnecté"}`}
              className="relative flex flex-col items-center justify-center transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cykan)]"
              style={{
                padding: "var(--space-2)",
                background: "var(--surface-1)",
                border:
                  status === "error"
                    ? "1px solid var(--danger)"
                    : active
                      ? "1px solid var(--cykan-border)"
                      : "1px solid var(--border-soft)",
                borderRadius: "var(--radius-sm)",
                opacity: status === "disconnected" ? 0.4 : status === "pending" ? 0.7 : 1,
                filter: status === "disconnected" ? "grayscale(1)" : "none",
                boxShadow: active ? "var(--glow-cyan-sm)" : "none",
                gap: "var(--space-1)",
                minHeight: 0,
              }}
            >
              <span
                aria-hidden
                className="t-13 font-medium text-[var(--text-l1)]"
                style={{ lineHeight: 1 }}
              >
                {glyphFor(s)}
              </span>
              <span className="t-9 font-light text-[var(--text-faint)] truncate w-full text-center">
                {s.name}
              </span>
              {/* Status dot bottom-right */}
              <span
                aria-hidden
                className={
                  active
                    ? "context-tile-status is-running"
                    : status === "connected"
                      ? "sf-dot-heartbeat"
                      : status === "error"
                        ? "context-tile-status is-failed"
                        : status === "pending"
                          ? "context-tile-status is-blocked"
                          : ""
                }
                style={{
                  position: "absolute",
                  bottom: "var(--space-1)",
                  right: "var(--space-1)",
                  width: "var(--space-2)",
                  height: "var(--space-2)",
                  borderRadius: "var(--radius-pill)",
                  background:
                    status === "connected" && !active
                      ? "var(--cykan)"
                      : status === "pending"
                        ? "var(--gold)"
                        : status === "disconnected"
                          ? "var(--text-decor-25, var(--border-default))"
                          : undefined,
                }}
              />
              {hoverId === s.id && status === "connected" && (
                <span
                  role="tooltip"
                  className="absolute z-30 whitespace-nowrap t-9 font-light text-[var(--text-soft)]"
                  style={{
                    bottom: "calc(100% + var(--space-1))",
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "var(--space-1) var(--space-2)",
                    background: "var(--rail)",
                    border: "1px solid var(--border-shell)",
                    borderRadius: "var(--radius-xs)",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  {active ? `${s.name} · en cours` : s.name}
                </span>
              )}
            </button>
          );
        })}
        {/* +N tile */}
        <Link
          href="/apps"
          className="flex flex-col items-center justify-center transition-colors hover:text-[var(--cykan)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cykan)]"
          style={{
            padding: "var(--space-2)",
            background: "var(--surface-1)",
            border: "1px dashed var(--border-soft)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-faint)",
            gap: "var(--space-1)",
            minHeight: 0,
          }}
        >
          <span aria-hidden className="t-13 font-medium">
            {hiddenCount > 0 ? `+${hiddenCount}` : "+"}
          </span>
          <span className="t-9 font-light">Voir tout</span>
        </Link>
      </div>
    </section>
  );
}
