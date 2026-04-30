"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useNavigationStore } from "@/stores/navigation";
import { useStageStore } from "@/stores/stage";

type Box = {
  key: string;
  label: string;
  pitch: string;
  threadName: string;
};

const SIGNATURES: Box[] = [
  { key: "chat",       label: "Chat",       pitch: "Pensée libre", threadName: "Chat" },
  { key: "asset",      label: "Asset",      pitch: "Doc · image · code", threadName: "Asset" },
  { key: "browser",    label: "Browser",    pitch: "Navigation guidée", threadName: "Browser" },
  { key: "meeting",    label: "Meeting",    pitch: "Capture & action items", threadName: "Meeting" },
  { key: "kg",         label: "Knowledge",  pitch: "Graph d'entités", threadName: "Knowledge" },
  { key: "voice",      label: "Voice",      pitch: "Dictée temps réel", threadName: "Voice" },
  { key: "simulation", label: "Simulation", pitch: "Scénarios probables", threadName: "Simulation" },
];

const SERVICES: Box[] = [
  { key: "gmail",  label: "@gmail",  pitch: "Inbox", threadName: "Hearst · @gmail" },
  { key: "slack",  label: "@slack",  pitch: "Chans", threadName: "Hearst · @slack" },
  { key: "notion", label: "@notion", pitch: "Pages", threadName: "Hearst · @notion" },
  { key: "github", label: "@github", pitch: "Repos", threadName: "Hearst · @github" },
  { key: "linear", label: "@linear", pitch: "Issues", threadName: "Hearst · @linear" },
  { key: "drive",  label: "@drive",  pitch: "Files",  threadName: "Hearst · @drive" },
];

const TWO_PI = Math.PI * 2;
const QUARTER = Math.PI / 2;

interface Position {
  x: number;
  y: number;
  side: "left" | "right";
}

function radial(
  count: number,
  index: number,
  cx: number,
  cy: number,
  radius: number,
  startOffset = 0,
): Position {
  const angle = -QUARTER + startOffset + (index / count) * TWO_PI;
  const x = cx + Math.cos(angle) * radius;
  const y = cy + Math.sin(angle) * radius;
  return { x, y, side: x >= cx ? "right" : "left" };
}

interface Geometry {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  signatures: Position[];
  services: Position[];
}

function computeGeometry(w: number, h: number): Geometry {
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);
  const innerR = minDim * 0.22;
  const outerR = minDim * 0.42;
  const signatures = SIGNATURES.map((_, i) =>
    radial(SIGNATURES.length, i, cx, cy, innerR),
  );
  const services = SERVICES.map((_, i) =>
    radial(SERVICES.length, i, cx, cy, outerR, Math.PI / SERVICES.length),
  );
  return { cx, cy, innerR, outerR, signatures, services };
}

interface ConstellationLabelProps {
  box: Box;
  pos: Position;
  variant: "signature" | "service";
  hovered: boolean;
  onHover: (h: boolean) => void;
  onClick: () => void;
}

function ConstellationLabel({
  box,
  pos,
  variant,
  hovered,
  onHover,
  onClick,
}: ConstellationLabelProps) {
  const labelClass =
    variant === "signature" ? "t-15 font-light" : "t-13 font-light";
  const transform =
    pos.side === "right"
      ? "translate(var(--space-3), -50%)"
      : "translate(calc(-100% - var(--space-3)), -50%)";
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      onClick={onClick}
      className="absolute text-left"
      style={{
        left: pos.x,
        top: pos.y,
        transform,
        textAlign: pos.side === "right" ? "left" : "right",
      }}
    >
      <span
        className={`${labelClass} transition-all duration-emphasis ease-out-soft block`}
        style={{
          color: hovered ? "var(--cykan)" : "var(--text-l1)",
          textShadow: hovered ? "var(--neon-cykan)" : "none",
        }}
      >
        {box.label}
      </span>
      <span
        className="t-9 tracking-display uppercase block transition-colors duration-emphasis ease-out-soft"
        style={{
          color: hovered ? "var(--text-l2)" : "var(--text-l3)",
          marginTop: "var(--space-1)",
        }}
      >
        {box.pitch}
      </span>
    </button>
  );
}

