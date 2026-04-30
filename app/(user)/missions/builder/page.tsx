"use client";

/**
 * /missions/builder — Workflow Builder visuel (Mission Control C3).
 *
 * Layout :
 *   PageHeader (titre + breadcrumb)
 *   BuilderToolbar (templates / validate / preview / save)
 *   ┌──────────────┬───────────────────────────┬─────────────────┐
 *   │ NodePalette  │ WorkflowCanvas (Cytoscape)│ NodeConfigPanel │
 *   └──────────────┴───────────────────────────┴─────────────────┘
 *
 * Le graphe est une source de vérité React state local, sérialisé tel quel
 * lors du Save. Cytoscape gère uniquement le rendu — la mutation passe par
 * setGraph (immutable).
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../components/PageHeader";
import { NodePalette, type PaletteEntry } from "../../components/missions/builder/NodePalette";
import { NodeConfigPanel } from "../../components/missions/builder/NodeConfigPanel";
import { WorkflowCanvas } from "../../components/missions/builder/WorkflowCanvas";
import { BuilderToolbar } from "../../components/missions/builder/BuilderToolbar";
import { PublishTemplateModal } from "../../components/marketplace/PublishTemplateModal";
import {
  WORKFLOW_TEMPLATES,
  getTemplateById,
} from "@/lib/workflows/templates";
import { validateGraph } from "@/lib/workflows/validate";
import { createEmptyGraph } from "@/lib/workflows/types";
import type {
  WorkflowExecutorEvent,
  WorkflowGraph,
  WorkflowNode,
} from "@/lib/workflows/types";
import { toast } from "@/app/hooks/use-toast";

export default function WorkflowBuilderPage() {
  const router = useRouter();
  const [graph, setGraph] = useState<WorkflowGraph>(() => createEmptyGraph());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [missionName, setMissionName] = useState("Workflow personnalisé");
  const [showTemplates, setShowTemplates] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewSummary, setPreviewSummary] = useState<string | null>(null);
  const [validationCount, setValidationCount] = useState<number | undefined>(
    undefined,
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const [runStatus, setRunStatus] = useState<Map<string, NodeStatus>>(
    new Map(),
  );

  const selectedNode =
    graph.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleAddNode = useCallback((entry: PaletteEntry) => {
    setGraph((prev) => {
      const id = `${entry.kind}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const node: WorkflowNode = {
        id,
        kind: entry.kind,
        label: entry.label,
        config: entry.defaultConfig ?? {},
        position: {
          x: 200 + Math.floor(Math.random() * 200),
          y: 200 + Math.floor(Math.random() * 200),
        },
      };
      return { ...prev, nodes: [...prev.nodes, node] };
    });
  }, []);

  const handleConnect = useCallback((source: string, target: string) => {
    setGraph((prev) => {
      const id = `e_${source}_${target}_${Date.now()}`;
      const exists = prev.edges.some(
        (e) => e.source === source && e.target === target,
      );
      if (exists) return prev;
      return {
        ...prev,
        edges: [...prev.edges, { id, source, target }],
      };
    });
  }, []);

  const handleNodePatch = useCallback(
    (patch: Partial<WorkflowNode>) => {
      if (!selectedNodeId) return;
      setGraph((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === selectedNodeId ? { ...n, ...patch } : n,
        ),
      }));
    },
    [selectedNodeId],
  );

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    setGraph((prev) => {
      const isStart = prev.startNodeId === selectedNodeId;
      const remainingNodes = prev.nodes.filter((n) => n.id !== selectedNodeId);
      const remainingEdges = prev.edges.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      );
      const newStart =
        isStart && remainingNodes.length > 0
          ? remainingNodes[0].id
          : prev.startNodeId;
      return {
        ...prev,
        nodes: remainingNodes,
        edges: remainingEdges,
        startNodeId: newStart,
      };
    });
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  const handlePositionChange = useCallback(
    (id: string, position: { x: number; y: number }) => {
      setGraph((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === id ? { ...n, position } : n,
        ),
      }));
    },
    [],
  );

  const handleValidate = useCallback(() => {
    const validation = validateGraph(graph);
    setValidationCount(validation.errors.length);
    if (!validation.valid) {
      toast.error(
        "Graphe invalide",
        validation.errors.map((e) => e.message).join(" · "),
      );
      return;
    }
    toast.success("Graphe valide", `${graph.nodes.length} nodes`);
  }, [graph]);

  const handlePreview = useCallback(async () => {
    setIsPreviewing(true);
    setPreviewSummary(null);
    setRunStatus(new Map());
    try {
      const res = await fetch("/api/v2/workflows/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          "Preview impossible",
          (data?.message as string) ?? data?.error ?? `HTTP ${res.status}`,
        );
        return;
      }
      const events = (data.events as WorkflowExecutorEvent[]) ?? [];
      const status = new Map<string, NodeStatus>();
      for (const ev of events) {
        if (ev.type === "step_started")
          status.set(ev.nodeId, "running");
        else if (ev.type === "step_completed")
          status.set(ev.nodeId, "completed");
        else if (ev.type === "step_failed") status.set(ev.nodeId, "failed");
        else if (ev.type === "awaiting_approval")
          status.set(ev.nodeId, "awaiting_approval");
        else if (ev.type === "step_skipped") status.set(ev.nodeId, "skipped");
      }
      setRunStatus(status);
      setPreviewSummary(
        `Preview : ${data.result?.status ?? "?"} · ${
          data.result?.visitedCount ?? 0
        } nodes`,
      );
    } catch (err) {
      toast.error(
        "Erreur preview",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setIsPreviewing(false);
    }
  }, [graph]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const validation = validateGraph(graph);
      setValidationCount(validation.errors.length);
      if (!validation.valid) {
        toast.error(
          "Graphe invalide",
          validation.errors.map((e) => e.message).join(" · "),
        );
        return;
      }

      const res = await fetch("/api/v2/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: missionName,
          input: missionName,
          workflowGraph: graph,
          enabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          "Sauvegarde impossible",
          (data?.error as string) ?? `HTTP ${res.status}`,
        );
        return;
      }
      toast.success("Workflow sauvegardé", missionName);
      router.push("/missions");
    } catch (err) {
      toast.error(
        "Erreur sauvegarde",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setIsSaving(false);
    }
  }, [graph, missionName, router]);

  const handlePickTemplate = useCallback((id: string) => {
    const tpl = getTemplateById(id);
    if (!tpl) return;
    const built = tpl.build();
    setGraph(built);
    setMissionName(tpl.name);
    setSelectedNodeId(null);
    setShowTemplates(false);
    setPreviewSummary(null);
    setRunStatus(new Map());
    toast.info("Template chargé", tpl.name);
  }, []);

  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      style={{ background: "var(--bg)" }}
    >
      <PageHeader
        title="Workflow Builder"
        subtitle="Composer une mission multi-step visuellement"
        breadcrumb={[
          { label: "Hearst", href: "/" },
          { label: "Missions", href: "/missions" },
          { label: "Builder" },
        ]}
        actions={
          <input
            type="text"
            value={missionName}
            onChange={(e) => setMissionName(e.target.value)}
            placeholder="Nom de la mission"
            className="t-13 text-[var(--text)] bg-transparent rounded-md"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--border-soft)",
              minWidth: "240px",
            }}
          />
        }
      />

      <BuilderToolbar
        onOpenTemplates={() => setShowTemplates((v) => !v)}
        onValidate={handleValidate}
        onPreview={handlePreview}
        onSave={handleSave}
        onPublish={() => {
          const validation = validateGraph(graph);
          if (!validation.valid) {
            toast.error("Graphe invalide — corrige avant de publier.");
            return;
          }
          setPublishOpen(true);
        }}
        isBusy={isPreviewing || isSaving}
        saveLabel={isSaving ? "Sauvegarde…" : "Sauvegarder"}
        validationCount={validationCount}
        previewSummary={previewSummary}
      />

      {publishOpen && (
        <PublishTemplateModal
          open={publishOpen}
          kind="workflow"
          defaultTitle={missionName}
          payload={graph}
          onClose={() => setPublishOpen(false)}
          onPublished={() => {
            toast.success("Workflow publié au marketplace.");
          }}
        />
      )}

      {showTemplates && (
        <div
          className="flex border-b border-[var(--border-shell)]"
          style={{
            padding: "var(--space-3) var(--space-12)",
            gap: "var(--space-3)",
            background: "var(--surface-1)",
            flexWrap: "wrap",
          }}
        >
          {WORKFLOW_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handlePickTemplate(tpl.id)}
              className="flex flex-col text-left rounded-md hover:border-[var(--cykan)] transition-colors"
              style={{
                padding: "var(--space-3)",
                gap: "var(--space-1)",
                border: "1px solid var(--border-soft)",
                background: "var(--bg-rail)",
                minWidth: "240px",
              }}
            >
              <span className="t-13 text-[var(--text)]">{tpl.name}</span>
              <span className="t-9 text-[var(--text-muted)]">
                {tpl.description}
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        className="flex-1 grid min-h-0"
        style={{
          gridTemplateColumns: "240px 1fr 320px",
        }}
      >
        <NodePalette onAdd={handleAddNode} />
        <div
          className="min-h-0 overflow-hidden"
          style={{ borderLeft: "1px solid var(--border-shell)", borderRight: "1px solid var(--border-shell)" }}
        >
          <WorkflowCanvas
            graph={graph}
            selectedNodeId={selectedNodeId}
            onSelect={setSelectedNodeId}
            onConnect={handleConnect}
            onPositionChange={handlePositionChange}
            runStatus={runStatus}
          />
        </div>
        <NodeConfigPanel
          node={selectedNode}
          onChange={handleNodePatch}
          onDelete={handleDeleteNode}
        />
      </div>
    </div>
  );
}

type NodeStatus =
  | "running"
  | "completed"
  | "failed"
  | "awaiting_approval"
  | "skipped";
