"use client";

/**
 * ReportLayout — rend un payload report (sortie de runReport) en grille 4 cols.
 *
 * Branchement Focal : FocalStage détecte `previewContent` parsable JSON avec
 * `__reportPayload: true` et délègue à ce composant.
 *
 * Layout : grid 4 colonnes (1 = quart, 2 = moitié, 4 = pleine), gap via tokens.
 * Cohérence Ghost Protocol : sections labelisées en mono uppercase, lignes 1px
 * sur surface-2, accent cyan pour les hover et titres section.
 *
 * Édition : si `spec` + `onSpecChange` sont fournis, un bouton "Éditer" en
 * header ouvre un panneau latéral droit (`ReportEditor`) qui permet de toggler
 * la visibilité, réordonner et reset les blocks. Les blocks marqués `hidden:true`
 * sont filtrés du rendu côté UI sans toucher aux données amont.
 */

import { useMemo, useState, useEffect, useCallback } from "react";
import type { ReportSpec } from "@/lib/reports/spec/schema";
import { ReportEditor } from "@/app/(user)/components/reports/ReportEditor";
import { ReportActions } from "@/app/(user)/components/ReportActions";
import { SourceCitation, type Source } from "@/app/(user)/components/SourceCitation";
import type { VersionSummary } from "@/lib/reports/versions/store";
import type { VersionDiff } from "@/lib/reports/versions/diff";
import { useReportsStore } from "@/stores/reports";
import { useSession, type SessionContextValue } from "next-auth/react";

/**
 * Wrapper sûr autour de useSession.
 * Si le composant est rendu hors d'un SessionProvider (preview, tests unitaires),
 * useSession throw. On l'attrape et on retourne null.
 */
function useSafeSession(): SessionContextValue["data"] {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data } = useSession();
    return data;
  } catch {
    return null;
  }
}
// Blocs légers — import statique, rendu immédiat
import { KpiTile } from "@/lib/reports/blocks/KpiTile";
import { Sparkline } from "@/lib/reports/blocks/Sparkline";
import { Bar } from "@/lib/reports/blocks/Bar";
import { Table } from "@/lib/reports/blocks/Table";
import { Funnel } from "@/lib/reports/blocks/Funnel";
import { Bullet, type BulletItem } from "@/lib/reports/blocks/Bullet";

// Blocs lourds — dynamic imports (lazy) + skeleton + types
import {
  BlockSkeleton,
  LazyWaterfall,
  LazyCohortTriangle,
  LazyHeatmap,
  LazySankey,
  LazyRadar,
  LazyGantt,
} from "@/lib/reports/blocks/lazy";
import type { WaterfallDatum } from "@/lib/reports/blocks/Waterfall";
import type { CohortRow } from "@/lib/reports/blocks/CohortTriangle";
import type { SankeyNode, SankeyLink } from "@/lib/reports/blocks/Sankey";
import type { RadarSeries } from "@/lib/reports/blocks/Radar";
import type { GanttRange, GanttTask } from "@/lib/reports/blocks/Gantt";
import { inferNumericField } from "@/lib/reports/blocks/infer";
import type { RenderPayload, RenderedBlock } from "@/lib/reports/engine/render-blocks";

export function isReportPayload(value: unknown): value is RenderPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "__reportPayload" in value &&
    (value as { __reportPayload: unknown }).__reportPayload === true
  );
}

interface ReportLayoutProps {
  payload: RenderPayload;
  /** Affichage optionnel d'un footer technique (timestamp, version). */
  showMeta?: boolean;
  /**
   * Spec source courant (optionnel). Si fourni avec `onSpecChange`, le bouton
   * "Éditer" du header ouvre le panneau ReportEditor et les blocks `hidden`
   * sont filtrés du rendu.
   */
  spec?: ReportSpec;
  /** Callback pour synchroniser le spec avec un parent contrôlé. */
  onSpecChange?: (spec: ReportSpec) => void;
  /**
   * Asset.id du report rendu (optionnel). Si fourni, affiche les boutons
   * "Exporter / Partager / Commenter" en header. Sinon, header vide.
   */
  assetId?: string | null;
  /** Titre suggéré pour l'export (sinon "report"). */
  assetTitle?: string;
  /**
   * Si `true`, masque les actions et passe en mode lecture seule (page publique).
   * Par défaut `false` (les actions sont visibles si assetId fourni).
   */
  readonly?: boolean;
}

