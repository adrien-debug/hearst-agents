"use client";

import { useState, useCallback, type ReactNode } from "react";
import { BlockActions } from "./BlockActions";
import { BlockEditor } from "./BlockEditor";

/**
 * Block — unité de contenu structuré dans le Thinking Canvas.
 *
 * Remplace le rendu "bubble assistant" du chat par un flux éditorial où
 * chaque réponse est un block typé (paragraph / list / action_items /
 * insight / section_heading). Le type est détecté par parsing markdown
 * léger sur le content brut.
 *
 * Design tokens uniquement (cf CLAUDE.md) — pas de magic px / hex / rgba.
 */

export type BlockType =
  | "section_heading"
  | "subsection_heading"
  | "list"
  | "action_items"
  | "insight"
  | "paragraph";

export interface BlockProps {
  content: string;
  editable?: boolean;
  onSave?: (newContent: string) => void;
  onAction?: (action: BlockActionId) => void;
}

export type BlockActionId =
  | "expand"
  | "mission"
  | "asset"
  | "edit"
  | "refine";

/**
 * Détecte le type primaire du block à partir du content brut.
 *
 * Règles (priorité descendante) :
 *   1. Commence par `# ` → section_heading
 *   2. Commence par `## ` → subsection_heading
 *   3. Commence par `**Insight**` ou `**Recommandation**` → insight
 *   4. Lignes contiennent uniquement `[ ]` / `[x]` → action_items
 *   5. Lignes contiennent uniquement `- ` / `• ` → list
 *   6. Sinon → paragraph
 */
export function detectBlockType(content: string): BlockType {
  const trimmed = content.trim();
  if (!trimmed) return "paragraph";

  if (/^#\s+/.test(trimmed)) return "section_heading";
  if (/^##\s+/.test(trimmed)) return "subsection_heading";
  if (/^\*\*(Insight|Recommandation)\*\*/i.test(trimmed)) return "insight";

  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length > 0) {
    const allChecks = lines.every((l) => /^\s*\[[ xX]\]\s+/.test(l));
    if (allChecks) return "action_items";

    const allBullets = lines.every((l) => /^\s*[-•]\s+/.test(l));
    if (allBullets) return "list";
  }

  return "paragraph";
}

/**
 * Rend du markdown inline (gras, italique, code, lien) sans librairie
 * externe. Gardé minimal — pas d'images, pas de tableaux, pas de footnotes.
 */
function renderInline(text: string): ReactNode[] {
  // Order matters : code first (greediest), then links, then bold, then italic.
  const tokens: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  // Combined regex with named groups via alternation.
  const re =
    /(`[^`\n]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push(text.slice(cursor, match.index));
    }
    const raw = match[0];
    if (raw.startsWith("`")) {
      tokens.push(
        <code
          key={`c-${key++}`}
          className="t-13 font-mono px-1 rounded-xs bg-[var(--surface-1)] text-[var(--text-soft)]"
        >
          {raw.slice(1, -1)}
        </code>,
      );
    } else if (raw.startsWith("[")) {
      const m2 = raw.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (m2) {
        tokens.push(
          <a
            key={`l-${key++}`}
            href={m2[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--cykan)] underline underline-offset-2 hover:text-[var(--cykan)] transition-colors"
          >
            {m2[1]}
          </a>,
        );
      } else {
        tokens.push(raw);
      }
    } else if (raw.startsWith("**")) {
      tokens.push(
        <strong key={`b-${key++}`} className="font-semibold text-[var(--text)]">
          {raw.slice(2, -2)}
        </strong>,
      );
    } else {
      tokens.push(
        <em key={`i-${key++}`} className="italic">
          {raw.slice(1, -1)}
        </em>,
      );
    }
    cursor = match.index + raw.length;
  }
  if (cursor < text.length) tokens.push(text.slice(cursor));
  return tokens;
}

function HeadingPrimary({ text }: { text: string }) {
  return (
    <h2
      className="t-18 font-light tracking-tight text-[var(--text)]"
      style={{ marginBottom: "var(--space-2)" }}
    >
      {renderInline(text)}
    </h2>
  );
}

function HeadingSecondary({ text }: { text: string }) {
  return (
    <h3
      className="t-15 font-medium tracking-tight text-[var(--text-soft)]"
      style={{ marginBottom: "var(--space-2)" }}
    >
      {renderInline(text)}
    </h3>
  );
}

function ParagraphView({ text }: { text: string }) {
  // Préserve les sauts de ligne en plusieurs <p> compactes.
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className="t-15 leading-relaxed font-light text-[var(--text-soft)] whitespace-pre-wrap"
        >
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}

