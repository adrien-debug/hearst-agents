"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChatContext } from "../lib/chat-context";
import { useMission, detectIntent, executeMission, approveMission, cancelMission } from "../lib/missions";
import { useProactiveSuggestion } from "../hooks/use-proactive-suggestion";
import { useOrchestrate, type V2Event } from "../hooks/use-orchestrate";
import { useChatActivity } from "../lib/chat-activity";
import type { Surface } from "../lib/missions-v2";
import { getConnectAction, triggerConnect, sortByConnectPriority } from "../lib/connect-actions";
import { getMissionSuggestions, type MissionSuggestion } from "../lib/missions-ui";
import { MissionComposer } from "./missions/MissionComposer";
import { OrchestrationHalo } from "./system/OrchestrationHalo";

const USE_V2 = process.env.NEXT_PUBLIC_USE_V2 !== "false";

if (typeof window !== "undefined") {
  console.log(`[ChatRuntime] Using ${USE_V2 ? "V2" : "V1"} pipeline`);
}

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

const QUICK_ACTIONS = [
  { label: "Urgents", cmd: "Qu'est-ce qui nécessite mon attention ?", primary: true },
  { label: "Messages", cmd: "Résume mes messages du jour" },
  { label: "Agenda", cmd: "Montre mon agenda du jour" },
  { label: "Fichiers", cmd: "Montre mes fichiers" },
] as const;

