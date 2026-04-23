"use client";

import { useFocalStore, type FocalObject } from "@/stores/focal";

function FocalContent({ focal }: { focal: FocalObject }) {
  return (
    <div className="max-w-3xl w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-2 h-2 rounded-full bg-cyan-400" />
        <span className="text-xs font-mono uppercase tracking-wider text-white/40">{focal.type}</span>
      </div>

      <h1 className="text-2xl font-light text-white/90 mb-6 leading-tight">{focal.title}</h1>

      {focal.body && (
        <div className="prose prose-invert prose-sm max-w-none">
          <div className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{focal.body}</div>
        </div>
      )}

      {!focal.body && focal.summary && (
        <p className="text-sm text-white/70 leading-relaxed">{focal.summary}</p>
      )}

      {focal.sections && focal.sections.length > 0 && (
        <div className="mt-8 space-y-6">
          {focal.sections.map((section, i) => (
            <div key={i} className="border-l-2 border-white/10 pl-4">
              {section.heading && (
                <h3 className="text-xs font-mono uppercase tracking-wider text-white/40 mb-2">{section.heading}</h3>
              )}
              <p className="text-sm text-white/70 leading-relaxed">{section.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 pt-4 border-t border-white/[0.06] flex items-center gap-4 text-xs text-white/30">
        {focal.wordCount && <span>{focal.wordCount} mots</span>}
        {focal.provider && <span>via {focal.provider}</span>}
      </div>
    </div>
  );
}

export function FocalStage() {
  const focal = useFocalStore((s) => s.focal);

  if (!focal) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-white/20">◉</span>
          </div>
          <p className="text-sm text-white/30">En attente de contenu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-12">
      <FocalContent focal={focal} />
    </div>
  );
}