export function ReportLayout({
  payload,
  showMeta = true,
  spec,
  onSpecChange,
  assetId,
  assetTitle,
  readonly = false,
}: ReportLayoutProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const editable = Boolean(spec && onSpecChange);

  // ── Realtime : subscribe à l'asset si assetId fourni ──────────────────────
  // useSession peut throw si pas de SessionProvider (preview, tests unitaires).
  // On l'attrape via un hook wrapper sûr pour ne pas casser ces contextes.
  const sessionData = useSafeSession();
  const tenantId = (sessionData?.user as { tenantId?: string } | undefined)?.tenantId ?? "";
  const { subscribeToReport, unsubscribeFromReport, liveReports } = useReportsStore();

  useEffect(() => {
    if (!assetId || !tenantId) return;
    subscribeToReport(assetId, tenantId);
    return () => {
      unsubscribeFromReport(assetId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, tenantId]);

  // Payload effectif : live si disponible et plus récent que l'initial
  const livePayload = assetId ? liveReports.get(assetId) : undefined;
  const effectivePayload =
    livePayload && livePayload.generatedAt > payload.generatedAt
      ? livePayload
      : payload;

  // Toast "Rapport rafraîchi" pendant 3s quand le live payload change
  const [showToast, setShowToast] = useState(false);
  const prevLiveGenAt = useMemo(() => livePayload?.generatedAt, [livePayload]);
  useEffect(() => {
    if (!livePayload) return;
    if (livePayload.generatedAt <= payload.generatedAt) return;
    const tShow = setTimeout(() => setShowToast(true), 0);
    const tHide = setTimeout(() => setShowToast(false), 3000);
    return () => { clearTimeout(tShow); clearTimeout(tHide); };
  // On surveille uniquement le generatedAt du livePayload
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevLiveGenAt]);

  // Set des ids hidden tirée du spec courant (si fourni). Les blocks sans entry
  // dans le spec restent visibles par défaut.
  const hiddenIds = useMemo(() => {
    if (!spec) return new Set<string>();
    return new Set(spec.blocks.filter((b) => b.hidden).map((b) => b.id));
  }, [spec]);

  // Ordre potentiellement remanié par l'éditeur : si spec fourni, on suit
  // l'ordre du spec en filtrant les hidden ; sinon on prend tel quel le payload.
  const orderedBlocks = useMemo(() => {
    if (!spec) return effectivePayload.blocks;
    const byId = new Map(effectivePayload.blocks.map((b) => [b.id, b]));
    const ordered = spec.blocks
      .filter((b) => !b.hidden)
      .map((b) => byId.get(b.id))
      .filter((b): b is RenderedBlock => Boolean(b));
    return ordered;
  }, [spec, effectivePayload.blocks]);

  const visibleBlocks = spec
    ? orderedBlocks
    : effectivePayload.blocks.filter((b) => !hiddenIds.has(b.id));

  // B4 — citations cliquables. Si le payload porte un champ `sources`
  // (extension douce, fail-soft), on wrap la grille dans SourceCitation
  // qui détecte les `<sup data-source-id="..."/>` rendus par les blocks.
  const reportSources: ReadonlyArray<Source> = useMemo(() => {
    const raw = (effectivePayload as unknown as { sources?: ReadonlyArray<Source> }).sources;
    return Array.isArray(raw) ? raw : [];
  }, [effectivePayload]);

  return (
    <div
      className="flex w-full"
      style={{ gap: "var(--space-4)" }}
      data-testid="report-layout"
    >
      <div className="flex flex-col flex-1 min-w-0">
        {/* Toast Realtime ─────────────────────────────────────────────── */}
        {showToast && (
          <div
            role="status"
            aria-live="polite"
            data-testid="report-realtime-toast"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              marginBottom: "var(--space-3)",
              padding: "var(--space-2) var(--space-4)",
              background: "color-mix(in srgb, var(--cykan) 12%, transparent)",
              border: "1px solid var(--cykan)",
              borderRadius: "var(--radius-xs)",
              transition: "opacity var(--duration-fast) var(--ease-standard)",
            }}
          >
            <span
              className="t-9 font-mono uppercase text-[var(--cykan)]"
              style={{ letterSpacing: "var(--tracking-display)" }}
            >
              Rapport rafraîchi automatiquement
            </span>
          </div>
        )}
        {(editable || (assetId && !readonly)) && (
          <div
            className="flex items-center justify-end"
            style={{ marginBottom: "var(--space-3)", gap: "var(--space-2)" }}
          >
            {assetId && !readonly && (
              <ReportActions reportId={assetId} title={assetTitle} />
            )}
            {assetId && !readonly && (
              <button
                type="button"
                onClick={() => { setHistoryOpen((v) => !v); setEditorOpen(false); }}
                data-testid="report-layout-history-toggle"
                aria-expanded={historyOpen}
                className="t-9 font-mono uppercase text-[var(--text-muted)] hover:text-[var(--cykan)]"
                style={{
                  letterSpacing: "var(--tracking-display)",
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--surface-2)",
                  borderRadius: "var(--radius-xs)",
                  background: "transparent",
                  transition: "color var(--duration-fast) var(--ease-standard)",
                }}
              >
                {historyOpen ? "Fermer" : "Historique"}
              </button>
            )}
            {editable && (
              <button
                type="button"
                onClick={() => { setEditorOpen((v) => !v); setHistoryOpen(false); }}
                data-testid="report-layout-edit-toggle"
                aria-expanded={editorOpen}
                className="t-9 font-mono uppercase text-[var(--text-muted)] hover:text-[var(--cykan)]"
                style={{
                  letterSpacing: "var(--tracking-display)",
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--surface-2)",
                  borderRadius: "var(--radius-xs)",
                  background: "transparent",
                  transition: "color var(--duration-fast) var(--ease-standard)",
                }}
              >
                {editorOpen ? "Fermer" : "Éditer"}
              </button>
            )}
          </div>
        )}

        <SourceCitation sources={reportSources}>
          <div
            className="grid w-full"
            style={{
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "var(--space-4)",
            }}
          >
            {visibleBlocks.map((block) => (
              <div
                key={block.id}
                style={{ gridColumn: `span ${block.layout.col}` }}
                className="flex flex-col"
              >
                {block.label && block.type !== "kpi" && (
                  <div
                    className="t-9 font-mono uppercase text-[var(--text-muted)]"
                    style={{
                      letterSpacing: "var(--tracking-display)",
                      marginBottom: "var(--space-3)",
                      paddingBottom: "var(--space-2)",
                      borderBottom: "1px solid var(--surface-2)",
                    }}
                  >
                    {block.label}
                  </div>
                )}
                <BlockRenderer block={block} />
              </div>
            ))}
          </div>
        </SourceCitation>

        {showMeta && (
          <div
            className="flex items-center"
            style={{
              gap: "var(--space-6)",
              marginTop: "var(--space-8)",
              paddingTop: "var(--space-4)",
              borderTop: "1px solid var(--surface-2)",
            }}
          >
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
              spec_v{effectivePayload.version}
            </span>
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
              generated_at: {fmtTimestamp(effectivePayload.generatedAt)}
            </span>
          </div>
        )}
      </div>

      {editable && editorOpen && spec && onSpecChange && (
        <div
          className="flex flex-col shrink-0"
          style={{ width: "var(--width-context)" }}
        >
          <ReportEditor
            spec={spec}
            onChange={onSpecChange}
            onClose={() => setEditorOpen(false)}
          />
        </div>
      )}

      {historyOpen && assetId && !readonly && (
        <div
          className="flex flex-col shrink-0"
          style={{ width: "var(--width-context)" }}
        >
          <VersionHistoryPanel
            assetId={assetId}
            currentPayload={payload}
            onClose={() => setHistoryOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function BlockRenderer({ block }: { block: RenderedBlock }) {
  const props = block.props ?? {};

  // Skeleton inline si le bloc n'a pas encore de données (rendu asynchrone futur).
  if (block.data === null || block.data === undefined) {
    return <BlockSkeleton testId={`block-skeleton-${block.id}`} />;
  }

  switch (block.type) {
    case "kpi":
      return (
        <KpiTile
          data={block.data as { value: unknown; delta?: unknown; sparkline?: ReadonlyArray<number> | null }}
          label={block.label ?? block.id}
          format={(props.format as "number" | "currency" | "percent") ?? "number"}
          currency={(props.currency as string) ?? "EUR"}
          suffix={props.suffix as string | undefined}
          compact={Boolean(props.compact)}
        />
      );

    case "sparkline": {
      const rows = block.data as ReadonlyArray<Record<string, unknown>>;
      const field = (props.field as string) ?? inferNumericField(rows[0]);
      const values = field
        ? rows.map((r) => Number(r[field])).filter((v) => Number.isFinite(v))
        : [];
      return (
        <Sparkline
          values={values}
          height={(props.height as number) ?? 64}
          tone={(props.tone as "cykan" | "warn" | "danger" | "muted") ?? "cykan"}
          label={block.label}
        />
      );
    }

    case "bar":
      return (
        <Bar
          data={block.data as ReadonlyArray<Record<string, unknown>>}
          labelField={props.labelField as string | undefined}
          valueField={props.valueField as string | undefined}
          limit={(props.limit as number) ?? 10}
          format={(props.format as "number" | "currency") ?? "number"}
          currency={(props.currency as string) ?? "EUR"}
          tone={(props.tone as "cykan" | "warn" | "danger" | "muted") ?? "cykan"}
          direction={(props.direction as "asc" | "desc" | "none") ?? "desc"}
        />
      );

    case "table":
      return (
        <Table
          data={block.data as ReadonlyArray<Record<string, unknown>>}
          columns={props.columns as ReadonlyArray<string> | undefined}
          labels={props.labels as Record<string, string> | undefined}
          formats={props.formats as Record<string, "number" | "currency" | "date" | "text"> | undefined}
          currency={(props.currency as string) ?? "EUR"}
          limit={(props.limit as number) ?? 50}
        />
      );

    case "funnel":
      return (
        <Funnel
          data={block.data as ReadonlyArray<Record<string, unknown>>}
          labelField={props.labelField as string | undefined}
          valueField={props.valueField as string | undefined}
          limit={(props.limit as number) ?? 7}
          tone={(props.tone as "cykan" | "warn") ?? "cykan"}
        />
      );

    case "waterfall":
      return (
        <LazyWaterfall
          data={(props.data as ReadonlyArray<WaterfallDatum>) ?? []}
          height={(props.height as number) ?? 240}
          format={(props.format as "number" | "currency") ?? "currency"}
          currency={(props.currency as string) ?? "EUR"}
        />
      );

    case "cohort_triangle":
      return (
        <LazyCohortTriangle
          cohorts={(props.cohorts as ReadonlyArray<CohortRow>) ?? []}
          periodPrefix={(props.periodPrefix as string) ?? "M"}
          asPercent={props.asPercent !== false}
        />
      );

    case "heatmap":
      return (
        <LazyHeatmap
          xLabels={(props.xLabels as ReadonlyArray<string>) ?? []}
          yLabels={(props.yLabels as ReadonlyArray<string>) ?? []}
          values={(props.values as ReadonlyArray<ReadonlyArray<number>>) ?? []}
          cellHeight={props.cellHeight as number | undefined}
          showValues={Boolean(props.showValues)}
        />
      );

    case "sankey":
      return (
        <LazySankey
          nodes={(props.nodes as ReadonlyArray<SankeyNode>) ?? []}
          links={(props.links as ReadonlyArray<SankeyLink>) ?? []}
          height={(props.height as number) ?? 280}
        />
      );

    case "bullet":
      return (
        <Bullet
          items={(props.items as ReadonlyArray<BulletItem>) ?? []}
          format={(props.format as "number" | "currency") ?? "number"}
          currency={(props.currency as string) ?? "EUR"}
        />
      );

    case "radar":
      return (
        <LazyRadar
          axes={(props.axes as ReadonlyArray<string>) ?? []}
          series={(props.series as ReadonlyArray<RadarSeries>) ?? []}
          height={(props.height as number) ?? 320}
          rings={props.rings as number | undefined}
        />
      );

    case "gantt":
      return (
        <LazyGantt
          range={(props.range as GanttRange) ?? { start: "", end: "" }}
          tasks={(props.tasks as ReadonlyArray<GanttTask>) ?? []}
          height={props.height as number | undefined}
        />
      );

    default:
      // Primitives V2/V3 pas encore implémentées — placeholder respectant la grille.
      return (
        <div
          className="flex items-center justify-center"
          style={{
            padding: "var(--space-6)",
            background: "var(--card-flat-bg)",
            border: "1px dashed var(--card-flat-border)",
            minHeight: "var(--space-12)",
          }}
        >
          <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)]">
            {block.type}_pending
          </span>
        </div>
      );
  }
}

function fmtTimestamp(ms: number): string {
  try {
    return new Date(ms).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function fmtIso(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

// ── VersionHistoryPanel ──────────────────────────────────────

interface VersionHistoryPanelProps {
  assetId: string;
  currentPayload: RenderPayload;
  onClose: () => void;
}

function VersionHistoryPanel({ assetId, onClose }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);
  const [diffs, setDiffs] = useState<VersionDiff[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${assetId}/versions?limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { versions: VersionSummary[] };
      setVersions(json.versions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    const run = async () => { await loadVersions(); };
    run().catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  const handleCompare = useCallback(async () => {
    if (compareA === null || compareB === null) return;
    const from = Math.min(compareA, compareB);
    const to = Math.max(compareA, compareB);
    setDiffLoading(true);
    setDiffs(null);
    try {
      const res = await fetch(`/api/reports/${assetId}/versions/diff?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { diffs: VersionDiff[] };
      setDiffs(json.diffs ?? []);
    } catch (e) {
      setDiffs([]);
      console.error("[VersionHistoryPanel] diff error:", e);
    } finally {
      setDiffLoading(false);
    }
  }, [assetId, compareA, compareB]);

  const handleRestore = useCallback(async (vn: number) => {
    setRestoring(vn);
    setRestoreMsg(null);
    try {
      const res = await fetch(`/api/reports/${assetId}/versions/${vn}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { version: VersionSummary };
      setRestoreMsg(`Version ${vn} restaurée → nouvelle v${json.version.versionNumber}`);
      void loadVersions();
    } catch (e) {
      setRestoreMsg(`Erreur : ${e instanceof Error ? e.message : "inconnue"}`);
    } finally {
      setRestoring(null);
    }
  }, [assetId, loadVersions]);

  return (
    <div
      className="flex flex-col"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        gap: "var(--space-3)",
        height: "100%",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ gap: "var(--space-2)" }}>
        <span
          className="t-9 font-mono uppercase text-[var(--text-muted)]"
          style={{ letterSpacing: "var(--tracking-display)" }}
        >
          Historique
        </span>
        <button
          type="button"
          onClick={onClose}
          className="t-9 font-mono uppercase text-[var(--text-faint)] hover:text-[var(--cykan)]"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            transition: "color var(--duration-fast) var(--ease-standard)",
          }}
        >
          ✕
        </button>
      </div>

      {/* États */}
      {loading && (
        <span className="t-9 font-mono text-[var(--text-faint)]">Chargement…</span>
      )}
      {error && (
        <span className="t-9 font-mono text-[var(--danger)]">{error}</span>
      )}
      {!loading && !error && versions.length === 0 && (
        <span className="t-9 font-mono text-[var(--text-faint)]">Aucune version enregistrée.</span>
      )}

      {/* Feedback restauration */}
      {restoreMsg && (
        <div
          className="t-9 font-mono text-[var(--cykan)]"
          style={{
            padding: "var(--space-2) var(--space-3)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-xs)",
          }}
        >
          {restoreMsg}
        </div>
      )}

      {/* Liste des versions */}
      {!loading && versions.length > 0 && (
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex flex-col"
              style={{
                padding: "var(--space-3)",
                background: "var(--card-flat-bg)",
                border: "1px solid var(--card-flat-border)",
                borderRadius: "var(--radius-xs)",
                gap: "var(--space-2)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="t-9 font-mono text-[var(--text-default)]"
                  style={{ letterSpacing: "var(--tracking-display)" }}
                >
                  v{v.versionNumber}
                </span>
                <span
                  className="t-9 font-mono uppercase text-[var(--text-faint)]"
                  style={{ letterSpacing: "var(--tracking-display)" }}
                >
                  {v.triggeredBy}
                </span>
              </div>
              <span className="t-9 font-mono text-[var(--text-muted)]">
                {fmtIso(v.createdAt)}
              </span>
              <span className="t-9 font-mono text-[var(--text-faint)]">
                {v.signalsCount} signal{v.signalsCount !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
                {/* Comparer */}
                <button
                  type="button"
                  onClick={() => {
                    if (compareA === null) { setCompareA(v.versionNumber); }
                    else if (compareB === null && v.versionNumber !== compareA) { setCompareB(v.versionNumber); }
                    else { setCompareA(v.versionNumber); setCompareB(null); setDiffs(null); }
                  }}
                  className="t-9 font-mono uppercase"
                  style={{
                    color: compareA === v.versionNumber || compareB === v.versionNumber
                      ? "var(--cykan)"
                      : "var(--text-muted)",
                    background: "transparent",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-xs)",
                    padding: "var(--space-1) var(--space-2)",
                    cursor: "pointer",
                    letterSpacing: "var(--tracking-display)",
                    transition: "color var(--duration-fast) var(--ease-standard)",
                  }}
                >
                  {compareA === v.versionNumber ? "A" : compareB === v.versionNumber ? "B" : "Comparer"}
                </button>
                {/* Restaurer */}
                <button
                  type="button"
                  onClick={() => void handleRestore(v.versionNumber)}
                  disabled={restoring === v.versionNumber}
                  className="t-9 font-mono uppercase text-[var(--text-muted)] hover:text-[var(--cykan)]"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-xs)",
                    padding: "var(--space-1) var(--space-2)",
                    cursor: restoring === v.versionNumber ? "not-allowed" : "pointer",
                    opacity: restoring === v.versionNumber ? 0.5 : 1,
                    letterSpacing: "var(--tracking-display)",
                    transition: "color var(--duration-fast) var(--ease-standard)",
                  }}
                >
                  {restoring === v.versionNumber ? "…" : "Restaurer"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comparer deux versions */}
      {compareA !== null && compareB !== null && (
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => void handleCompare()}
            disabled={diffLoading}
            className="t-9 font-mono uppercase text-[var(--text-muted)] hover:text-[var(--cykan)]"
            style={{
              background: "transparent",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-xs)",
              padding: "var(--space-2) var(--space-3)",
              cursor: diffLoading ? "not-allowed" : "pointer",
              opacity: diffLoading ? 0.6 : 1,
              letterSpacing: "var(--tracking-display)",
              transition: "color var(--duration-fast) var(--ease-standard)",
            }}
          >
            {diffLoading
              ? "Comparaison…"
              : `Comparer v${Math.min(compareA, compareB)} → v${Math.max(compareA, compareB)}`}
          </button>

          {diffs !== null && (
            <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
              {diffs.length === 0 ? (
                <span className="t-9 font-mono text-[var(--text-faint)]">Aucune différence détectée.</span>
              ) : (
                diffs.map((d, i) => (
                  <div
                    key={i}
                    className="flex flex-col"
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      background: "var(--card-flat-bg)",
                      border: "1px solid var(--card-flat-border)",
                      borderRadius: "var(--radius-xs)",
                      gap: "var(--space-1)",
                    }}
                  >
                    <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
                      <span
                        className="t-9 font-mono text-[var(--text-default)]"
                        style={{ letterSpacing: "var(--tracking-display)" }}
                      >
                        {d.blockRef}
                      </span>
                      <span
                        className="t-9 font-mono uppercase"
                        style={{
                          letterSpacing: "var(--tracking-display)",
                          color:
                            d.kind === "added" ? "var(--cykan)"
                            : d.kind === "removed" ? "var(--danger)"
                            : "var(--text-muted)",
                        }}
                      >
                        {d.kind}
                      </span>
                    </div>
                    {d.fieldPath && (
                      <span className="t-9 font-mono text-[var(--text-faint)]">
                        {d.fieldPath}: {String(d.before)} → {String(d.after)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
