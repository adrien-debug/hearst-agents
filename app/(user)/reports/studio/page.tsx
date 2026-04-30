"use client";

/**
 * /reports/studio — Block editor visuel pour custom report specs.
 *
 * Layout 3 colonnes :
 *   - Gauche  : BlockPalette (palette des primitives)
 *   - Centre  : PreviewPane (preview live + sample run)
 *   - Droite  : SpecOutline (structure) + BlockConfigPanel (config block focusé)
 *
 * Top : StudioToolbar avec actions Save / Sample / Schedule / Share.
 *
 * Modes :
 *   - vierge (?clone= absent) : spec démarré avec un block KPI placeholder
 *   - clone (?clone=specId) : charge le spec catalog ou template puis clone
 *
 * Tokens uniquement, conforme CLAUDE.md.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type {
  ReportSpec,
  BlockSpec,
  PrimitiveKind,
} from "@/lib/reports/spec/schema";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";
import { BlockPalette } from "@/app/(user)/components/reports/studio/BlockPalette";
import { SpecOutline } from "@/app/(user)/components/reports/studio/SpecOutline";
import { BlockConfigPanel } from "@/app/(user)/components/reports/studio/BlockConfigPanel";
import { PreviewPane } from "@/app/(user)/components/reports/studio/PreviewPane";
import { StudioToolbar } from "@/app/(user)/components/reports/studio/StudioToolbar";
import { PublishTemplateModal } from "@/app/(user)/components/marketplace/PublishTemplateModal";

// ── Spec helpers ───────────────────────────────────────────

const DEFAULT_SCOPE = {
  tenantId: "studio-tenant",
  workspaceId: "studio-workspace",
  userId: "studio-user",
} as const;

function makeUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback minimal — non-cryptographique mais suffisant pour state local.
  return `00000000-0000-4000-8000-${Date.now().toString().padStart(12, "0")}`;
}

function makeBlankSpec(): ReportSpec {
  const now = Date.now();
  return {
    id: makeUuid(),
    version: 1,
    meta: {
      title: "Nouveau rapport",
      summary: "",
      domain: "founder",
      persona: "founder",
      cadence: "ad-hoc",
      confidentiality: "internal",
    },
    scope: DEFAULT_SCOPE,
    sources: [
      {
        id: "src_default",
        kind: "http",
        label: "Source HTTP",
        spec: { url: "https://example.com/data.json", method: "GET" },
      },
    ],
    transforms: [],
    blocks: [],
    refresh: { mode: "manual", cooldownHours: 0 },
    cacheTTL: { raw: 60, transform: 600, render: 3600 },
    createdAt: now,
    updatedAt: now,
  };
}

/** Génère un block placeholder pour un kind donné. */
function makeBlockOfKind(kind: PrimitiveKind, dataRef: string, index: number): BlockSpec {
  const id = `${kind}_${index}_${Math.floor(Math.random() * 10000)}`.replace(/-/g, "_");
  const base = {
    id,
    type: kind,
    label: `Nouveau ${kind}`,
    dataRef,
    layout: { col: 2 as const, row: 0 },
    props: {},
  } as BlockSpec;

  // Defaults par kind pour passer la validation Zod minimale au save.
  if (kind === "waterfall") {
    base.props = {
      data: [
        { label: "Début", value: 100, type: "start" },
        { label: "Δ A", value: 20, type: "delta" },
        { label: "Total", value: 120, type: "total" },
      ],
      format: "currency",
      currency: "EUR",
    };
  } else if (kind === "cohort_triangle") {
    base.props = {
      cohorts: [{ label: "M0", values: [100, 80, 60] }],
      periodPrefix: "M",
      asPercent: true,
    };
  } else if (kind === "heatmap") {
    base.props = {
      xLabels: ["Lun", "Mar", "Mer"],
      yLabels: ["AM", "PM"],
      values: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    };
  } else if (kind === "sankey") {
    base.props = {
      nodes: [
        { id: "src", label: "Source" },
        { id: "dst", label: "Destination" },
      ],
      links: [{ source: "src", target: "dst", value: 100 }],
    };
  } else if (kind === "bullet") {
    base.props = {
      items: [
        {
          label: "MRR",
          actual: 80,
          target: 100,
          ranges: { bad: 50, ok: 75, good: 100 },
        },
      ],
      format: "number",
      currency: "EUR",
    };
  } else if (kind === "radar") {
    base.props = {
      axes: ["Vitesse", "Qualité", "Coût"],
      series: [{ label: "Équipe", values: [80, 90, 60] }],
    };
  } else if (kind === "gantt") {
    base.props = {
      range: { start: "2026-05-01", end: "2026-06-30" },
      tasks: [],
    };
  }

  return base;
}

// ── Page ────────────────────────────────────────────────────

export default function ReportStudioPage() {
  return (
    <Suspense fallback={null}>
      <ReportStudioPageContent />
    </Suspense>
  );
}

function ReportStudioPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const cloneId = searchParams.get("clone");
  const editId = searchParams.get("edit");

  const [spec, setSpec] = useState<ReportSpec>(() => makeBlankSpec());
  const [savedSpecId, setSavedSpecId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [lastAssetId, setLastAssetId] = useState<string | null>(null);

  // Sample run state
  const [samplePayload, setSamplePayload] = useState<RenderPayload | null>(null);
  const [isSampling, setIsSampling] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);

  // Save state
  const [isSaving, setIsSaving] = useState(false);

  // Marketplace publish modal
  const [publishOpen, setPublishOpen] = useState(false);

  // Load mode (clone / edit)
  useEffect(() => {
    let cancelled = false;

    const loadFromSpec = async (id: string, mode: "clone" | "edit") => {
      try {
        // Tente d'abord le custom spec via /api/v2/reports/specs/[id]
        const res = await fetch(`/api/v2/reports/specs/${id}`);
        if (res.ok) {
          const json = await res.json();
          if (cancelled) return;
          const loaded = json.spec as ReportSpec;
          if (mode === "clone") {
            // Nouveau id, nouveau title.
            setSpec({
              ...loaded,
              id: makeUuid(),
              meta: { ...loaded.meta, title: `${loaded.meta.title} (copie)` },
            });
            setSavedSpecId(null);
          } else {
            setSpec(loaded);
            setSavedSpecId(id);
          }
          return;
        }
        // Fallback : peut-être un spec catalog (builtin) — on tente de charger
        // via /api/v2/reports/[specId]/run avec sample pour récupérer le spec
        // built côté serveur. Plus simple : proposer un placeholder à l'user.
        // V1 : on garde le spec vierge si not found.
      } catch {
        // ignore — placeholder vierge
      }
    };

    if (cloneId) void loadFromSpec(cloneId, "clone");
    else if (editId) void loadFromSpec(editId, "edit");

    return () => {
      cancelled = true;
    };
  }, [cloneId, editId]);

  // ── Handlers spec mutation ─────────────────────────────────

  const updateBlock = useCallback(
    (next: BlockSpec) => {
      setSpec((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === next.id ? next : b)),
      }));
    },
    [],
  );

  const addBlock = useCallback(
    (kind: PrimitiveKind) => {
      setSpec((prev) => {
        const dataRef =
          prev.transforms[0]?.id ?? prev.sources[0]?.id ?? "src_default";
        const newBlock = makeBlockOfKind(kind, dataRef, prev.blocks.length);
        return { ...prev, blocks: [...prev.blocks, newBlock] };
      });
    },
    [],
  );

  const removeBlock = useCallback(
    (blockId: string) => {
      setSpec((prev) => ({
        ...prev,
        blocks: prev.blocks.filter((b) => b.id !== blockId),
      }));
      setSelectedBlockId((cur) => (cur === blockId ? null : cur));
    },
    [],
  );

  const moveBlock = useCallback(
    (blockId: string, direction: -1 | 1) => {
      setSpec((prev) => {
        const idx = prev.blocks.findIndex((b) => b.id === blockId);
        if (idx === -1) return prev;
        const target = idx + direction;
        if (target < 0 || target >= prev.blocks.length) return prev;
        const next = [...prev.blocks];
        const [moved] = next.splice(idx, 1);
        next.splice(target, 0, moved);
        return { ...prev, blocks: next };
      });
    },
    [],
  );

  // ── Sample run ─────────────────────────────────────────────

  const handleSampleRun = useCallback(async () => {
    setIsSampling(true);
    setSampleError(null);
    try {
      // Si le spec n'a jamais été sauvegardé, on utilise l'endpoint sample
      // inline (pas de persistence asset). Sinon on garde le run normal pour
      // bénéficier du cache render et lier un assetId.
      const url = savedSpecId
        ? `/api/v2/reports/${savedSpecId}/run`
        : `/api/v2/reports/specs/sample`;
      const body = savedSpecId
        ? JSON.stringify({ sample: true })
        : JSON.stringify({ spec });
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setSamplePayload(json.payload as RenderPayload);
      if (json.assetId) setLastAssetId(json.assetId);
    } catch (e) {
      setSampleError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setIsSampling(false);
    }
  }, [savedSpecId, spec]);

  // ── Save ───────────────────────────────────────────────────

  const handleSave = useCallback(
    async (name: string, description?: string) => {
      setIsSaving(true);
      try {
        const sealedSpec = {
          ...spec,
          meta: { ...spec.meta, title: name, summary: description ?? spec.meta.summary },
        };
        const url = savedSpecId
          ? `/api/v2/reports/specs/${savedSpecId}`
          : `/api/v2/reports/specs`;
        const method = savedSpecId ? "PATCH" : "POST";
        const body = savedSpecId
          ? { name, description, spec: sealedSpec }
          : { name, description, spec: sealedSpec };
        const res = await fetch(url, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const id = json.template?.id ?? savedSpecId;
        if (id) {
          setSavedSpecId(id);
          setSpec(sealedSpec);
        }
        return id ? { id } : null;
      } catch {
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [spec, savedSpecId],
  );

  // ── Schedule ───────────────────────────────────────────────

  const handleSchedule = useCallback(
    async (cron: string) => {
      if (!savedSpecId) return false;
      try {
        const res = await fetch(`/api/v2/missions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: `Routine — ${spec.meta.title}`,
            input: `Run report ${savedSpecId}`,
            schedule: cron,
            enabled: true,
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [savedSpecId, spec.meta.title],
  );

  // ── Share ──────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    if (!lastAssetId) return null;
    try {
      const res = await fetch(`/api/reports/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetId: lastAssetId, ttlHours: 168 }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.shareUrl ? { url: json.shareUrl as string } : null;
    } catch {
      return null;
    }
  }, [lastAssetId]);

  const selectedBlock = useMemo(
    () => spec.blocks.find((b) => b.id === selectedBlockId) ?? null,
    [spec.blocks, selectedBlockId],
  );

  return (
    <div
      data-testid="studio-page"
      className="flex flex-col flex-1 min-h-0"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      {/* Top toolbar */}
      <div style={{ position: "relative" }}>
        <StudioToolbar
          spec={spec}
          savedSpecId={savedSpecId}
          onSave={handleSave}
          onSampleRun={handleSampleRun}
          onSchedule={handleSchedule}
          onShare={lastAssetId ? handleShare : undefined}
          onPublishMarketplace={() => setPublishOpen(true)}
          isSaving={isSaving}
          isSampling={isSampling}
        />
        {publishOpen && (
          <PublishTemplateModal
            open={publishOpen}
            kind="report_spec"
            defaultTitle={spec.meta.title}
            defaultDescription={spec.meta.summary}
            payload={spec}
            onClose={() => setPublishOpen(false)}
            onPublished={() => {
              setPublishOpen(false);
            }}
          />
        )}
      </div>

      {/* Mobile fallback — 3-col layout pas adaptable < lg.
          On guide l'utilisateur vers un environnement desktop. */}
      <div
        className="flex-1 lg:hidden flex items-center justify-center"
        style={{ padding: "var(--space-8)" }}
      >
        <div
          className="flex flex-col items-center text-center"
          style={{
            gap: "var(--space-3)",
            maxWidth: "var(--width-actions)",
            padding: "var(--space-8)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-1)",
          }}
        >
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
            Vue desktop
          </span>
          <h2 className="t-15 text-[var(--text)]">
            Report Studio optimisé pour ordinateur
          </h2>
          <p className="t-13 text-[var(--text-muted)]">
            Le block editor utilise un layout 3 colonnes (palette / preview /
            config). Ouvre Report Studio sur ordinateur pour la meilleure
            expérience.
          </p>
        </div>
      </div>

      {/* 3-column layout */}
      <div
        className="hidden lg:flex flex-1 min-h-0"
        style={{ background: "var(--bg)" }}
      >
        {/* Left : palette */}
        <div style={{ width: "var(--space-32)", flexShrink: 0 }}>
          <BlockPalette onAdd={addBlock} />
        </div>

        {/* Center : preview */}
        <div className="flex-1 flex flex-col min-w-0">
          <PreviewPane
            spec={spec}
            samplePayload={samplePayload}
            isSampling={isSampling}
            sampleError={sampleError}
          />
        </div>

        {/* Right : outline + config */}
        <div
          className="flex flex-col"
          style={{
            width: "var(--space-32)",
            flexShrink: 0,
            borderLeft: "1px solid var(--border-default)",
          }}
        >
          <div style={{ flex: "0 0 40%", overflow: "hidden", borderBottom: "1px solid var(--border-subtle)" }}>
            <SpecOutline
              blocks={spec.blocks}
              selectedBlockId={selectedBlockId ?? undefined}
              onSelect={setSelectedBlockId}
              onMove={moveBlock}
              onRemove={removeBlock}
              onDropKind={addBlock}
            />
          </div>
          <div style={{ flex: "1 1 60%", overflow: "hidden" }}>
            <BlockConfigPanel
              block={selectedBlock}
              sources={spec.sources}
              transforms={spec.transforms}
              onChange={updateBlock}
            />
          </div>
        </div>
      </div>

      {/* Footer link back */}
      <div
        style={{
          padding: "var(--space-2) var(--space-4)",
          background: "var(--surface-card)",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/reports")}
          className="t-9 font-mono uppercase transition-colors"
          style={{
            color: "var(--text-muted)",
            background: "transparent",
            letterSpacing: "var(--tracking-display)",
          }}
        >
          ← Retour au catalogue
        </button>
      </div>
    </div>
  );
}