export default function GlobalChat() {
  const { surface, selectedItem, connectedServices, servicesLoaded, expanded, setExpanded, getContextHint } = useChatContext();
  const { setActiveSurface, activeMission } = useMission();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [v2Streaming, setV2Streaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { suggestion, dismiss: dismissSuggestion, accept: acceptSuggestion } = useProactiveSuggestion(surface);
  const v2 = useOrchestrate();
  const chatActivity = useChatActivity();

  const contextHint = getContextHint();
  const [missionSuggestion, setMissionSuggestion] = useState<MissionSuggestion | null>(null);
  const [showMissionComposer, setShowMissionComposer] = useState(false);
  const lastUserInputRef = useRef<string>("");

  // Sync v2 hook state → messages with real-time streaming
  useEffect(() => {
    if (!USE_V2) return;
    if (v2.status === "idle") return;

    const stepEvents = v2.events.filter(
      (e) => e.type === "step_started" || e.type === "step_completed" || e.type === "step_failed",
    );
    const lines: string[] = [];
    for (const e of stepEvents) {
      if (e.type === "step_started") {
        lines.push(`⟳ ${(e as V2Event).title ?? (e as V2Event).agent ?? "step"}…`);
      } else if (e.type === "step_completed") {
        const idx = lines.findLastIndex((l) => l.startsWith("⟳"));
        if (idx >= 0) lines[idx] = lines[idx].replace("⟳", "✓").replace("…", "");
      } else if (e.type === "step_failed") {
        const idx = lines.findLastIndex((l) => l.startsWith("⟳"));
        if (idx >= 0) lines[idx] = lines[idx].replace("⟳", "✗").replace("…", "");
      }
    }

    const stepBlock = lines.length > 0 ? lines.join("\n") : "";
    const hasText = v2.text.length > 0;
    const isLive = v2.status === "running" && hasText;
    const isFailed = v2.status === "failed";

    let content = hasText
      ? (stepBlock ? `${stepBlock}\n\n${v2.text}` : v2.text)
      : (stepBlock || (v2.status === "running" ? "Analyse…" : ""));

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

    setV2Streaming(isLive);

    void Promise.resolve().then(() => {
      setMessages((prev) => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].role === "assistant") {
          copy[copy.length - 1] = { role: "assistant", content, blocked };
        }
        return copy;
      });
    });

    // Detect mission suggestion opportunity on completion
    if (v2.status === "completed" && lastUserInputRef.current) {
      const hasAsset = v2.events.some((e) => e.type === "asset_generated");
      const suggestions = getMissionSuggestions(lastUserInputRef.current, hasAsset);
      if (suggestions.length > 0) {
        setMissionSuggestion(suggestions[0]);
      }
    }
  }, [v2.events, v2.text, v2.status]);

  const handleSuggestionAccept = useCallback(() => {
    if (!suggestion) return;
    const action = suggestion.action;
    acceptSuggestion();
    if (action.type === "mission") {
      const { mission } = action;
      setMessages((prev) => [...prev, { role: "assistant", content: `${mission.title}…` }]);
      if (!expanded) setExpanded(true);
      setActiveSurface(mission.surface);
      executeMission(mission);
    }
  }, [suggestion, acceptSuggestion, expanded, setExpanded, setActiveSurface]);

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
      setMissionSuggestion(null);
      setShowMissionComposer(false);
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
        }
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
        try {
          await v2.send(trimmed, surface, convId);
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

        if (process.env.NODE_ENV === "development") {
          console.log("[Chat] REQUEST", { message: trimmed, surface, hasConversation: !!conversationId });
        }

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chatBody),
        });

        if (!res.ok) {
          console.error("[Chat] RESPONSE", res.status, await res.clone().text().catch(() => ""));
        }

        if (!conversationId) {
          const cid = res.headers.get("X-Conversation-Id");
          if (cid) setConversationId(cid);
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
                  const TOOL_LABELS: Record<string, string> = {
                    get_messages: "Messages",
                    get_calendar_events: "Agenda",
                    get_files: "Fichiers",
                    agent: "Agent autonome",
                    bash: "Exécution",
                    write: "Écriture",
                    read: "Lecture",
                    web_search: "Recherche web",
                  };
                  const label = TOOL_LABELS[payload.tool] ?? payload.tool;
                  const icon = payload.status === "done" ? "✓" : payload.status === "error" ? "✗" : "⟳";
                  const stepLine = `${icon} ${label}`;
                  setMessages((prev) => {
                    const copy = [...prev];
                    const last = copy[copy.length - 1];
                    const existing = last.content;
                    if (payload.status === "running") {
                      const base = existing === "Analyse…" ? "" : existing;
                      copy[copy.length - 1] = { role: "assistant", content: base ? `${base}\n${stepLine}…` : `${stepLine}…` };
                    } else {
                      const updated = existing.replace(`⟳ ${label}…`, stepLine);
                      copy[copy.length - 1] = { role: "assistant", content: updated };
                    }
                    return copy;
                  });
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
    [conversationId, streaming, surface, selectedItem, connectedServices, servicesLoaded, expanded, setExpanded, setActiveSurface, router],
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
        <OrchestrationHalo />
      </div>

      {/* Input Bar */}
      <div className="relative group">
        <div className="absolute inset-0 bg-white/5 rounded-2xl blur-xl transition-opacity duration-500 opacity-0 group-focus-within:opacity-100" />
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="relative flex items-center bg-white/3 backdrop-blur-2xl rounded-2xl overflow-hidden transition-all duration-300 focus-within:bg-white/5"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => { if (messages.length > 0) setExpanded(true); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Ask anything..."
            rows={1}
            className="flex-1 bg-transparent border-none text-sm text-white/90 placeholder-white/30 px-6 py-4 outline-none resize-none min-h-[52px]"
            disabled={streaming}
          />
          <button type="submit" disabled={streaming || !input.trim()} className="flex items-center justify-center w-12 h-12 mr-2 rounded-xl text-white/50 hover:text-white transition-colors disabled:opacity-20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          </button>
        </form>
      </div>
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
          <p className="mt-2 text-[10px] font-mono text-emerald-400">Validé</p>
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
    <div className="mt-4 rounded-xl bg-amber-500/5 px-4 py-3">
      <p className="text-[11px] font-mono text-amber-400/90">Action bloquée</p>
      <p className="mt-1 text-[11px] font-mono text-white/60">{info.message}</p>
      <div className="mt-3 flex items-center gap-3">
        {primaryAction && (
          <button
            onClick={primaryAction.execute}
            className="rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-mono text-cyan-400 transition-colors hover:bg-white/10 hover:text-cyan-300"
          >
            Connecter {primaryAction.label}
          </button>
        )}
        {secondary && (
          <button
            onClick={() => triggerConnect(secondary)}
            className="text-[10px] font-mono text-white/30 transition-colors hover:text-white/60"
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
        className="rounded-lg bg-cyan-500/10 px-3 py-1.5 text-[11px] font-mono text-cyan-400 transition-colors hover:bg-cyan-500/20 active:scale-[0.97] disabled:opacity-50"
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
    <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-px animate-pulse bg-cyan-400" />
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

