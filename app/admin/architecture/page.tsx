"use client";

import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────

type NodeStatus = "active" | "beta" | "planned" | "deprecated";
type NodeCategory = "ui_surface" | "agent" | "runtime" | "persistence" | "connector";

interface GraphNode {
  id: string;
  label: string;
  role: string;
  category: NodeCategory;
  status: NodeStatus;
  critical: boolean;
  metadata: Record<string, unknown>;
  upstream: string[];
  downstream: string[];
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

interface AgentData {
  id: string;
  label: string;
  role: string;
  group: string;
  context: string;
  backends: string[];
  tools: string[];
  status: NodeStatus;
}

interface FlowData {
  id: string;
  label: string;
  description: string;
  steps: string[];
}

interface ArchData {
  meta: { title: string; version: string; updated: string };
  nodes: GraphNode[];
  edges: GraphEdge[];
  flows: FlowData[];
  agents: AgentData[];
  raw: unknown;
}

type Tab = "system" | "agents" | "flows" | "dependencies" | "raw";

// ── Status helpers ─────────────────────────────────────────

const STATUS_COLOR: Record<NodeStatus, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  beta: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  planned: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  deprecated: "bg-red-500/20 text-red-400 border-red-500/30",
};

const CATEGORY_LABEL: Record<NodeCategory, string> = {
  ui_surface: "UI Surface",
  agent: "Agent",
  runtime: "Runtime",
  persistence: "Persistence",
  connector: "Connector",
};

const CATEGORY_COLOR: Record<NodeCategory, string> = {
  ui_surface: "border-l-cyan-500",
  agent: "border-l-violet-500",
  runtime: "border-l-amber-500",
  persistence: "border-l-emerald-500",
  connector: "border-l-rose-500",
};

