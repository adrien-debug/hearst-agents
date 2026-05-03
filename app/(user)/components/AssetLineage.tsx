"use client";

/**
 * AssetLineage — Header de provenance pour un Asset V2.
 *
 * Lit `Asset.provenance` enrichi (B4) et expose :
 *  - run/mission qui a créé l'asset
 *  - sources URL (web search, scraping, asset parents)
 *  - modèle utilisé + coût + latence
 *  - mini-graph "lineage" si `derivedFrom` non vide
 *
 * Tokens design system uniquement, pas de magic numbers.
 * Fail-soft : si un champ est absent, on ne render pas la ligne.
 */

import { useMemo, useState } from "react";
import type { Asset } from "@/lib/assets/types";

interface AssetLineageProps {
  asset: Asset;
  onOpenParent?: (assetId: string) => void;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

function fmtCost(usd?: number): string {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.001) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtLatency(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export function AssetLineage({ asset, onOpenParent }: AssetLineageProps) {
  const [showSources, setShowSources] = useState(false);

  const hasAnyMeta = useMemo(() => {
    const prov = asset.provenance ?? {};
    const sources = prov.sourceUrls ?? [];
    const derived = prov.derivedFrom ?? [];
    return Boolean(
      prov.runId ||
        prov.missionId ||
        prov.modelUsed ||
        typeof prov.costUsd === "number" ||
        typeof prov.latencyMs === "number" ||
        sources.length > 0 ||
        derived.length > 0,
    );
  }, [asset]);

  if (!hasAnyMeta) {
    return (
      <div
        data-testid="asset-lineage"
        className="flex items-center"
        style={{
          padding: "var(--space-3) var(--space-4)",
          background: "var(--surface-1)",
          border: "1px dashed var(--border-shell)",
          borderRadius: "var(--radius-xs)",
          gap: "var(--space-2)",
          marginBottom: "var(--space-6)",
        }}
      >
        <span className="t-11 font-light text-[var(--text-faint)]">
          Provenance incomplète
        </span>
      </div>
    );
  }

  const prov = asset.provenance ?? {};
  const sources = prov.sourceUrls ?? [];
  const derived = prov.derivedFrom ?? [];

  return (
    <section
      data-testid="asset-lineage"
      aria-label="Provenance de l'asset"
      className="flex flex-col"
      style={{
        marginBottom: "var(--space-8)",
        padding: "var(--space-4) var(--space-5)",
        background: "var(--surface-1)",
        border: "1px solid var(--border-shell)",
        borderRadius: "var(--radius-md)",
        gap: "var(--space-3)",
      }}
    >
      <header className="flex items-center" style={{ gap: "var(--space-3)" }}>
        <span className="t-11 font-medium text-[var(--cykan)]">
          PROVENANCE
        </span>
        <span
          className="rounded-pill bg-[var(--text-ghost)]"
          style={{ width: "var(--space-1)", height: "var(--space-1)" }}
        />
        <span className="t-11 font-light text-[var(--text-faint)]">
          {DATE_FORMATTER.format(new Date(asset.createdAt))}
        </span>
      </header>

      <dl
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          columnGap: "var(--space-6)",
          rowGap: "var(--space-2)",
        }}
      >
        {prov.missionId && (
          <Row label="Mission" value={prov.missionId.slice(0, 8) + "…"} />
        )}
        {prov.runId && (
          <Row label="Run" value={prov.runId.slice(0, 8) + "…"} />
        )}
        {prov.modelUsed && <Row label="Modèle" value={prov.modelUsed} />}
        {typeof prov.costUsd === "number" && (
          <Row label="Coût" value={fmtCost(prov.costUsd)} accent />
        )}
        {typeof prov.latencyMs === "number" && (
          <Row label="Durée" value={fmtLatency(prov.latencyMs)} />
        )}
        {prov.providerId && prov.providerId !== "system" && (
          <Row label="Provider" value={prov.providerId} />
        )}
      </dl>

      {derived.length > 0 && (
        <div
          className="flex flex-col"
          style={{ gap: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--surface-2)" }}
        >
          <span className="t-11 font-light text-[var(--text-faint)]">
            Basé sur · {derived.length}
          </span>
          <div className="flex flex-wrap" style={{ gap: "var(--space-2)" }}>
            {derived.map((parentId) => (
              <button
                key={parentId}
                type="button"
                onClick={() => onOpenParent?.(parentId)}
                disabled={!onOpenParent}
                className="t-11 font-light text-[var(--text-muted)] hover:text-[var(--cykan)]"
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  background: "transparent",
                  border: "1px solid var(--border-shell)",
                  borderRadius: "var(--radius-xs)",
                  cursor: onOpenParent ? "pointer" : "default",
                  transition: "color var(--duration-fast) var(--ease-standard)",
                }}
                title={parentId}
              >
                {parentId.slice(0, 8)}
              </button>
            ))}
          </div>

          {derived.length > 0 && (
            <LineageMiniGraph
              currentTitle={asset.title}
              parentIds={derived}
              onOpenParent={onOpenParent}
            />
          )}
        </div>
      )}

