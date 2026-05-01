"use client";

/**
 * WatchlistCard — Mini-KPI card pour le bandeau Watchlist du CockpitStage.
 *
 * Layout : label uppercase mono + valeur dominante + delta + sparkline SVG.
 * Quand `value === "—"` ou trend.length === 0 → affichage discret en mode
 * "no signal" (cf. data mock du founder MVP, sources Stripe/HubSpot pas
 * encore branchées).
 */

interface WatchlistCardProps {
  label: string;
  value: string;
  delta?: string | null;
  trend?: number[];
  /** Quand true : affiche un état "données indicatives" (mock). */
  isMock?: boolean;
  /**
   * Anomaly détectée vs baseline 7j (vague 9, action #3). Si présente, la
   * carte affiche un chip de sévérité + une ligne de narration causale.
   */
  anomaly?: {
    changePct: number;
    direction: "up" | "down";
    severity: "warning" | "critical";
    narration: string;
  } | null;
  onClick?: () => void;
}

export function WatchlistCard({
  label,
  value,
  delta,
  trend,
  isMock,
  anomaly,
  onClick,
}: WatchlistCardProps) {
  const hasTrend = (trend?.length ?? 0) >= 2;
  const isEmpty = value === "—" || value.trim().length === 0;

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="card-depth flex flex-col text-left w-full"
      style={{
        padding: "var(--space-5)",
        gap: "var(--space-4)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div className="flex items-center justify-between" style={{ gap: "var(--space-3)" }}>
        <span className="t-11 font-medium text-[var(--text-l2)]">
          {label}
        </span>
        {isMock && (
          <span className="t-9 font-light text-[var(--text-ghost)]">
            demo
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-between" style={{ gap: "var(--space-3)" }}>
        <span
          className="t-28"
          style={{
            fontWeight: 500,
            letterSpacing: "var(--tracking-tight)",
            color: isEmpty ? "var(--text-ghost)" : "var(--text-l0)",
          }}
        >
          {value}
        </span>
        {delta && (
          <span
            className="t-11 font-mono"
            style={{
              color: delta.startsWith("-") ? "var(--text-faint)" : "var(--cykan)",
            }}
          >
            {delta}
          </span>
        )}
      </div>

      <Sparkline points={trend ?? []} hasData={hasTrend} />

      {anomaly && anomaly.narration && (
        <AnomalyBanner
          changePct={anomaly.changePct}
          severity={anomaly.severity}
          narration={anomaly.narration}
        />
      )}
    </Wrapper>
  );
}

/**
 * AnomalyBanner — badge sévérité + 1 phrase narration. Affiché en bas de
 * carte quand l'anomaly est détectée. Couleur cykan pour warning, gold pour
 * critical (cohérent avec le langage HEARST OS — pas de rouge agressif).
 */
function AnomalyBanner({
  changePct,
  severity,
  narration,
}: {
  changePct: number;
  severity: "warning" | "critical";
  narration: string;
}) {
  const badgeColor =
    severity === "critical" ? "var(--gold)" : "var(--cykan)";
  const badgeBorder =
    severity === "critical" ? "var(--gold-border)" : "var(--cykan-border)";
  const badgeBg =
    severity === "critical" ? "var(--gold-surface)" : "var(--cykan-surface)";
  const sign = changePct > 0 ? "+" : "";
  return (
    <div
      className="flex flex-col"
      style={{
        gap: "var(--space-2)",
        marginTop: "var(--space-3)",
        paddingTop: "var(--space-3)",
        borderTop: "1px solid var(--border-shell)",
      }}
    >
      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <span
          className="t-9 font-medium"
          style={{
            color: badgeColor,
            background: badgeBg,
            border: `1px solid ${badgeBorder}`,
            borderRadius: "var(--radius-pill)",
            padding: "var(--space-1) var(--space-3)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {sign}
          {changePct.toFixed(1)}% · 7j
        </span>
      </div>
      <p
        className="t-11 font-light"
        style={{
          color: "var(--text-l2)",
          lineHeight: 1.45,
        }}
      >
        {narration}
      </p>
    </div>
  );
}

interface SparklineProps {
  points: number[];
  hasData: boolean;
}

/**
 * Sparkline SVG inline, viewBox 100x24. Stroke = cykan quand on a des
 * données, ghost line statique sinon (placeholder visuel discret).
 */
function Sparkline({ points, hasData }: SparklineProps) {
  if (!hasData) {
    return (
      <svg
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        style={{ width: "100%", height: "var(--space-6)" }}
        aria-hidden
      >
        <line
          x1="0"
          y1="12"
          x2="100"
          y2="12"
          stroke="var(--text-ghost)"
          strokeDasharray="2 4"
          strokeWidth="1"
        />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = 100 / (points.length - 1);

  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = 24 - ((p - min) / range) * 22 - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      style={{ width: "100%", height: "var(--space-6)" }}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke="var(--cykan)"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
