"use client";

import { useMemo } from "react";

const ISO_DATE_RE = /:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s*$/;

type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "bullet"; text: string; meta?: string }
  | { kind: "p"; text: string };

function parse(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let buffer: string[] = [];

  const flushParagraph = () => {
    if (buffer.length === 0) return;
    const text = buffer.join(" ").trim();
    if (text) blocks.push({ kind: "p", text });
    buffer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    if (line.startsWith("# ")) {
      flushParagraph();
      blocks.push({ kind: "h1", text: line.slice(2).trim() });
    } else if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push({ kind: "h2", text: line.slice(3).trim() });
    } else if (line.startsWith("### ")) {
      flushParagraph();
      blocks.push({ kind: "h3", text: line.slice(4).trim() });
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      flushParagraph();
      const body = line.slice(2).trim();
      const match = body.match(ISO_DATE_RE);
      if (match) {
        const text = body.slice(0, match.index).replace(/[:\s]+$/, "").trim();
        blocks.push({ kind: "bullet", text, meta: formatDate(match[1]) });
      } else {
        blocks.push({ kind: "bullet", text: body });
      }
    } else {
      buffer.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function ResearchReportArticle({ content }: { content: string }) {
  const blocks = useMemo(() => parse(content), [content]);

  return (
    <article className="flex flex-col gap-6 max-w-[var(--width-center-max)] text-[var(--text)]">
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case "h1":
            return (
              <h1 key={idx} className="t-28 font-light leading-tight tracking-tight text-[var(--text)] mt-2">
                {block.text}
              </h1>
            );
          case "h2":
            return (
              <h2 key={idx} className="t-20 font-light leading-tight tracking-tight text-[var(--text)] mt-4">
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={idx} className="t-15 font-medium leading-snug text-[var(--text-soft)] mt-2">
                {block.text}
              </h3>
            );
          case "bullet":
            return (
              <div key={idx} className="flex items-baseline gap-3">
                <span className="t-9 font-mono text-[var(--cykan)] mt-1 shrink-0" aria-hidden="true">
                  ─
                </span>
                <div className="flex-1 flex flex-col gap-1">
                  <p className="t-15 leading-[1.6] font-light text-[var(--text-muted)]">
                    {block.text}
                  </p>
                  {block.meta && (
                    <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)]">
                      {block.meta}
                    </span>
                  )}
                </div>
              </div>
            );
          case "p":
          default:
            return (
              <p key={idx} className="t-15 leading-[1.7] font-light text-[var(--text-muted)]">
                {block.text}
              </p>
            );
        }
      })}
    </article>
  );
}
