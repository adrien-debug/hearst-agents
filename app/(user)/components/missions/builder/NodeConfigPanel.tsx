"use client";

/**
 * NodeConfigPanel — édite la config d'un node sélectionné.
 *
 * Volontairement minimal : on rend des inputs typés selon `kind`. Les
 * args complexes (objets) sont édités en JSON brut — pour MVP suffisant.
 */

import { useState } from "react";
import type { WorkflowNode } from "@/lib/workflows/types";

interface NodeConfigPanelProps {
  node: WorkflowNode | null;
  onChange: (patch: Partial<WorkflowNode>) => void;
  onDelete: () => void;
}

export function NodeConfigPanel({
  node,
  onChange,
  onDelete,
}: NodeConfigPanelProps) {
  // Reset state quand le node sélectionné change : on passe l'id en `key`
  // au composant interne pour forcer un remount propre. Évite les setState
  // synchrones dans un useEffect (react-hooks/set-state-in-effect).
  return (
    <NodeConfigInner
      key={node?.id ?? "empty"}
      node={node}
      onChange={onChange}
      onDelete={onDelete}
    />
  );
}

function NodeConfigInner({
  node,
  onChange,
  onDelete,
}: NodeConfigPanelProps) {
  const initialArgsText = (() => {
    if (!node) return "";
    const args = node.config?.args ?? node.config?.payload;
    return args ? JSON.stringify(args, null, 2) : "";
  })();
  const [argsText, setArgsText] = useState(initialArgsText);
  const [argsError, setArgsError] = useState<string | null>(null);

  if (!node) {
    return (
      <div
        className="flex flex-col h-full overflow-y-auto"
        style={{ padding: "var(--space-4)", background: "var(--bg-rail)" }}
      >
        <h2 className="halo-mono-label">Inspecteur</h2>
        <p
          className="t-11 text-[var(--text-muted)]"
          style={{ marginTop: "var(--space-3)" }}
        >
          Sélectionne un node pour éditer sa configuration.
        </p>
      </div>
    );
  }

  function update<K extends keyof WorkflowNode>(key: K, value: WorkflowNode[K]) {
    onChange({ [key]: value } as Partial<WorkflowNode>);
  }

  function updateConfig(key: string, value: unknown) {
    onChange({ config: { ...node!.config, [key]: value } });
  }

  function commitArgs(text: string, key: "args" | "payload") {
    setArgsText(text);
    if (!text.trim()) {
      updateConfig(key, {});
      setArgsError(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      updateConfig(key, parsed);
      setArgsError(null);
    } catch (e) {
      setArgsError(e instanceof Error ? e.message : "JSON invalide");
    }
  }

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{
        padding: "var(--space-4)",
        background: "var(--bg-rail)",
        gap: "var(--space-4)",
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="halo-mono-label">Inspecteur</h2>
        <button
          type="button"
          onClick={onDelete}
          className="t-11 font-light text-[var(--danger)] hover:text-[var(--text)] transition-colors"
        >
          Supprimer
        </button>
      </div>

      <Field label="Type">
        <span className="t-11 font-light text-[var(--text-muted)]">
          {node.kind}
        </span>
      </Field>

      <Field label="Label">
        <input
          type="text"
          value={node.label}
          onChange={(e) => update("label", e.target.value)}
          className="w-full t-11 text-[var(--text)] bg-transparent rounded-md"
          style={{
            padding: "var(--space-2) var(--space-3)",
            border: "1px solid var(--border-soft)",
          }}
        />
      </Field>

      {node.kind === "trigger" && (
        <>
          <Field label="Mode">
            <select
              value={String(node.config.mode ?? "manual")}
              onChange={(e) => updateConfig("mode", e.target.value)}
              className="w-full t-11 text-[var(--text)] bg-transparent rounded-md"
              style={{
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--border-soft)",
              }}
            >
              <option value="manual">Manuel</option>
              <option value="cron">Cron</option>
              <option value="webhook">Webhook</option>
            </select>
          </Field>
          {node.config.mode === "cron" && (
            <Field label="Cron pattern">
              <input
                type="text"
                value={String(node.config.cron ?? "")}
                onChange={(e) => updateConfig("cron", e.target.value)}
                placeholder="0 9 * * *"
                className="w-full t-11 font-mono text-[var(--text)] bg-transparent rounded-md"
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--border-soft)",
                }}
              />
            </Field>
          )}
        </>
      )}

      {node.kind === "tool_call" && (
        <>
          <Field label="Tool">
            <input
              type="text"
              value={String(node.config.tool ?? "")}
              onChange={(e) => updateConfig("tool", e.target.value)}
              placeholder="gmail_send"
              className="w-full t-11 font-mono text-[var(--text)] bg-transparent rounded-md"
              style={{
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--border-soft)",
              }}
            />
          </Field>
          <Field label="Args (JSON)">
            <textarea
              value={argsText}
              onChange={(e) => commitArgs(e.target.value, "args")}
              rows={6}
              className="w-full t-11 font-mono text-[var(--text)] bg-transparent rounded-md"
              style={{
                padding: "var(--space-2) var(--space-3)",
                border: argsError
                  ? "1px solid var(--danger)"
                  : "1px solid var(--border-soft)",
              }}
              placeholder={'{ "to": "${nodeId.email}" }'}
            />
            {argsError && (
              <p className="t-9 text-[var(--danger)]">{argsError}</p>
            )}
          </Field>
        </>
      )}

      {(node.kind === "condition" || node.kind === "transform") && (
        <Field label="Expression">
          <input
            type="text"
            value={String(node.config.expression ?? "")}
            onChange={(e) => updateConfig("expression", e.target.value)}
            placeholder="output.field == 'value'"
            className="w-full t-11 font-mono text-[var(--text)] bg-transparent rounded-md"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--border-soft)",
            }}
          />
        </Field>
      )}

      {node.kind === "approval" && (
        <Field label="Preview">
          <textarea
            value={String(node.config.preview ?? "")}
            onChange={(e) => updateConfig("preview", e.target.value)}
            rows={3}
            className="w-full t-11 text-[var(--text)] bg-transparent rounded-md"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--border-soft)",
            }}
          />
        </Field>
      )}

      {node.kind === "output" && (
        <Field label="Payload (JSON)">
          <textarea
            value={argsText}
            onChange={(e) => commitArgs(e.target.value, "payload")}
            rows={6}
            className="w-full t-11 font-mono text-[var(--text)] bg-transparent rounded-md"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: argsError
                ? "1px solid var(--danger)"
                : "1px solid var(--border-soft)",
            }}
          />
          {argsError && <p className="t-9 text-[var(--danger)]">{argsError}</p>}
        </Field>
      )}

      <Field label="Sur erreur">
        <select
          value={node.onError ?? "abort"}
          onChange={(e) =>
            update("onError", e.target.value as WorkflowNode["onError"])
          }
          className="w-full t-11 text-[var(--text)] bg-transparent rounded-md"
          style={{
            padding: "var(--space-2) var(--space-3)",
            border: "1px solid var(--border-soft)",
          }}
        >
          <option value="abort">Abort (default)</option>
          <option value="skip">Skip</option>
          <option value="retry">Retry</option>
        </select>
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
      <span className="t-11 font-light text-[var(--text-faint)]">
        {label}
      </span>
      {children}
    </div>
  );
}
