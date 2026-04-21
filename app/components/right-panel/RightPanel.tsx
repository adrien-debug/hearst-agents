"use client";

/**
 * Right Panel — 2-state machine: INDEX / DOCUMENT.
 *
 * STATE A (INDEX): focal compact + timeline. No scroll. Scan in 1 second.
 * STATE B (DOCUMENT): full object deployed in-place. Scroll allowed. Actions inline.
 *
 * Invariants:
 * - NO overlay modal (Document lives here)
 * - NO legacy sections (ActivitySection, RunTimelineSection, ConnectorsSection)
 * - NO tabs, lists, dashboard stacks
 * - NO intermediate states between INDEX and DOCUMENT
 * - One focal object at a time, max 2 secondary
 */

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useRightPanel } from "@/app/hooks/use-right-panel";
import { useRunStreamOptional } from "@/app/lib/run-stream-context";
import { useFocalObject } from "@/app/hooks/use-focal-object";
import { useOrchestrate } from "@/app/hooks/use-orchestrate";
import { useSidebarOptional } from "@/app/hooks/use-sidebar";
import type { FocalObject, FocalAction } from "@/lib/right-panel/objects";
import { FocalObjectRenderer, TYPE_LABELS } from "./FocalObjectRenderer";

type PanelState = "INDEX" | "DOCUMENT";