function StatusBadge({ status }: { status: NodeStatus }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[status]}`}>
      {status}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function ArchitecturePage() {
  const [data, setData] = useState<ArchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("system");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v2/architecture")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const nodeMap = new Map((data?.nodes ?? []).map((n) => [n.id, n]));
  const selectedNode = selected ? nodeMap.get(selected) ?? null : null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "system", label: "System" },
    { id: "agents", label: "Agents" },
    { id: "flows", label: "Flows" },
    { id: "dependencies", label: "Dependencies" },
    { id: "raw", label: "Source" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/50 px-6 py-5">
        <h1 className="text-lg font-semibold text-zinc-100">Architecture Map</h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Living system graph of HEARST OS
          {data?.meta && (
            <span className="ml-2 text-zinc-700">
              v{data.meta.version} · {data.meta.updated}
            </span>
          )}
        </p>
      </header>

      {/* Tabs */}
      <nav className="flex gap-0.5 border-b border-zinc-800/50 px-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-cyan-500 text-cyan-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex">
        <div className="flex-1 overflow-y-auto p-6" style={{ maxHeight: "calc(100vh - 130px)" }}>
          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <ErrorState message={error} />
          ) : !data ? (
            <ErrorState message="Architecture map unavailable" />
          ) : (
            <>
              {tab === "system" && <SystemView nodes={data.nodes} onSelect={setSelected} selected={selected} />}
              {tab === "agents" && <AgentsView agents={data.agents} onSelect={setSelected} selected={selected} />}
              {tab === "flows" && <FlowsView flows={data.flows} nodeMap={nodeMap} onSelect={setSelected} selected={selected} />}
              {tab === "dependencies" && <DependenciesView nodes={data.nodes} onSelect={setSelected} selected={selected} />}
              {tab === "raw" && <RawView raw={data.raw} />}
            </>
          )}
        </div>

        {/* Detail Panel */}
        <aside className="hidden w-[320px] shrink-0 border-l border-zinc-800/50 lg:block" style={{ maxHeight: "calc(100vh - 130px)", overflowY: "auto" }}>
          {selectedNode ? (
            <DetailPanel node={selectedNode} nodeMap={nodeMap} />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-xs text-zinc-600">Select a node to inspect</p>
            </div>
          )}
        </aside>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800/30 px-6 py-2">
        <p className="text-[10px] text-zinc-700">
          Generated from docs/architecture-map.json
        </p>
      </footer>
    </div>
  );
}

// ── System View ────────────────────────────────────────────

function SystemView({ nodes, onSelect, selected }: { nodes: GraphNode[]; onSelect: (id: string) => void; selected: string | null }) {
  const categories: NodeCategory[] = ["ui_surface", "agent", "runtime", "persistence", "connector"];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      {categories.map((cat) => {
        const catNodes = nodes.filter((n) => n.category === cat);
        return (
          <div key={cat}>
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {CATEGORY_LABEL[cat]}
              <span className="ml-1.5 text-zinc-700">{catNodes.length}</span>
            </h3>
            <div className="space-y-1.5">
              {catNodes.map((n) => (
                <NodeCard key={n.id} node={n} onClick={() => onSelect(n.id)} isSelected={selected === n.id} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Agents View ────────────────────────────────────────────

const AGENT_GROUP_LABEL: Record<string, string> = {
  operational: "Operational",
  research: "Research & Analysis",
  general: "General",
};

function AgentsView({ agents, onSelect, selected }: { agents: AgentData[]; onSelect: (id: string) => void; selected: string | null }) {
  const groups = new Map<string, AgentData[]>();
  for (const a of agents) {
    const list = groups.get(a.group) ?? [];
    list.push(a);
    groups.set(a.group, list);
  }

  return (
    <div className="space-y-8">
      {Array.from(groups.entries()).map(([group, groupAgents]) => (
        <div key={group}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {AGENT_GROUP_LABEL[group] ?? group}
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groupAgents.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className={`rounded-lg border border-l-4 p-4 text-left transition-colors ${
                  selected === a.id
                    ? "border-cyan-500/50 border-l-violet-500 bg-zinc-900/80"
                    : "border-zinc-800/50 border-l-violet-500/50 bg-zinc-900/40 hover:bg-zinc-900/60"
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-200">{a.label}</span>
                  <StatusBadge status={a.status} />
                </div>
                <p className="mb-2 text-[11px] text-zinc-500">{a.role}</p>
                <div className="flex flex-wrap gap-1">
                  <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9px] text-zinc-500">
                    ctx: {a.context}
                  </span>
                  {a.backends.map((b) => (
                    <span key={b} className="rounded bg-zinc-800/60 px-1.5 py-0.5 text-[9px] text-zinc-600">{b}</span>
                  ))}
                </div>
                {a.tools.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.tools.slice(0, 4).map((t) => (
                      <span key={t} className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-400/70">{t}</span>
                    ))}
                    {a.tools.length > 4 && (
                      <span className="text-[9px] text-zinc-600">+{a.tools.length - 4}</span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Flows View ─────────────────────────────────────────────

function FlowsView({ flows, nodeMap, onSelect, selected }: { flows: FlowData[]; nodeMap: Map<string, GraphNode>; onSelect: (id: string) => void; selected: string | null }) {
  return (
    <div className="space-y-6">
      {flows.map((flow) => (
        <div key={flow.id} className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4">
          <h3 className="text-sm font-medium text-zinc-200">{flow.label}</h3>
          <p className="mb-3 text-[11px] text-zinc-500">{flow.description}</p>
          <div className="flex flex-wrap items-center gap-1">
            {flow.steps.map((stepId, i) => {
              const node = nodeMap.get(stepId);
              const isDeprecated = node?.status === "deprecated";
              const isCritical = node?.critical;
              return (
                <div key={`${flow.id}-${stepId}`} className="flex items-center gap-1">
                  <button
                    onClick={() => onSelect(stepId)}
                    className={`rounded px-2.5 py-1.5 text-[11px] transition-colors ${
                      selected === stepId ? "bg-cyan-500/20 text-cyan-400" :
                      isDeprecated ? "bg-red-500/10 text-red-400/70 line-through" :
                      isCritical ? "bg-amber-500/10 text-amber-300" :
                      "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    {node?.label ?? stepId}
                  </button>
                  {i < flow.steps.length - 1 && (
                    <span className="text-[10px] text-zinc-700">→</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Dependencies View ──────────────────────────────────────

function DependenciesView({ nodes, onSelect, selected }: { nodes: GraphNode[]; onSelect: (id: string) => void; selected: string | null }) {
  const critical = nodes.filter((n) => n.critical || n.downstream.length > 2);
  const sorted = [...critical].sort((a, b) => b.downstream.length - a.downstream.length);

  return (
    <div className="space-y-1">
      <div className="mb-4 grid grid-cols-[1fr_80px_80px_80px_100px] gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        <span>Component</span>
        <span className="text-center">Status</span>
        <span className="text-center">Upstream</span>
        <span className="text-center">Downstream</span>
        <span className="text-center">Critical</span>
      </div>
      {sorted.map((n) => (
        <button
          key={n.id}
          onClick={() => onSelect(n.id)}
          className={`grid w-full grid-cols-[1fr_80px_80px_80px_100px] items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
            selected === n.id ? "bg-zinc-800/80" : "hover:bg-zinc-900/40"
          }`}
        >
          <div>
            <span className="text-xs text-zinc-300">{n.label}</span>
            <span className="ml-2 text-[10px] text-zinc-600">{CATEGORY_LABEL[n.category]}</span>
          </div>
          <div className="text-center"><StatusBadge status={n.status} /></div>
          <div className="text-center text-xs text-zinc-500">{n.upstream.length}</div>
          <div className="text-center text-xs text-zinc-500">{n.downstream.length}</div>
          <div className="text-center">
            {n.critical && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">critical</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Raw View ───────────────────────────────────────────────

function RawView({ raw }: { raw: unknown }) {
  return (
    <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Source — docs/architecture-map.json
      </h3>
      <pre className="max-h-[70vh] overflow-auto text-[11px] leading-relaxed text-zinc-400">
        {JSON.stringify(raw, null, 2)}
      </pre>
    </div>
  );
}

// ── Detail Panel ───────────────────────────────────────────

function DetailPanel({ node, nodeMap }: { node: GraphNode; nodeMap: Map<string, GraphNode> }) {
  return (
    <div className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-zinc-200">{node.label}</h3>
        <p className="mt-0.5 text-[11px] text-zinc-500">{node.role}</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge status={node.status} />
        <span className={`inline-block rounded border border-zinc-700/50 bg-zinc-800/50 px-1.5 py-0.5 text-[10px] text-zinc-400`}>
          {CATEGORY_LABEL[node.category]}
        </span>
        {node.critical && (
          <span className="rounded border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">
            critical
          </span>
        )}
      </div>

      {/* Downstream */}
      <Section title="Connects to" items={node.downstream} nodeMap={nodeMap} />

      {/* Upstream */}
      <Section title="Connected from" items={node.upstream} nodeMap={nodeMap} />

      {/* Impact */}
      <div className="mt-5 rounded-lg border border-zinc-800/40 bg-zinc-900/30 p-3">
        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Impact if changed
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-200">{node.downstream.length}</div>
            <div className="text-[10px] text-zinc-600">downstream</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-zinc-200">{node.upstream.length}</div>
            <div className="text-[10px] text-zinc-600">upstream</div>
          </div>
        </div>
      </div>

      {/* Metadata */}
      {Object.keys(node.metadata).length > 0 && (
        <div className="mt-5">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Metadata
          </h4>
          <div className="space-y-1">
            {Object.entries(node.metadata).map(([k, v]) => (
              <div key={k} className="flex items-start gap-2 text-[11px]">
                <span className="shrink-0 text-zinc-600">{k}:</span>
                <span className="text-zinc-400">
                  {Array.isArray(v) ? v.join(", ") : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, items, nodeMap }: { title: string; items: string[]; nodeMap: Map<string, GraphNode> }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {title}
        <span className="ml-1 text-zinc-700">{items.length}</span>
      </h4>
      <div className="space-y-0.5">
        {items.map((id) => {
          const n = nodeMap.get(id);
          return (
            <div key={id} className="flex items-center gap-2 rounded px-2 py-1 text-[11px]">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${n?.status === "deprecated" ? "bg-red-400" : n?.critical ? "bg-amber-400" : "bg-zinc-600"}`} />
              <span className={n?.status === "deprecated" ? "text-red-400/70 line-through" : "text-zinc-400"}>
                {n?.label ?? id}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Node Card ──────────────────────────────────────────────

function NodeCard({ node, onClick, isSelected }: { node: GraphNode; onClick: () => void; isSelected: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border border-l-4 px-3 py-2 text-left transition-colors ${CATEGORY_COLOR[node.category]} ${
        isSelected
          ? "border-cyan-500/50 bg-zinc-900/80"
          : "border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-900/50"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={`text-xs font-medium ${node.status === "deprecated" ? "text-red-400/70 line-through" : "text-zinc-300"}`}>
          {node.label}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {node.critical && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="critical" />}
          <StatusBadge status={node.status} />
        </div>
      </div>
      <p className="mt-0.5 text-[10px] leading-tight text-zinc-600">{node.role.length > 80 ? node.role.slice(0, 80) + "…" : node.role}</p>
    </button>
  );
}

// ── Loading / Error ────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      {[1, 2, 3, 4, 5].map((c) => (
        <div key={c}>
          <div className="mb-3 h-3 w-20 animate-pulse rounded bg-zinc-800/60" />
          <div className="space-y-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-900/40" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <p className="text-sm text-zinc-400">Architecture map unavailable</p>
        <p className="mt-1 text-xs text-zinc-600">{message}</p>
      </div>
    </div>
  );
}
