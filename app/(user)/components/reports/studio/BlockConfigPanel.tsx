"use client";

/**
 * BlockConfigPanel — formulaire de config du block sélectionné.
 *
 * Affiche un set minimal de champs communs (label, dataRef, layout.col,
 * hidden) puis des champs spécifiques selon le `block.type`. Pour les
 * primitives V2 (waterfall, cohort, heatmap, sankey, bullet, radar, gantt)
 * la config inline complète est complexe — on expose un editor JSON simple
 * avec validation côté blur (cf. blockSpecSchema superRefine).
 *
 * Onchange émet le block patché ; la validation Zod finale est faite par le
 * parent au save. Tokens uniquement, conforme CLAUDE.md.
 */

import { useState } from "react";
import type { BlockSpec, SourceRef, TransformOp } from "@/lib/reports/spec/schema";

export interface BlockConfigPanelProps {
  block: BlockSpec | null;
  /** Sources + transforms du spec parent — fournit les options pour dataRef. */
  sources: ReadonlyArray<SourceRef>;
  transforms: ReadonlyArray<TransformOp>;
  onChange: (next: BlockSpec) => void;
}

export function BlockConfigPanel({
  block,
  sources,
  transforms,
  onChange,
}: BlockConfigPanelProps) {
  if (!block) {
    return (
      <aside
        data-testid="studio-config-empty"
        className="flex flex-col items-center justify-center h-full text-center"
        style={{
          padding: "var(--space-6)",
          background: "var(--surface-1)",
          borderLeft: "1px solid var(--border-subtle)",
          gap: "var(--space-2)",
        }}
      >
        <span className="t-11" style={{ color: "var(--text-muted)" }}>
          Aucun block sélectionné
        </span>
        <span className="t-9" style={{ color: "var(--text-faint)" }}>
          Choisis un block dans la structure
        </span>
      </aside>
    );
  }

  const datasetIds = [
    ...sources.map((s) => ({ id: s.id, label: s.label ?? s.id, kind: "source" as const })),
    ...transforms.map((t) => ({ id: t.id, label: t.label ?? t.id, kind: "transform" as const })),
  ];

  const patch = (next: Partial<BlockSpec>) => {
    onChange({ ...block, ...next } as BlockSpec);
  };

  return (
    <aside
      data-testid="studio-config"
      className="flex flex-col h-full overflow-y-auto"
      style={{
        gap: "var(--space-4)",
        padding: "var(--space-4)",
        background: "var(--surface-1)",
        borderLeft: "1px solid var(--border-subtle)",
      }}
    >
      <header className="flex flex-col" style={{ gap: "var(--space-1)" }}>
        <h2
          className="t-9 font-mono uppercase"
          style={{
            color: "var(--text-muted)",
                      }}
        >
          Configuration
        </h2>
        <p className="t-9" style={{ color: "var(--text-faint)" }}>
          {block.type} · #{block.id}
        </p>
      </header>

      {/* Label */}
      <Field label="Titre">
        <TextInput
          value={block.label ?? ""}
          placeholder="Titre affiché dans le block"
          onChange={(v) => patch({ label: v || undefined })}
          testid="config-label"
        />
      </Field>

      {/* DataRef */}
      <Field
        label="Source de données"
        help="Source brute ou transform du spec"
      >
        <SelectInput
          value={block.dataRef}
          options={datasetIds.map((d) => ({
            value: d.id,
            label: `${d.label} · ${d.kind}`,
          }))}
          onChange={(v) => patch({ dataRef: v })}
          testid="config-dataref"
        />
      </Field>

      {/* Layout col */}
      <Field label="Largeur (colonnes 1/2/4)">
        <div className="flex" style={{ gap: "var(--space-1)" }}>
          {([1, 2, 4] as const).map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => patch({ layout: { ...block.layout, col } })}
              data-testid={`config-col-${col}`}
              className="t-11 transition-colors"
              style={{
                flex: 1,
                padding: "var(--space-2) var(--space-3)",
                background: block.layout.col === col ? "var(--cykan-surface)" : "transparent",
                color: block.layout.col === col ? "var(--cykan)" : "var(--text-muted)",
                border: `1px solid ${block.layout.col === col ? "var(--cykan-border)" : "var(--surface-2)"}`,
                borderRadius: "var(--radius-xs)",
                transitionDuration: "var(--duration-base)",
              }}
            >
              {col === 1 ? "Quart" : col === 2 ? "Moitié" : "Pleine"}
            </button>
          ))}
        </div>
      </Field>

      {/* Hidden */}
      <Field label="Visibilité">
        <label
          className="flex items-center"
          style={{ gap: "var(--space-2)", cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={!block.hidden}
            onChange={() => patch({ hidden: !block.hidden })}
            data-testid="config-visible"
            style={{ accentColor: "var(--cykan)" }}
          />
          <span className="t-11" style={{ color: "var(--text-soft)" }}>
            Visible dans le rendu
          </span>
        </label>
      </Field>

      {/* Props spécifiques au type */}
      <TypeSpecificFields block={block} onChange={onChange} />
    </aside>
  );
}

