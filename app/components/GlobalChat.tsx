"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChatContext } from "../lib/chat-context";
import { useMission, detectIntent, approveMission, cancelMission } from "../lib/missions";
import { useOrchestrate, type V2Event } from "../hooks/use-orchestrate";
import { useChatActivity } from "../lib/chat-activity";
import { getConnectAction, triggerConnect, sortByConnectPriority } from "../lib/connect-actions";
import { OrchestrationHalo } from "./system/OrchestrationHalo";
import { useThreadSwitchOptional } from "../hooks/use-thread-switch";
import { linkThreadToConversation, type ChatMessage } from "../lib/thread-memory";
import { useSidebarOptional } from "../hooks/use-sidebar";
import { useFocalObject } from "../hooks/use-focal-object";

const USE_V2 = process.env.NEXT_PUBLIC_USE_V2 !== "false";

interface BlockedInfo {
  capability: string;
  requiredProviders: string[];
  message: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  awaitingApproval?: { missionId: string };
  approved?: boolean;
  cancelled?: boolean;
  blocked?: BlockedInfo;
}

const SURFACE_ROUTES: Record<string, string> = {
  inbox: "/inbox",
  calendar: "/calendar",
  files: "/files",
  tasks: "/tasks",
  apps: "/apps",
  home: "/",
};

const SURFACE_NAV_LABEL: Record<string, string> = {
  inbox: "J'ouvre votre boîte de réception.",
  calendar: "J'ouvre votre agenda.",
  files: "J'ouvre vos fichiers.",
  tasks: "J'ouvre vos tâches.",
  apps: "J'ouvre les applications.",
};


