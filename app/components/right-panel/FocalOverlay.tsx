"use client";

import { useEffect, useCallback } from "react";
import type { FocalObject, FocalAction } from "@/lib/right-panel/objects";
import { FocalObjectRenderer } from "./FocalObjectRenderer";

export function FocalOverlay({
  object,
  onClose,
  onAction,
  allObjects,
  onNavigate,
}: {
  object: FocalObject;
  onClose: () => void;
  onAction?: (action: FocalAction) => void;
  allObjects?: FocalObject[];
  onNavigate?: (obj: FocalObject) => void;
}) {
  const currentIndex = allObjects?.findIndex((o) => o.id === object.id) ?? -1;
  const hasPrev = currentIndex > 0;
  const hasNext = allObjects ? currentIndex < allObjects.length - 1 : false;

  const goPrev = useCallback(() => {
    if (hasPrev && allObjects && onNavigate) onNavigate(allObjects[currentIndex - 1]);
  }, [hasPrev, allObjects, currentIndex, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext && allObjects && onNavigate) onNavigate(allObjects[currentIndex + 1]);
  }, [hasNext, allObjects, currentIndex, onNavigate]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    },
    [onClose, goPrev, goNext],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative mt-16 mb-16 w-full max-w-[720px] max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-hide rounded-2xl bg-zinc-900/90 backdrop-blur-xl border border-white/5 p-14 animate-in slide-in-from-bottom-2 duration-200"
        style={{ animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-[60ch]">
          <FocalObjectRenderer object={object} onAction={onAction} mode="full" />
        </div>

        {allObjects && allObjects.length > 1 && onNavigate && (
          <div className="flex justify-between items-center text-sm text-zinc-500 mt-10 pt-6 border-t border-white/[0.03]">
            <button
              onClick={goPrev}
              disabled={!hasPrev}
              className="transition-colors duration-200 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-default"
            >
              ← Précédent
            </button>
            <button
              onClick={goNext}
              disabled={!hasNext}
              className="transition-colors duration-200 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-default"
            >
              Suivant →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
