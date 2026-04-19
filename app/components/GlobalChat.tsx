"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChatContext } from "../lib/chat-context";
import { useMission, detectIntent, executeMission, approveMission, cancelMission } from "../lib/missions";
import { useProactiveSuggestion } from "../hooks/use-proactive-suggestion";
import { useOrchestrate, type V2Event } from "../hooks/use-orchestrate";
import { useChatActivity } from "../lib/chat-activity";
import ProactiveSuggestion from "./ProactiveSuggestion";
import { ToolSurface } from "./tool-surface/ToolSurface";
import { TOOL_INTENTS } from "../lib/tool-intents";
import type { Surface } from "../lib/missions-v2";
import { getConnectAction, triggerConnect, sortByConnectPriority } from "../lib/connect-actions";
import { getMissionSuggestions, type MissionSuggestion } from "../lib/missions-ui";
import { MissionComposer } from "./missions/MissionComposer";
import { ServiceLayer } from "./system/ServiceLayer";

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
    <div className="relative">
      {expanded && messages.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 max-h-[50vh] overflow-y-auto border-t border-zinc-800/20 bg-zinc-950/98 backdrop-blur-md">
          <div className="mx-auto max-w-2xl px-4 py-4">
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

            {/* Mission suggestion CTA */}
            {missionSuggestion && !showMissionComposer && !streaming && (
              <div className="mb-3 flex justify-start">
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
                  <p className="text-[11px] text-zinc-300">{missionSuggestion.label}</p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">{missionSuggestion.scheduleHint}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      onClick={() => setShowMissionComposer(true)}
                      className="rounded-md bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20"
                    >
                      Planifier cette tâche
                    </button>
                    <button
                      onClick={() => setMissionSuggestion(null)}
                      className="text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
                    >
                      Ignorer
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Inline mission composer */}
            {showMissionComposer && missionSuggestion && (
              <div className="mb-3">
                <MissionComposer
                  presetName={missionSuggestion.presetName}
                  presetPrompt={missionSuggestion.presetPrompt}
                  presetSchedule={missionSuggestion.presetSchedule}
                  onSaved={() => {
                    setShowMissionComposer(false);
                    setMissionSuggestion(null);
                  }}
                  onCancel={() => {
                    setShowMissionComposer(false);
                  }}
                />
              </div>
            )}

            <div ref={bottomRef} />
          </div>
          <button
            onClick={() => setExpanded(false)}
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
      )}

      {/* Suggestion — inline above input */}
      {suggestion && !streaming && !expanded && (
        <div className="px-3 py-1.5">
          <ProactiveSuggestion
            suggestion={suggestion}
            onAccept={handleSuggestionAccept}
            onDismiss={dismissSuggestion}
          />
        </div>
      )}

      <ToolSurface onToolClick={(id) => {
        const intent = TOOL_INTENTS[id];
        if (intent) sendMessage(intent);
      }} />

      <ServiceLayer />

      <ChatInputBar
        input={input}
        setInput={setInput}
        streaming={streaming}
        contextHint={contextHint}
        onSend={sendMessage}
        inputRef={inputRef}
        compact
        onFocus={() => { if (messages.length > 0) setExpanded(true); }}
      />
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
    <div className={`mb-3 flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-800">
          <span className="text-[9px] font-bold text-zinc-300">H</span>
        </div>
      )}
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
        isUser ? "bg-zinc-800 text-zinc-100" : "text-zinc-300"
      }`}>
        <pre className="whitespace-pre-wrap font-sans">
          {msg.content}
          {isLiveStreaming && <StreamCursor />}
        </pre>
        {msg.approved && (
          <p className="mt-1 text-[10px] text-emerald-400">Validé</p>
        )}
        {msg.cancelled && (
          <p className="mt-1 text-[10px] text-zinc-500">Annulé</p>
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

/* ─── Blocked-state card ─── */

function BlockedCard({ info }: { info: BlockedInfo }) {
  const sorted = sortByConnectPriority(info.requiredProviders);
  const primary = sorted[0];
  const secondary = sorted.length > 1 ? sorted[1] : null;
  const primaryAction = primary ? getConnectAction(primary) : null;

  return (
    <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
      <p className="text-[11px] font-medium text-amber-400/90">Action bloquée</p>
      <p className="mt-0.5 text-[11px] text-zinc-400">{info.message}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {primaryAction && (
          <button
            onClick={primaryAction.execute}
            className="rounded-md bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-cyan-400 transition-colors hover:bg-zinc-700 hover:text-cyan-300"
          >
            Connecter {primaryAction.label}
          </button>
        )}
        {secondary && (
          <button
            onClick={() => triggerConnect(secondary)}
            className="text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            ou {getConnectAction(secondary).label}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Approval inline buttons ─── */

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
    <div className="mt-2 flex items-center gap-2">
      <button
        onClick={async () => {
          setBusy(true);
          const ok = await approveMission(missionId);
          setBusy(false);
          if (ok) onApproved();
        }}
        disabled={busy}
        className="rounded-md bg-cyan-500 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-cyan-400 active:scale-[0.97] disabled:opacity-50"
      >
        {busy ? "Envoi…" : "Envoyer"}
      </button>
      <button
        onClick={() => {
          cancelMission(missionId);
          onCancelled();
        }}
        className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
      >
        Annuler
      </button>
    </div>
  );
}

/* ─── Streaming cursor ─── */

function StreamCursor() {
  return (
    <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-px animate-pulse bg-cyan-400" />
  );
}

/* ─── Thinking indicator ─── */

function ThinkingDots() {
  return (
    <div className="mb-3 flex justify-start">
      <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-800">
        <span className="text-[9px] font-bold text-zinc-300">H</span>
      </div>
      <div className="flex items-center gap-1 px-3 py-2">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500 [animation-delay:0.15s]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500 [animation-delay:0.3s]" />
      </div>
    </div>
  );
}

/* ─── Input bar ─── */

function ChatInputBar({
  input,
  setInput,
  streaming,
  contextHint,
  onSend,
  inputRef,
  compact,
  onFocus,
}: {
  input: string;
  setInput: (v: string) => void;
  streaming: boolean;
  contextHint: string;
  onSend: (text: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  compact?: boolean;
  onFocus?: () => void;
}) {
  return (
    <div className={`bg-zinc-950 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      {contextHint && (
        <p className={`mx-auto max-w-2xl text-[10px] text-zinc-600 ${compact ? "mb-1" : "mb-1.5"}`}>
          {contextHint}
        </p>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); onSend(input); }}
        className={`mx-auto flex items-end gap-2 ${compact ? "max-w-none" : "max-w-2xl"}`}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={onFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(input); }
          }}
          placeholder="Ask anything or give a task..."
          rows={1}
          className={`flex-1 resize-none rounded-xl border border-zinc-800/30 bg-zinc-900/50 text-sm text-zinc-100 placeholder-zinc-600 shadow-[0_1px_3px_rgba(0,0,0,0.2)] outline-none transition-all duration-150 focus:border-cyan-600/30 focus:shadow-[0_1px_6px_rgba(0,0,0,0.3)] ${
            compact ? "px-3 py-2.5" : "px-4 py-3"
          }`}
          disabled={streaming}
          style={{ minHeight: compact ? "38px" : "44px", maxHeight: "120px" }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className={`shrink-0 rounded-xl bg-cyan-500 text-white shadow-sm transition-all duration-150 hover:bg-cyan-400 active:scale-[0.97] disabled:opacity-20 ${
            compact ? "flex h-[38px] w-[38px] items-center justify-center" : "flex h-11 w-11 items-center justify-center"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
          </svg>
        </button>
      </form>
    </div>
  );
}
