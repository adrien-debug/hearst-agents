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
  /**
   * `band` — rangée compacte alignée à droite (sous Usage + Signaux).
   * `panel` — grille 4×3 (layout historique).
   */
  layout?: "panel" | "band";
}

const MAX_VISIBLE = 11; // 12e tile = "+N"
const ACTIVE_WINDOW_MS = 5_000;

function isImagePath(s: string | undefined): boolean {
  if (!s) return false;
  return s.startsWith("/") || s.startsWith("http://") || s.startsWith("https://") || s.endsWith(".svg") || s.endsWith(".png");
}

function ServiceGlyph({ service }: { service: ServiceWithConnectionStatus }) {
  const fallbackChar = service.name.charAt(0).toUpperCase();
  if (isImagePath(service.icon)) {
    return (
      <span
        className="relative inline-flex items-center justify-center"
        style={{ width: "var(--space-5)", height: "var(--space-5)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={service.icon}
          alt=""
          aria-hidden
          width={20}
          height={20}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onError={(e) => {
            // Fallback char si l'icône fail à charger
            const el = e.currentTarget;
            el.style.display = "none";
            const sib = el.nextElementSibling as HTMLElement | null;
            if (sib) sib.style.display = "inline";
          }}
        />
        <span
          className="absolute t-13 font-medium text-[var(--text-l1)]"
          style={{ display: "none", lineHeight: 1 }}
          aria-hidden
        >
          {fallbackChar}
        </span>
      </span>
    );
  }
  return (
    <span aria-hidden className="t-13 font-medium text-[var(--text-l1)]" style={{ lineHeight: 1 }}>
      {service.icon || fallbackChar}
    </span>
  );
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

export function AgentsConstellation({ data, layout = "panel" }: AgentsConstellationProps) {
  const services = useServicesStore((s) => s.services);
  const loaded = useServicesStore((s) => s.loaded);
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

  const headerLink =
    loaded ? (
      <Link
        href="/apps"
        className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors tabular-nums"
      >
        {connectedCount}/{services.length} →
      </Link>
    ) : null;

  const tileButtonClassPanel =
    "group relative flex flex-col items-center justify-center transition-colors duration-(--duration-base) ease-(--ease-standard) focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cykan)]";
  const tileButtonClassBand =
    "group relative flex flex-col items-center justify-center transition-colors duration-(--duration-base) ease-(--ease-standard) focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cykan)]";

  const renderTile = (s: ServiceWithConnectionStatus, mode: "panel" | "band") => {
    const active = isActive(s, activeAgents) && s.connectionStatus === "connected";
    const status = s.connectionStatus;
    const titleAttr = `${s.name} — ${status === "connected" ? (active ? "actif" : "connecté") : status === "pending" ? "en attente d'OAuth" : status === "error" ? "erreur" : "déconnecté"}`;
    return (
      <button
        key={s.id}
        type="button"
        aria-label={titleAttr}
        onClick={() => handleClick(s)}
        onMouseEnter={() => setHoverId(s.id)}
        onMouseLeave={() => setHoverId(null)}
        onFocus={() => setHoverId(s.id)}
        onBlur={() => setHoverId(null)}
        title={titleAttr}
        className={mode === "band" ? tileButtonClassBand : tileButtonClassPanel}
        style={{
          padding: mode === "band" ? "var(--space-1)" : "var(--space-2)",
          borderRadius: "var(--radius-pill)",
          opacity: status === "disconnected" ? 0.4 : status === "pending" ? 0.7 : 1,
          filter: status === "disconnected" ? "grayscale(1)" : "none",
          boxShadow: active ? "0 0 16px 1px var(--cykan)" : "none",
          gap: mode === "band" ? 0 : "var(--space-1)",
          minHeight: 0,
          minWidth: mode === "band" ? "var(--space-10)" : undefined,
          transform: active && mode === "panel" ? "scale(1.05)" : "scale(1)",
        }}
      >
        <div className={`${mode === "band" ? "" : "transition-all duration-500"} ${active ? "animate-pulse" : ""}`}>
          <ServiceGlyph service={s} />
        </div>
        {mode === "panel" && (
          <span className="t-9 font-light text-[var(--text-faint)] truncate w-full text-center group-hover:text-[var(--cykan)] transition-colors">
            {s.name}
          </span>
        )}
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
  };

  if (layout === "band") {
    return (
      <section className="flex flex-col min-h-0 min-w-0 items-end text-right" aria-label="Agents connectés">
        <header
          className="flex items-center justify-end gap-3 w-full shrink-0"
          style={{ marginBottom: "var(--space-2)" }}
        >
          <span className="t-11 font-medium text-[var(--text-faint)]">Agents connectés</span>
          {headerLink}
        </header>
        {!loaded ? (
          <div
            className="flex flex-wrap justify-end gap-2 w-full"
            aria-busy="true"
            aria-live="polite"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="ghost-skeleton-bar shrink-0"
                style={{
                  borderRadius: "var(--radius-pill)",
                  width: "var(--space-10)",
                  height: "var(--space-10)",
                }}
              />
            ))}
          </div>
        ) : (
          <div
            className="flex flex-wrap justify-end gap-x-2 gap-y-1 w-full"
            style={{ rowGap: "var(--space-1)" }}
          >
            {visible.map((s) => renderTile(s, "band"))}
            <Link
              href="/apps"
              className="inline-flex flex-col items-center justify-center shrink-0 transition-colors hover:text-[var(--cykan)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cykan)]"
              style={{
                padding: "var(--space-1)",
                borderRadius: "var(--radius-pill)",
                color: "var(--text-faint)",
                minWidth: "var(--space-10)",
                minHeight: "var(--space-10)",
              }}
              aria-label="Voir toutes les apps"
            >
              <span aria-hidden className="t-13 font-medium leading-none">
                {hiddenCount > 0 ? `+${hiddenCount}` : "+"}
              </span>
            </Link>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col min-h-0 min-w-0" aria-label="Agents connectés">
      <SectionHeader label="Agents connectés" action={headerLink} />
      {!loaded ? (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gridTemplateRows: "repeat(3, minmax(0, 1fr))",
            gap: "var(--space-2)",
            flex: 1,
            minHeight: 0,
          }}
          aria-busy="true"
          aria-live="polite"
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="ghost-skeleton-bar"
              style={{ borderRadius: "var(--radius-sm)", minHeight: 0 }}
            />
          ))}
        </div>
      ) : (
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
          {visible.map((s) => renderTile(s, "panel"))}
          <Link
            href="/apps"
            className="flex flex-col items-center justify-center transition-colors duration-(--duration-base) hover:text-[var(--cykan)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cykan)]"
            style={{
              padding: "var(--space-2)",
              borderRadius: "var(--radius-pill)",
              color: "var(--text-faint)",
              gap: "var(--space-1)",
              minHeight: 0,
            }}
          >
            <span aria-hidden className="t-13 font-medium">
              {hiddenCount > 0 ? `+${hiddenCount}` : "+"}
            </span>
            <span className="t-9 font-light text-[var(--text-faint)]">Voir tout</span>
          </Link>
        </div>
      )}
    </section>
  );
}