function ListView({ text }: { text: string }) {
  const items = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-•]\s+/, "").trim())
    .filter((l) => l.length > 0);
  return (
    <ul className="flex flex-col" style={{ gap: "var(--space-2)" }}>
      {items.map((it, i) => (
        <li
          key={i}
          className="flex items-start t-15 leading-relaxed font-light text-[var(--text-soft)]"
          style={{ gap: "var(--space-3)" }}
        >
          <span
            className="rounded-pill bg-[var(--cykan)] shrink-0"
            aria-hidden
            style={{
              width: "var(--space-1)",
              height: "var(--space-1)",
              marginTop: "var(--space-2)",
            }}
          />
          <span>{renderInline(it)}</span>
        </li>
      ))}
    </ul>
  );
}

function ActionItemsView({
  text,
  onToggle,
}: {
  text: string;
  onToggle?: (idx: number, checked: boolean) => void;
}) {
  const items = text
    .split("\n")
    .map((l) => {
      const m = l.match(/^\s*\[([ xX])\]\s+(.+)$/);
      if (!m) return null;
      return { checked: m[1].toLowerCase() === "x", label: m[2] };
    })
    .filter((it): it is { checked: boolean; label: string } => it !== null);

  return (
    <ul className="flex flex-col" style={{ gap: "var(--space-2)" }}>
      {items.map((it, i) => (
        <li
          key={i}
          className="flex items-start t-15 leading-relaxed font-light text-[var(--text-soft)]"
          style={{ gap: "var(--space-3)" }}
        >
          <input
            type="checkbox"
            checked={it.checked}
            onChange={(e) => onToggle?.(i, e.target.checked)}
            className="shrink-0 accent-[var(--cykan)]"
            aria-label={`Tâche : ${it.label}`}
            style={{
              width: "var(--space-4)",
              height: "var(--space-4)",
              marginTop: "var(--space-1)",
            }}
          />
          <span className={it.checked ? "line-through text-[var(--text-faint)]" : ""}>
            {renderInline(it.label)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function InsightView({ text }: { text: string }) {
  // Strip the leading **Insight** / **Recommandation** marker from body.
  const body = text.replace(/^\*\*(Insight|Recommandation)\*\*\s*:?\s*/i, "");
  const labelMatch = text.match(/^\*\*(Insight|Recommandation)\*\*/i);
  const label = labelMatch ? labelMatch[1] : "Insight";
  return (
    <div
      className="border-l border-[var(--cykan)]"
      style={{ paddingLeft: "var(--space-4)" }}
    >
      <div
        className="t-11 font-medium text-[var(--cykan)]"
        style={{ marginBottom: "var(--space-2)" }}
      >
        {label}
      </div>
      <div className="t-15 leading-relaxed font-light text-[var(--text-soft)] whitespace-pre-wrap">
        {renderInline(body)}
      </div>
    </div>
  );
}

/**
 * Render le block selon son type détecté. Retourne `null` quand le content
 * est vide pour permettre au parent de gérer le shimmer / placeholder.
 */
function BlockView({
  type,
  content,
}: {
  type: BlockType;
  content: string;
}) {
  if (!content.trim()) return null;

  switch (type) {
    case "section_heading":
      return <HeadingPrimary text={content.replace(/^#\s+/, "")} />;
    case "subsection_heading":
      return <HeadingSecondary text={content.replace(/^##\s+/, "")} />;
    case "insight":
      return <InsightView text={content} />;
    case "list":
      return <ListView text={content} />;
    case "action_items":
      return <ActionItemsView text={content} />;
    case "paragraph":
    default:
      return <ParagraphView text={content} />;
  }
}

/**
 * Block — composant racine. Gère le mode édition local et délègue les
 * actions inline à `BlockActions` (visible au hover).
 */
export function Block({
  content,
  editable = false,
  onSave,
  onAction,
}: BlockProps) {
  const [editing, setEditing] = useState(false);

  const handleAction = useCallback(
    (id: BlockActionId) => {
      if (id === "edit") {
        setEditing(true);
        return;
      }
      onAction?.(id);
    },
    [onAction],
  );

  const handleSave = useCallback(
    (newContent: string) => {
      setEditing(false);
      onSave?.(newContent);
    },
    [onSave],
  );

  const handleCancel = useCallback(() => {
    setEditing(false);
  }, []);

  const type = detectBlockType(content);

  return (
    <div
      className="group relative"
      data-block-type={type}
      data-testid="chat-block"
    >
      {editing ? (
        <BlockEditor
          initialValue={content}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ) : (
        <BlockView type={type} content={content} />
      )}
      {!editing && (
        <BlockActions onAction={handleAction} editable={editable} />
      )}
    </div>
  );
}