function RightPanelInner() {
  const { loading } = useRightPanel();
  const stream = useRunStreamOptional();
  const connected = stream?.connected ?? false;
  const { focal, secondary, isFocused } = useFocalObject();
  const v2 = useOrchestrate();
  const sidebarCtx = useSidebarOptional();

  const [panelState, setPanelState] = useState<PanelState>("INDEX");
  const [documentObject, setDocumentObject] = useState<FocalObject | null>(null);
  const [isPending, setIsPending] = useState(false);
  const actionLockRef = useRef(false);
  const prevFocalIdRef = useRef(focal?.id);
  const prevThreadIdRef = useRef(sidebarCtx?.state.activeThreadId);

  // When thread changes, reset focal state completely
  if (sidebarCtx?.state.activeThreadId !== prevThreadIdRef.current) {
    prevThreadIdRef.current = sidebarCtx?.state.activeThreadId;
    setPanelState("INDEX");
    setDocumentObject(null);
  }

  // When focal object changes externally, reset to INDEX (derived, no effect)
  if (focal?.id !== prevFocalIdRef.current) {
    prevFocalIdRef.current = focal?.id;
    if (panelState === "DOCUMENT") {
      setPanelState("INDEX");
      setDocumentObject(null);
    }
  }

  const openDocument = useCallback((obj: FocalObject) => {
    setDocumentObject(obj);
    setPanelState("DOCUMENT");
  }, []);

  const closeDocument = useCallback(() => {
    setPanelState("INDEX");
    setDocumentObject(null);
  }, []);

  // Keyboard: Escape closes Document → INDEX
  useEffect(() => {
    if (panelState !== "DOCUMENT") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDocument();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [panelState, closeDocument]);

  // Navigate between objects while in DOCUMENT state
  const allObjects = useMemo(
    () => (focal ? [focal, ...secondary] : secondary),
    [focal, secondary],
  );

  const navigateDocument = useCallback((obj: FocalObject) => {
    setDocumentObject(obj);
  }, []);

  const currentDocIndex = documentObject
    ? allObjects.findIndex((o) => o.id === documentObject.id)
    : -1;
  const hasPrev = currentDocIndex > 0;
  const hasNext = currentDocIndex >= 0 && currentDocIndex < allObjects.length - 1;

  const handleFocalAction = useCallback(async (action: FocalAction) => {
    const target = documentObject ?? focal;
    if (!target || actionLockRef.current) return;

    actionLockRef.current = true;
    setIsPending(true);
    try {
      const actionIntent = `${action.kind} ${target.objectType} "${target.title}"`;
      const focalCtx = {
        id: target.id,
        objectType: target.objectType,
        title: target.title,
        status: target.status,
      };
      const threadId = sidebarCtx?.state.activeThreadId;
      const convId = threadId ?? crypto.randomUUID();

      await v2.send(actionIntent, "home", convId, focalCtx);
    } finally {
      setIsPending(false);
      actionLockRef.current = false;
    }
  }, [documentObject, focal, v2, sidebarCtx?.state.activeThreadId]);

  const isDocument = panelState === "DOCUMENT" && documentObject;

  return (
    <aside
      className="hidden h-full shrink-0 flex-col border-l border-white/[0.05] xl:flex relative overflow-hidden"
      style={{
        width: isDocument ? "100%" : "36%",
        minWidth: 520,
        maxWidth: isDocument ? undefined : 760,
        transition: "width 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        contain: "strict",
        willChange: "width",
        background: "#000000",
      }}
    >
      {/* Status indicator */}
      <div className="flex h-12 items-center px-6 shrink-0 z-20">
        {isDocument && (
          <button
            onClick={closeDocument}
            className="text-[9px] font-mono tracking-wider text-white/30 hover:text-white border border-transparent hover:border-white/20 px-2 py-1 transition-colors duration-200 cursor-pointer"
          >
            ← INDEX
          </button>
        )}
        <span
          className={`ml-auto h-[5px] w-[5px] rounded-full transition-colors duration-500 ${
            connected ? "bg-white/40" : "bg-white/10"
          }`}
        />
      </div>

      {/* ── STATE B: DOCUMENT ── */}
      {isDocument && (
        <div className="flex-1 overflow-y-auto scrollbar-hide px-6 pb-8 min-h-0">
          <FocalObjectRenderer
            object={documentObject}
            onAction={handleFocalAction}
            isPending={isPending}
            mode="full"
          />

          {/* Document navigation */}
          {allObjects.length > 1 && (
            <div className="flex justify-between items-center text-sm text-white/50 mt-10 pt-6 border-t border-white/[0.03]">
              <button
                onClick={() => hasPrev && navigateDocument(allObjects[currentDocIndex - 1])}
                disabled={!hasPrev}
                className="transition-colors duration-200 hover:text-white border border-transparent hover:border-white/20 px-2 py-1 disabled:opacity-20 disabled:cursor-default text-[11px] font-mono cursor-pointer"
              >
                ← Précédent
              </button>
              <button
                onClick={() => hasNext && navigateDocument(allObjects[currentDocIndex + 1])}
                disabled={!hasNext}
                className="transition-colors duration-200 hover:text-white border border-transparent hover:border-white/20 px-2 py-1 disabled:opacity-20 disabled:cursor-default text-[11px] font-mono cursor-pointer"
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STATE A: INDEX ── */}
      {!isDocument && (
        <div className="flex-1 overflow-hidden px-6 flex flex-col min-h-0">

          {/* Focal Context (max 25% height) */}
          {isFocused && focal && (
            <div
              className="group max-h-[25%] overflow-hidden cursor-pointer shrink-0 transition-[opacity,border-color] duration-150 ease-out hover:opacity-90 border border-transparent hover:border-white/10 rounded-md"
              style={{
                maskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
              }}
              onClick={() => openDocument(focal)}
            >
              <FocalObjectRenderer object={focal} onAction={handleFocalAction} isPending={isPending} mode="preview" />
            </div>
          )}

          {/* Divider */}
          {isFocused && secondary.length > 0 && (
            <div className="border-t border-white/5 my-6" />
          )}

          {/* Timeline Register */}
          {secondary.length > 0 && (
            <div className="space-y-0.5 shrink-0 overflow-hidden">
              {secondary.map((obj) => {
                const timeStr = obj.createdAt
                  ? new Date(obj.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "";

                return (
                  <button
                    key={obj.id}
                    className="w-full group text-left"
                    onClick={() => openDocument(obj)}
                  >
                    <div className="flex justify-between items-center h-10 px-2 border border-transparent rounded-md transition-colors group-hover:border-white/10 cursor-pointer">
                      <span className="text-[12px] text-white/50 group-hover:text-white transition-colors truncate pr-4">
                        {obj.title || TYPE_LABELS[obj.objectType] || obj.objectType}
                      </span>
                      <span className="text-[11px] text-white/30 font-mono shrink-0 group-hover:text-white/50 transition-colors">
                        {timeStr}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty state — persistent structure */}
          {!isFocused && !loading && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[10px] text-white/30 font-mono tracking-wide">
                En attente
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

const RightPanel = memo(RightPanelInner);
export default RightPanel;
