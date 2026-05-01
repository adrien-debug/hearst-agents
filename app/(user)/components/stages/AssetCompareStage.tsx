"use client";

/**
 * AssetCompareStage — Compare 2 assets côte-à-côte.
 *
 * Layout split 50/50 : Asset A | Asset B. Chaque colonne montre titre +
 * lineage compact + body texte tronqué. Header global propose un bouton
 * "Diff sémantique" qui POST /api/v2/assets/diff et affiche la synthèse
 * des différences sous le split.
 *
 * Activé via `useStageStore.setMode({ mode: "asset_compare", assetIdA,
 * assetIdB })` — typiquement déclenché par le Commandeur.
 */

import { useEffect, useState } from "react";
import { useStageStore } from "@/stores/stage";
import type { Asset } from "@/lib/assets/types";
import { AssetLineage } from "../AssetLineage";
import { Action } from "../ui";

interface AssetCompareStageProps {
  assetIdA: string;
  assetIdB: string;
}

interface DiffResult {
  summary: string;
  differences: Array<{ kind: string; description: string }>;
}

export function AssetCompareStage({ assetIdA, assetIdB }: AssetCompareStageProps) {
  const back = useStageStore((s) => s.back);
  const setMode = useStageStore((s) => s.setMode);
  const [assetA, setAssetA] = useState<Asset | null>(null);
  const [assetB, setAssetB] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset intentionnel avant fetch : nécessaire pour afficher le loading au changement d'assetIds
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/v2/assets/${encodeURIComponent(assetIdA)}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/v2/assets/${encodeURIComponent(assetIdB)}`, { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([a, b]) => {
        if (cancelled) return;
        if (!a?.asset || !b?.asset) {
          setError("Un des assets est introuvable");
          return;
        }
        setAssetA(a.asset as Asset);
        setAssetB(b.asset as Asset);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur de chargement");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetIdA, assetIdB]);

  const handleDiff = async () => {
    setDiffLoading(true);
    setDiffError(null);
    setDiff(null);
    try {
      const res = await fetch("/api/v2/assets/diff", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIdA, assetIdB }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDiffError(data?.message ?? data?.error ?? `HTTP ${res.status}`);
        return;
      }
      setDiff(data as DiffResult);
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setDiffLoading(false);
    }
  };

  const openParent = (assetId: string) => {
    setMode({ mode: "asset", assetId });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg-center)" }}>
      {/* Header */}
      <div
        className="flex items-center"
        style={{
          padding: "var(--space-4) var(--space-6)",
          borderBottom: "1px solid var(--border-shell)",
          gap: "var(--space-4)",
        }}
      >
        <button
          type="button"
          onClick={back}
          className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--cykan)]"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          ← Retour
        </button>
        <span className="t-11 font-medium text-[var(--cykan)]">
          COMPARER ASSETS
        </span>
        <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
        <span className="t-11 font-light text-[var(--text-muted)]">
          {assetIdA.slice(0, 8)} ↔ {assetIdB.slice(0, 8)}
        </span>
        <Action
          variant="primary"
          tone="brand"
          size="sm"
          onClick={() => void handleDiff()}
          disabled={loading || !assetA || !assetB}
          loading={diffLoading}
          className="ml-auto"
          testId="asset-compare-diff-btn"
        >
          Diff sémantique
        </Action>
      </div>

      {error && (
        <div
          style={{
            padding: "var(--space-4)",
            borderLeft: "2px solid var(--danger)",
            background: "var(--surface-1)",
            margin: "var(--space-4) var(--space-6)",
          }}
        >
          <p className="t-11 font-medium text-[var(--danger)]">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center" style={{ padding: "var(--space-12)" }}>
          <span className="t-11 font-light text-[var(--text-faint)]">
            Chargement…
          </span>
        </div>
      )}

      {!loading && assetA && assetB && (
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: "var(--space-6)" }}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--space-6)",
              marginBottom: "var(--space-8)",
            }}
            data-testid="asset-compare-grid"
          >
            <ComparePane asset={assetA} onOpenParent={openParent} side="A" />
            <ComparePane asset={assetB} onOpenParent={openParent} side="B" />
          </div>

          {diffError && (
            <div
              style={{
                padding: "var(--space-4)",
                borderLeft: "2px solid var(--danger)",
                background: "var(--surface-1)",
                marginBottom: "var(--space-6)",
              }}
            >
              <p className="t-11 font-medium text-[var(--danger)]">
                {diffError}
              </p>
            </div>
          )}

          {diff && (
            <div
              data-testid="asset-compare-diff"
              className="flex flex-col"
              style={{
                padding: "var(--space-5) var(--space-6)",
                background: "var(--surface-1)",
                border: "1px solid var(--cykan)",
                borderRadius: "var(--radius-md)",
                gap: "var(--space-4)",
              }}
            >
              <header className="flex items-center" style={{ gap: "var(--space-3)" }}>
                <span className="t-11 font-medium text-[var(--cykan)]">
                  DIFF · {diff.differences.length}
                </span>
              </header>
              <p className="t-13 font-light text-[var(--text)] leading-relaxed">
                {diff.summary}
              </p>
              <ul className="flex flex-col" style={{ gap: "var(--space-2)", listStyle: "none", paddingLeft: 0 }}>
                {diff.differences.map((d, i) => (
                  <li
                    key={i}
                    className="flex"
                    style={{
                      gap: "var(--space-3)",
                      padding: "var(--space-2) var(--space-3)",
                      background: "var(--bg-elev)",
                      border: "1px solid var(--surface-2)",
                      borderRadius: "var(--radius-xs)",
                    }}
                  >
                    <span className="t-11 font-medium text-[var(--cykan)] shrink-0">
                      {d.kind}
                    </span>
                    <span className="t-11 font-light text-[var(--text-soft)]">
                      {d.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComparePane({
  asset,
  onOpenParent,
  side,
}: {
  asset: Asset;
  onOpenParent: (assetId: string) => void;
  side: "A" | "B";
}) {
  return (
    <div
      data-testid={`asset-compare-pane-${side}`}
      className="flex flex-col"
      style={{
        padding: "var(--space-5)",
        background: "var(--surface-1)",
        border: "1px solid var(--border-shell)",
        borderRadius: "var(--radius-md)",
        gap: "var(--space-3)",
      }}
    >
      <span className="t-11 font-medium text-[var(--cykan)]">
        ASSET {side}
      </span>
      <h2
        className="t-15 font-medium tracking-tight text-[var(--text)]"
        style={{ marginBottom: "var(--space-2)" }}
      >
        {asset.title}
      </h2>
      <AssetLineage asset={asset} onOpenParent={onOpenParent} />
      <div
        className="overflow-y-auto"
        style={{
          maxHeight: "var(--space-32)",
          padding: "var(--space-3)",
          background: "var(--bg-elev)",
          border: "1px solid var(--surface-2)",
          borderRadius: "var(--radius-xs)",
        }}
      >
        <pre className="t-11 font-mono text-[var(--text-muted)]" style={{ whiteSpace: "pre-wrap" }}>
          {(asset.contentRef ?? asset.summary ?? "Aucun contenu").slice(0, 4000)}
        </pre>
      </div>
    </div>
  );
}