export function HearstConstellation() {
  const { data: session } = useSession();
  const areaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const addThread = useNavigationStore((s) => s.addThread);
  const setActiveThread = useNavigationStore((s) => s.setActiveThread);
  const setStageMode = useStageStore((s) => s.setMode);

  useEffect(() => {
    if (!areaRef.current) return;
    const el = areaRef.current;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const firstName = session?.user?.name?.split(" ")[0] ?? "Adrien";

  const handleBoxClick = (box: Box) => {
    const id = addThread(box.threadName, "home");
    setActiveThread(id);
    setStageMode({ mode: "chat", threadId: id });
  };

  const geo = size ? computeGeometry(size.w, size.h) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Top kicker — hello + name */}
      <div
        className="flex items-baseline justify-between"
        style={{
          padding: "var(--space-10) var(--space-12) 0",
        }}
      >
        <p
          className="t-13 lowercase font-light"
          style={{
            color: "var(--text-l3)",
            letterSpacing: "var(--tracking-subtle)",
          }}
        >
          hello, {firstName.toLowerCase()}
        </p>
        <p
          className="t-9 tracking-display uppercase"
          style={{ color: "var(--text-l3)" }}
        >
          Hearst · Home
        </p>
      </div>

      {/* Constellation area */}
      <div ref={areaRef} className="flex-1 min-h-0 relative">
        {geo && (
          <>
            {/* SVG line layer */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width="100%"
              height="100%"
              aria-hidden
            >
              {SIGNATURES.map((s, i) => {
                const p = geo.signatures[i];
                const active = hoveredKey === s.key;
                return (
                  <line
                    key={s.key}
                    x1={geo.cx}
                    y1={geo.cy}
                    x2={p.x}
                    y2={p.y}
                    stroke="var(--cykan)"
                    strokeWidth="1"
                    opacity={active ? 0.7 : 0.06}
                    style={{ transition: "opacity var(--duration-emphasis) var(--ease-out-soft)" }}
                  />
                );
              })}
              {SERVICES.map((s, i) => {
                const p = geo.services[i];
                const active = hoveredKey === s.key;
                return (
                  <line
                    key={s.key}
                    x1={geo.cx}
                    y1={geo.cy}
                    x2={p.x}
                    y2={p.y}
                    stroke="var(--cykan)"
                    strokeWidth="1"
                    opacity={active ? 0.5 : 0.04}
                    style={{ transition: "opacity var(--duration-emphasis) var(--ease-out-soft)" }}
                  />
                );
              })}
            </svg>

            {/* Halo core — centerpiece */}
            <div
              className="absolute"
              style={{
                left: geo.cx,
                top: geo.cy,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div className="halo-core" />
              <p
                className="absolute t-9 tracking-brand uppercase"
                style={{
                  color: "var(--text-l2)",
                  left: "50%",
                  top: "calc(100% + var(--space-3))",
                  transform: "translateX(-50%)",
                  whiteSpace: "nowrap",
                }}
              >
                Hearst
              </p>
            </div>

            {/* Inner orbit — signatures */}
            {SIGNATURES.map((s, i) => (
              <ConstellationLabel
                key={s.key}
                box={s}
                pos={geo.signatures[i]}
                variant="signature"
                hovered={hoveredKey === s.key}
                onHover={(h) => setHoveredKey(h ? s.key : null)}
                onClick={() => handleBoxClick(s)}
              />
            ))}

            {/* Outer orbit — services */}
            {SERVICES.map((s, i) => (
              <ConstellationLabel
                key={s.key}
                box={s}
                pos={geo.services[i]}
                variant="service"
                hovered={hoveredKey === s.key}
                onHover={(h) => setHoveredKey(h ? s.key : null)}
                onClick={() => handleBoxClick(s)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