// ── Helpers ─────────────────────────────────────────────────

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
      <span
        className="t-9 font-mono uppercase"
        style={{
          color: "var(--text-muted)",
                  }}
      >
        {label}
      </span>
      {children}
      {help && (
        <span className="t-9" style={{ color: "var(--text-faint)" }}>
          {help}
        </span>
      )}
    </div>
  );
}

function TextInput({
  value,
  placeholder,
  onChange,
  testid,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  testid?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testid}
      className="t-11"
      style={{
        padding: "var(--space-2) var(--space-3)",
        background: "var(--surface-2)",
        color: "var(--text)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-xs)",
        outline: "none",
      }}
    />
  );
}

function SelectInput({
  value,
  options,
  onChange,
  testid,
}: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (v: string) => void;
  testid?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testid}
      className="t-11"
      style={{
        padding: "var(--space-2) var(--space-3)",
        background: "var(--surface-2)",
        color: "var(--text)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-xs)",
        outline: "none",
      }}
    >
      {options.length === 0 && <option value="">— Aucune source —</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Type-specific fields (V1 minimal) ───────────────────────

function TypeSpecificFields({
  block,
  onChange,
}: {
  block: BlockSpec;
  onChange: (next: BlockSpec) => void;
}) {
  // KPI : field + format
  if (block.type === "kpi") {
    return (
      <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
        <Field label="Champ" help="Colonne du dataset à exposer comme valeur">
          <TextInput
            value={(block.props?.field as string) ?? ""}
            placeholder="ex. mrr"
            onChange={(v) => onChange({ ...block, props: { ...block.props, field: v } })}
            testid="config-kpi-field"
          />
        </Field>
        <Field label="Format">
          <select
            value={(block.props?.format as string) ?? "number"}
            onChange={(e) => onChange({ ...block, props: { ...block.props, format: e.target.value } })}
            data-testid="config-kpi-format"
            className="t-11"
            style={{
              padding: "var(--space-2) var(--space-3)",
              background: "var(--surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-xs)",
            }}
          >
            <option value="number">Nombre</option>
            <option value="currency">Devise</option>
            <option value="percent">Pourcentage</option>
          </select>
        </Field>
      </div>
    );
  }

  // Bar / Sparkline : field + groupBy
  if (block.type === "bar" || block.type === "sparkline") {
    return (
      <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
        <Field label="Champ valeur">
          <TextInput
            value={(block.props?.field as string) ?? ""}
            placeholder="ex. count"
            onChange={(v) => onChange({ ...block, props: { ...block.props, field: v } })}
            testid="config-bar-field"
          />
        </Field>
        {block.type === "bar" && (
          <Field label="Champ catégorie">
            <TextInput
              value={(block.props?.groupBy as string) ?? ""}
              placeholder="ex. category"
              onChange={(v) => onChange({ ...block, props: { ...block.props, groupBy: v } })}
              testid="config-bar-group"
            />
          </Field>
        )}
      </div>
    );
  }

  // Table : columns
  if (block.type === "table") {
    const cols = (block.props?.columns as string[]) ?? [];
    const colsString = cols.join(", ");
    return (
      <Field label="Colonnes (séparées par virgule)">
        <TextInput
          value={colsString}
          placeholder="id, name, amount"
          onChange={(v) =>
            onChange({
              ...block,
              props: {
                ...block.props,
                columns: v
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            })
          }
          testid="config-table-cols"
        />
      </Field>
    );
  }

  // Funnel : steps
  if (block.type === "funnel") {
    return (
      <Field label="Champ étape">
        <TextInput
          value={(block.props?.field as string) ?? ""}
          placeholder="ex. stage"
          onChange={(v) => onChange({ ...block, props: { ...block.props, field: v } })}
          testid="config-funnel-field"
        />
      </Field>
    );
  }

  // V2 / V3 : éditeur JSON brut pour les props complexes
  return <PropsJsonEditor block={block} onChange={onChange} />;
}

function PropsJsonEditor({
  block,
  onChange,
}: {
  block: BlockSpec;
  onChange: (next: BlockSpec) => void;
}) {
  const [draft, setDraft] = useState<string>(JSON.stringify(block.props ?? {}, null, 2));
  const [err, setErr] = useState<string | null>(null);

  const apply = () => {
    try {
      const parsed = JSON.parse(draft);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        onChange({ ...block, props: parsed });
        setErr(null);
      } else {
        setErr("Doit être un objet JSON");
      }
    } catch {
      setErr("JSON invalide");
    }
  };

  return (
    <Field
      label="Props (JSON)"
      help="Éditeur libre — voir doc des primitives V2/V3"
    >
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        data-testid="config-props-json"
        className="t-9 font-mono"
        spellCheck={false}
        rows={10}
        style={{
          padding: "var(--space-2) var(--space-3)",
          background: "var(--surface-2)",
          color: "var(--text-soft)",
          border: `1px solid ${err ? "var(--color-error)" : "var(--border-subtle)"}`,
          borderRadius: "var(--radius-xs)",
          outline: "none",
          resize: "vertical",
          lineHeight: 1.5,
        }}
      />
      {err && (
        <span className="t-9" style={{ color: "var(--color-error)" }}>
          {err}
        </span>
      )}
    </Field>
  );
}
