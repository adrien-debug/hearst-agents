"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChatContext } from "../lib/chat-context";
import { useMission, detectIntent, approveMission, cancelMission } from "../lib/missions";
import { useOrchestrate, type V2Event } from "../hooks/use-orchestrate";
import { useChatActivity } from "../lib/chat-activity";
import { getConnectAction, triggerConnect, sortByConnectPriority } from "../lib/connect-actions";

import { useThreadSwitchOptional } from "../hooks/use-thread-switch";
import { resolveConversationId, type ChatMessage } from "../lib/thread-memory";
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
          const threadId = sidebarCtx?.state.activeThreadId;
          convId = resolveConversationId(threadId);
          setConversationId(convId);
        }
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
        const focalCtx = focalObject
          ? { id: focalObject.id, objectType: focalObject.objectType, title: focalObject.title, status: focalObject.status }
          : undefined;
        const activeThreadId = sidebarCtx?.state.activeThreadId;
        try {
          await v2.send(trimmed, surface, convId, focalCtx, activeThreadId ?? undefined);
        } finally {
          setStreaming(false);
        }
        return;
      }

      // ── Legacy v1 pipeline via /api/chat ──────────────────
      let didFail = false;
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

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
  const showStreamCursor = v2Streaming && lastMsg?.role === "assistant" && lastMsg.content.length > 0;
  const [inputFlash, setInputFlash] = useState(false);

  const handleSend = useCallback((text: string) => {
    if (!text.trim()) return;
    setInputFlash(true);
    setTimeout(() => setInputFlash(false), 80);
    sendMessage(text);
  }, [sendMessage]);

  return (
    <div className="shrink-0 w-full max-w-2xl mx-auto px-6 pb-6 relative">
      {/* Messages */}
      {expanded && messages.length > 0 && (
        <div className="max-h-[40vh] overflow-y-auto scrollbar-hide mb-4">
          <div className="flex flex-col gap-4 py-2">
            {messages.map((m, i) => (
              <ChatMessage
                key={i}
                msg={m}
                isLiveStreaming={i === messages.length - 1 && showStreamCursor}
                onApproved={() => handleApproval(i)}
                onCancelled={() => handleCancellation(i)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {/* Chat Bar */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
        className="chat-bar"
      >
        <div className="shrink-0 ml-2">
          <div className="w-7 h-7 rounded-full bg-cyan-accent/10 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-cyan-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
          </div>
        </div>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => { if (messages.length > 0) setExpanded(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
          placeholder="Ask Hearst OS anything..."
          rows={1}
          className={`flex-1 bg-transparent border-none outline-none text-sm resize-none py-2.5 transition-colors duration-75 ${inputFlash ? "text-white" : "text-white/80"} placeholder:text-white/20 ${streaming ? "caret-amber-400" : "caret-white"}`}
          disabled={streaming}
        />
        <div className="flex gap-1.5 mr-1.5">
          <button type="button" className="w-7 h-7 flex items-center justify-center text-white/20 hover:text-cyan-accent transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
          </button>
          <button type="submit" disabled={streaming || !input.trim()} className="w-7 h-7 flex items-center justify-center bg-white text-black rounded-full hover:bg-cyan-accent transition-all disabled:opacity-30">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
          </button>
        </div>
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
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} relative group`}>
      <div className={`max-w-[85%] text-sm leading-relaxed tracking-wide ${isUser ? "text-white/50 text-right" : "text-white/70 font-light"}`}>
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
    <div className="mt-4 border border-white/5 px-4 py-3">
      <p className="text-[11px] font-mono text-amber-400/70">Action bloquée</p>
      <p className="mt-1 text-[11px] font-mono text-white/50">{info.message}</p>
      <div className="mt-3 flex items-center gap-3">
        {primaryAction && (
          <button
            onClick={primaryAction.execute}
            className="border border-amber-500 px-3 py-1.5 text-[11px] font-mono text-amber-500 bg-transparent transition-colors hover:bg-amber-500/10 hover:border-amber-500/80 cursor-pointer"
          >
            Connecter {primaryAction.label}
          </button>
        )}
        {secondary && (
          <button
            onClick={() => triggerConnect(secondary)}
            className="text-[10px] font-mono text-white/30 transition-colors hover:text-white/50"
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
        className="border border-amber-500 px-3 py-1.5 text-[11px] font-mono text-amber-500 bg-transparent transition-colors hover:bg-amber-500/10 hover:border-amber-500/80 disabled:opacity-30 cursor-pointer"
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

