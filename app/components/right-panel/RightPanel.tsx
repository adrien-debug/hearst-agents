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
import { resolveConversationId } from "@/app/lib/thread-memory";
import { useHaloRuntime } from "@/app/lib/halo-runtime-context";
import { sublineForFlow } from "@/app/lib/manifestation-stage-model";
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
  const { state: halo } = useHaloRuntime();

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

  // When focal object changes externally, stay in INDEX (user clicks to open DOCUMENT)
  if (focal?.id !== prevFocalIdRef.current) {
    prevFocalIdRef.current = focal?.id;
    if (!focal && panelState === "DOCUMENT") {
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
      const actionIntent = `[action:${action.kind}] Exécute l'action "${action.kind}" sur l'objet "${target.title}" (type: ${target.objectType}, statut: ${target.status})`;
      const focalCtx = {
        id: target.id,
        objectType: target.objectType,
        title: target.title,
        status: target.status,
      };
      const threadId = sidebarCtx?.state.activeThreadId;
      const convId = resolveConversationId(threadId);

      await v2.send(actionIntent, "home", convId, focalCtx, threadId ?? undefined);
    } finally {
      setIsPending(false);
      actionLockRef.current = false;
    }
  }, [documentObject, focal, v2, sidebarCtx?.state.activeThreadId]);

  const isDocument = panelState === "DOCUMENT" && documentObject;

  return (
    <aside
      className="hidden h-full shrink-0 flex-col border-l border-white/5 bg-transparent lg:flex relative overflow-hidden"
      style={{
        width: isDocument ? "100%" : "36%",
        minWidth: 360,
        maxWidth: isDocument ? undefined : 760,
        transition: "width 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        contain: "strict",
        willChange: "width",
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
          className={`ml-auto transition-all duration-500 ${
            connected ? "status-dot" : "h-[5px] w-[5px] rounded-full bg-white/10"
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
            <div className="flex justify-between items-center text-sm text-white/50 mt-10 pt-6 border-t border-white/3">
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
              className="boxed-panel group max-h-[25%] overflow-hidden cursor-pointer shrink-0"
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
            <div className="my-6 h-px bg-linear-to-r from-cyan-accent/15 via-white/5 to-transparent" />
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
                    className="menu-item w-full text-left text-white/40"
                    onClick={() => openDocument(obj)}
                  >
                    <span className="h-[5px] w-[5px] rounded-full bg-cyan-accent/25 shrink-0" />
                    <span className="text-[11px] font-medium uppercase tracking-widest truncate flex-1">
                      {obj.title || TYPE_LABELS[obj.objectType] || obj.objectType}
                    </span>
                    <span className="text-[10px] font-mono shrink-0 text-white/20">
                      {timeStr}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!isFocused && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div
                className={`transition-all duration-500 ${
                  halo.coreState !== "idle" ? "status-dot animate-pulse" : "h-[5px] w-[5px] rounded-full bg-white/10"
                }`}
              />
              <p className="font-mono text-[10px] text-white/30 tracking-widest uppercase max-w-[20ch] text-center">
                {sublineForFlow(halo.flowLabel) ?? "En veille"}
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