export default function GlobalChat() {
  const { surface, selectedItem, connectedServices, expanded, setExpanded } = useChatContext();
  const { setActiveSurface, activeMission } = useMission();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [v2Streaming, setV2Streaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const v2 = useOrchestrate();
  const chatActivity = useChatActivity();
  const threadSwitch = useThreadSwitchOptional();
  const sidebarCtx = useSidebarOptional();

  const { focal: focalObject } = useFocalObject();
  const lastUserInputRef = useRef<string>("");
  const restoringRef = useRef(false);

  // ── Thread restore callback registration ──────────────────
  useEffect(() => {
    if (!threadSwitch) return;
    threadSwitch.registerChatCallbacks({
      getMessages: () => messages as ChatMessage[],
      getDraftInput: () => input,
      getConversationId: () => conversationId,
      restore: (snapshot) => {
        restoringRef.current = true;
        if (snapshot) {
          setMessages(snapshot.messages as Message[]);
          setInput(snapshot.draftInput);
          setConversationId(snapshot.conversationId);
          if (snapshot.messages.length > 0) setExpanded(true);
        } else {
          setMessages([]);
          setInput("");
          setConversationId(null);
        }
        setStreaming(false);
        setV2Streaming(false);
        requestAnimationFrame(() => { restoringRef.current = false; });
      },
    });
  }, [threadSwitch, messages, input, conversationId, setExpanded]);

  // Sync v2 hook state → messages (text only, no step events — Halo handles perception)
  useEffect(() => {
    if (!USE_V2) return;
    if (v2.status === "idle") return;

    const hasText = v2.text.length > 0;
    const isLive = v2.status === "running" && hasText;
    const isFailed = v2.status === "failed";

    let content = hasText ? v2.text : (v2.status === "running" ? "" : "");

    if (isFailed && hasText) {
      content += "\n\n(interrompu)";
    }

    const blockedEvent = v2.events.find((e) => e.type === "capability_blocked") as
      | (V2Event & { capability?: string; requiredProviders?: string[]; message?: string })
      | undefined;

    const blocked: BlockedInfo | undefined = blockedEvent
      ? {
          capability: (blockedEvent.capability as string) ?? "",
          requiredProviders: (blockedEvent.requiredProviders as string[]) ?? [],
          message: (blockedEvent.message as string) ?? "",
        }
      : undefined;

    void Promise.resolve().then(() => {
      setV2Streaming(isLive);
      setMessages((prev) => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].role === "assistant") {
          copy[copy.length - 1] = { role: "assistant", content, blocked };
        }
        return copy;
      });
    });

  }, [v2.events, v2.text, v2.status]);

  useEffect(() => {
    if (activeMission?.status === "awaiting_approval" && activeMission.result) {
      void Promise.resolve().then(() => {
        setMessages((prev) => {
          const alreadyShown = prev.some((m) => m.awaitingApproval?.missionId === activeMission.id);
          if (alreadyShown) return prev;
          const preview = activeMission.result!.slice(0, 200).replace(/\n/g, " ").trim();
          return [...prev, {
            role: "assistant",
            content: `Résultat prêt — ${preview}`,
            awaitingApproval: { missionId: activeMission.id },
          }];
        });
        if (!expanded) setExpanded(true);
      });
    }
  }, [activeMission?.status, activeMission?.id, activeMission?.result, expanded, setExpanded]);

  useEffect(() => {
    if (restoringRef.current) return;
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, expanded]);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;
      const trimmed = text.trim();
      setInput("");
      if (!expanded) setExpanded(true);
      setV2Streaming(false);
      lastUserInputRef.current = trimmed;
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setStreaming(true);
      chatActivity.startQuery(trimmed);

      // Navigation only — explicit "ouvre", "va sur" etc.
      const outcome = detectIntent(trimmed);
      if (outcome.type === "navigate") {
        const navLabel = SURFACE_NAV_LABEL[outcome.surface] ?? `J'ouvre ${outcome.surface}.`;
        setMessages((prev) => [...prev, { role: "assistant", content: navLabel }]);
        setActiveSurface(outcome.surface);
        setStreaming(false);
        chatActivity.complete({ type: "summary", title: "Navigation" });
        const route = SURFACE_ROUTES[outcome.surface];
        if (route) router.push(route);
        return;
      }

      // ── V2 pipeline via /api/orchestrate ──────────────────
      if (USE_V2) {
        let convId = conversationId;
        if (!convId) {
          convId = crypto.randomUUID();
          setConversationId(convId);
          const threadId = sidebarCtx?.state.activeThreadId;
          if (threadId) linkThreadToConversation(threadId, convId);
        }
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
        const focalCtx = focalObject
          ? { id: focalObject.id, objectType: focalObject.objectType, title: focalObject.title, status: focalObject.status }
          : undefined;
        try {
          await v2.send(trimmed, surface, convId, focalCtx);
        } finally {
          setStreaming(false);
        }
        return;
      }

      // ── Legacy v1 pipeline via /api/chat ──────────────────
      let didFail = false;
      setMessages((prev) => [...prev, { role: "assistant", content: "Analyse…" }]);

      try {
        const ctx: Record<string, unknown> = { surface };
        if (selectedItem) ctx.selectedItem = selectedItem;
        if (connectedServices.length > 0) ctx.connectedServices = connectedServices;

        const chatBody: Record<string, unknown> = { message: trimmed, context: ctx };
        if (conversationId) chatBody.conversation_id = conversationId;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chatBody),
        });

        if (!res.ok) {
          await res.clone().text().catch(() => "");
        }

        if (!conversationId) {
          const cid = res.headers.get("X-Conversation-Id");
          if (cid) {
            setConversationId(cid);
            const threadId = sidebarCtx?.state.activeThreadId;
            if (threadId) linkThreadToConversation(threadId, cid);
          }
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";

        if (reader) {
          let streamError = false;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const payload = JSON.parse(line.slice(6));
                if (payload.error) {
                  const errContent = payload.content ?? "Service indisponible. Réessayez.";
                  setMessages((prev) => {
                    const copy = [...prev];
                    copy[copy.length - 1] = { role: "assistant", content: errContent };
                    return copy;
                  });
                  streamError = true;
                  didFail = true;
                  chatActivity.fail();
                  break;
                }
                if (payload.type === "step") {
                  if (payload.status === "running") {
                    chatActivity.toolStarted(payload.tool);
                  } else {
                    chatActivity.toolDone(payload.tool, payload.status === "done");
                  }
                } else if (payload.type === "final" && payload.content) {
                  chatActivity.responseStarted();
                  assistantContent = payload.content;
                  setMessages((prev) => {
                    const copy = [...prev];
                    copy[copy.length - 1] = { role: "assistant", content: payload.content };
                    return copy;
                  });
                } else if (payload.delta) {
                  if (!assistantContent) chatActivity.responseStarted();
                  assistantContent += payload.delta;
                  setMessages((prev) => {
                    const copy = [...prev];
                    copy[copy.length - 1] = { role: "assistant", content: assistantContent };
                    return copy;
                  });
                }
              } catch { /* skip */ }
            }
            if (streamError) {
              reader.cancel();
              break;
            }
          }
        }
      } catch {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: "Connexion impossible." };
          return copy;
        });
        didFail = true;
        chatActivity.fail();
      } finally {
        setStreaming(false);
        if (!didFail) {
          chatActivity.complete();
        }
      }
    },
    [conversationId, streaming, surface, selectedItem, connectedServices, expanded, setExpanded, setActiveSurface, router, chatActivity, focalObject, sidebarCtx, v2],
  );

  const handleApproval = useCallback((idx: number) => {
    setMessages((prev) => prev.map((m, i) => i === idx ? { ...m, approved: true } : m));
  }, []);

  const handleCancellation = useCallback((idx: number) => {
    setMessages((prev) => prev.map((m, i) => i === idx ? { ...m, cancelled: true } : m));
  }, []);

  const lastMsg = messages[messages.length - 1];
  const isThinking = streaming && (
    lastMsg?.content === "" || lastMsg?.content === "Analyse…"
  );
  const showStreamCursor = v2Streaming && lastMsg?.role === "assistant" && lastMsg.content.length > 0 && lastMsg.content !== "Analyse…";

  // All pages — bottom overlay
  return (
    <div className="relative w-full max-w-3xl mx-auto px-4 pb-6">
      {/* Messages Area - The Void */}
      {expanded && messages.length > 0 && (
        <div className="max-h-[60vh] overflow-y-auto mb-6 scrollbar-hide">
          <div className="flex flex-col gap-6 py-4">
            {messages.map((m, i) => (
              <ChatMessage
                key={i}
                msg={m}
                isLiveStreaming={i === messages.length - 1 && showStreamCursor}
                onApproved={() => handleApproval(i)}
                onCancelled={() => handleCancellation(i)}
              />
            ))}
            {isThinking && <ThinkingDots />}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {/* Orchestration Halo */}
      <div className="mb-4">
        <OrchestrationHalo restoredState={threadSwitch?.restoredHaloState} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
        className="relative flex items-center h-[80px] border-t border-white/[0.05] px-12"
        style={{ background: "#020202" }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => { if (messages.length > 0) setExpanded(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          placeholder="..."
          rows={1}
          className="flex-1 bg-transparent border-none text-sm text-white/90 placeholder-white/20 outline-none resize-none h-full py-6 font-mono caret-transparent"
          disabled={streaming}
          style={{ caretColor: "transparent" }}
        />
        {!input && !streaming && (
          <span className="absolute left-12 top-1/2 -translate-y-1/2 text-white/30 font-mono text-sm" style={{ animation: "blink-caret 1s step-end infinite" }}>
            █
          </span>
        )}
        <button type="submit" disabled={streaming || !input.trim()} className="flex items-center justify-center w-10 h-10 text-white/30 hover:text-white/60 transition-colors disabled:opacity-10">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
          </svg>
        </button>
      </form>
    </div>
  );
}

/* ─── Single chat message ─── */

function ChatMessage({
  msg,
  isLiveStreaming,
  onApproved,
  onCancelled,
}: {
  msg: Message;
  isLiveStreaming?: boolean;
  onApproved?: () => void;
  onCancelled?: () => void;
}) {
  const isUser = msg.role === "user";
  const showApproval = msg.awaitingApproval && !msg.approved && !msg.cancelled;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] text-sm leading-relaxed tracking-wide ${isUser ? "text-white/60" : "text-white/90 font-light"}`}>
        <pre className="whitespace-pre-wrap font-sans">
          {msg.content}
          {isLiveStreaming && <StreamCursor />}
        </pre>
        {msg.approved && (
          <p className="mt-2 text-[10px] font-mono text-white/40">Validé</p>
        )}
        {msg.cancelled && (
          <p className="mt-2 text-[10px] font-mono text-white/30">Annulé</p>
        )}
        {showApproval && onApproved && onCancelled && (
          <ApprovalActions
            missionId={msg.awaitingApproval!.missionId}
            onApproved={onApproved}
            onCancelled={onCancelled}
          />
        )}
        {msg.blocked && <BlockedCard info={msg.blocked} />}
      </div>
    </div>
  );
}

function BlockedCard({ info }: { info: BlockedInfo }) {
  const sorted = sortByConnectPriority(info.requiredProviders);
  const primary = sorted[0];
  const secondary = sorted.length > 1 ? sorted[1] : null;
  const primaryAction = primary ? getConnectAction(primary) : null;

  return (
    <div className="mt-4 border border-white/[0.05] px-4 py-3">
      <p className="text-[11px] font-mono text-amber-400/70">Action bloquée</p>
      <p className="mt-1 text-[11px] font-mono text-white/50">{info.message}</p>
      <div className="mt-3 flex items-center gap-3">
        {primaryAction && (
          <button
            onClick={primaryAction.execute}
            className="border border-white/[0.05] px-3 py-1.5 text-[11px] font-mono text-white/50 transition-colors hover:text-white/80 hover:border-white/[0.1]"
          >
            Connecter {primaryAction.label}
          </button>
        )}
        {secondary && (
          <button
            onClick={() => triggerConnect(secondary)}
            className="text-[10px] font-mono text-white/20 transition-colors hover:text-white/50"
          >
            ou {getConnectAction(secondary).label}
          </button>
        )}
      </div>
    </div>
  );
}

function ApprovalActions({
  missionId,
  onApproved,
  onCancelled,
}: {
  missionId: string;
  onApproved: () => void;
  onCancelled: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        onClick={async () => {
          setBusy(true);
          const ok = await approveMission(missionId);
          setBusy(false);
          if (ok) onApproved();
        }}
        disabled={busy}
        className="border border-white/[0.08] px-3 py-1.5 text-[11px] font-mono text-white/50 transition-colors hover:text-white/80 hover:border-white/[0.15] disabled:opacity-30"
      >
        {busy ? "Envoi…" : "Envoyer"}
      </button>
      <button
        onClick={() => {
          cancelMission(missionId);
          onCancelled();
        }}
        className="text-[11px] font-mono text-white/30 transition-colors hover:text-white/60"
      >
        Annuler
      </button>
    </div>
  );
}

function StreamCursor() {
  return (
    <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-px bg-white/40" style={{ animation: "blink-caret 1s step-end infinite" }} />
  );
}

/* ─── Thinking indicator ─── */

function ThinkingDots() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 opacity-50">
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