      {sources.length > 0 && (
        <div
          className="flex flex-col"
          style={{ gap: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--surface-2)" }}
        >
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            className="flex items-center"
            style={{
              gap: "var(--space-2)",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
            aria-expanded={showSources}
            data-testid="asset-lineage-sources-toggle"
          >
            <span className="t-11 font-light text-[var(--text-faint)]">
              Sources · {sources.length}
            </span>
            <span className="t-11 font-medium text-[var(--cykan)]">
              {showSources ? "−" : "+"}
            </span>
          </button>
          {showSources && (
            <ul
              className="flex flex-col"
              style={{ gap: "var(--space-1)", paddingLeft: 0, listStyle: "none" }}
            >
              {sources.slice(0, 12).map((s, i) => (
                <li key={`${s.url}-${i}`}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="t-11 font-light text-[var(--text-muted)] hover:text-[var(--cykan)] truncate inline-block w-full"
                    style={{
                      transition: "color var(--duration-fast) var(--ease-standard)",
                    }}
                    title={s.url}
                  >
                    {s.label ?? s.url}
                  </a>
                </li>
              ))}
              {sources.length > 12 && (
                <li className="t-11 font-light text-[var(--text-faint)]">
                  + {sources.length - 12} autres
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
      <dt className="t-11 font-light text-[var(--text-faint)]">
        {label}
      </dt>
      <dd
        className={`t-11 ${accent ? "text-[var(--cykan)]" : "text-[var(--text-soft)]"} font-mono truncate`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

interface LineageMiniGraphProps {
  currentTitle: string;
  parentIds: string[];
  onOpenParent?: (assetId: string) => void;
}

function LineageMiniGraph({ currentTitle, parentIds, onOpenParent }: LineageMiniGraphProps) {
  // SVG simple : N parents (max 4 affichés) -> current.
  const parents = parentIds.slice(0, 4);
  const nodeWidth = 120;
  const nodeHeight = 28;
  const horizontalGap = 32;
  const totalWidth = nodeWidth + horizontalGap + nodeWidth;
  const verticalSpan = (parents.length - 1) * (nodeHeight + 12);
  const totalHeight = Math.max(nodeHeight, verticalSpan + nodeHeight);

  return (
    <div
      data-testid="asset-lineage-graph"
      className="overflow-x-auto"
      style={{ paddingTop: "var(--space-2)" }}
      aria-hidden
    >
      <svg
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        role="img"
        aria-label="Mini-graph de lineage"
      >
        {parents.map((pid, i) => {
          const yParent = i * (nodeHeight + 12);
          const xParent = 0;
          const xCurrent = nodeWidth + horizontalGap;
          const yCurrent = (totalHeight - nodeHeight) / 2;
          return (
            <g key={pid}>
              <line
                x1={xParent + nodeWidth}
                y1={yParent + nodeHeight / 2}
                x2={xCurrent}
                y2={yCurrent + nodeHeight / 2}
                stroke="var(--border-shell)"
                strokeWidth={1}
              />
              <g
                onClick={() => onOpenParent?.(pid)}
                style={{ cursor: onOpenParent ? "pointer" : "default" }}
              >
                <rect
                  x={xParent}
                  y={yParent}
                  width={nodeWidth}
                  height={nodeHeight}
                  fill="var(--surface-1)"
                  stroke="var(--border-shell)"
                  rx={4}
                />
                <text
                  x={xParent + nodeWidth / 2}
                  y={yParent + nodeHeight / 2 + 3}
                  fill="var(--text-muted)"
                  fontSize={10}
                  fontFamily="ui-monospace, monospace"
                  textAnchor="middle"
                >
                  {pid.slice(0, 8)}
                </text>
              </g>
            </g>
          );
        })}
        {/* Current node */}
        <g>
          <rect
            x={nodeWidth + horizontalGap}
            y={(totalHeight - nodeHeight) / 2}
            width={nodeWidth}
            height={nodeHeight}
            fill="var(--cykan-surface)"
            stroke="var(--cykan)"
            rx={4}
          />
          <text
            x={nodeWidth + horizontalGap + nodeWidth / 2}
            y={(totalHeight - nodeHeight) / 2 + nodeHeight / 2 + 3}
            fill="var(--cykan)"
            fontSize={10}
            fontFamily="ui-monospace, monospace"
            textAnchor="middle"
          >
            {currentTitle.slice(0, 14)}
          </text>
        </g>
      </svg>
    </div>
  );
}
