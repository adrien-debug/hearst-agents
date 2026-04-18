"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useChatContext } from "../lib/chat-context";
import { useMission, detectIntent, executeMission, approveMission, cancelMission } from "../lib/missions";
import { useProactiveSuggestion } from "../hooks/use-proactive-suggestion";
import ProactiveSuggestion from "./ProactiveSuggestion";
import type { Surface } from "../lib/missions/types";

interface Message {
  role: "user" | "assistant";
  content: string;
  awaitingApproval?: { missionId: string };
  approved?: boolean;
  cancelled?: boolean;
}

const SURFACE_ROUTES: Record<string, string> = {
  inbox: "/inbox",
  calendar: "/calendar",
  files: "/files",
  tasks: "/tasks",
  apps: "/apps",
  home: "/",
};

const QUICK_ACTIONS = [
  { label: "Résume mes emails", cmd: "Résume mes emails du jour" },
  { label: "Mon attention ?", cmd: "Qu'est-ce qui nécessite mon attention ?" },
  { label: "Agenda", cmd: "Montre mon agenda de la semaine" },
  { label: "Tâches", cmd: "Quelles sont mes tâches en cours ?" },
] as const;

export default function GlobalChat() {
  const { surface, selectedItem, connectedServices, expanded, setExpanded, getContextHint } = useChatContext();
  const { setActiveSurface, activeMission } = useMission();
  const router = useRouter();
  const pathname = usePathname();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { suggestion, dismiss: dismissSuggestion, accept: acceptSuggestion } = useProactiveSuggestion(surface);

  const isHome = pathname === "/";
  const contextHint = getContextHint();

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
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setStreaming(true);

      const outcome = detectIntent(trimmed);

      if (outcome.type === "mission") {
        setMessages((prev) => [...prev, { role: "assistant", content: `${outcome.mission.title}…` }]);
        setStreaming(false);
        setActiveSurface(outcome.mission.surface);
        if (SURFACE_ROUTES[outcome.mission.surface] && outcome.mission.surface !== "home") {
          router.push(SURFACE_ROUTES[outcome.mission.surface]);
        }
        executeMission(outcome.mission);
        return;
      }

      if (outcome.type === "navigate") {
        setActiveSurface(outcome.surface);
        setStreaming(false);
        const route = SURFACE_ROUTES[outcome.surface];
        if (route) router.push(route);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let receivedFirstToken = false;
      const fallbackTimer = setTimeout(() => {
        if (!receivedFirstToken) {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant" && last.content === "") {
              copy[copy.length - 1] = { role: "assistant", content: "Analyse…" };
            }
            return copy;
          });
        }
      }, 1000);

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
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const payload = JSON.parse(line.slice(6));
                if (payload.delta) {
                  if (!receivedFirstToken) {
                    receivedFirstToken = true;
                    clearTimeout(fallbackTimer);
                  }
                  assistantContent += payload.delta;
                  setMessages((prev) => {
                    const copy = [...prev];
                    copy[copy.length - 1] = { role: "assistant", content: assistantContent };
                    return copy;
                  });
                }
              } catch { /* skip */ }
            }
          }
        }
      } catch {
        clearTimeout(fallbackTimer);
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: "Connexion impossible." };
          return copy;
        });
      } finally {
        clearTimeout(fallbackTimer);
        setStreaming(false);
      }
    },
    [conversationId, streaming, surface, selectedItem, connectedServices, expanded, setExpanded, setActiveSurface, router],
  );

  const handleApproval = useCallback((idx: number) => {
    setMessages((prev) => prev.map((m, i) => i === idx ? { ...m, approved: true } : m));
  }, []);

  const handleCancellation = useCallback((idx: number) => {
    setMessages((prev) => prev.map((m, i) => i === idx ? { ...m, cancelled: true } : m));
  }, []);

  const isThinking = streaming && (
    messages[messages.length - 1]?.content === "" ||
    messages[messages.length - 1]?.content === "Analyse…"
  );

  // Home page — full chat
  if (isHome) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6">
              <h1 className="mb-6 text-2xl font-semibold text-white">Bonjour</h1>

              {/* Suggestion */}
              {suggestion && !streaming && (
                <div className="mb-4 w-full max-w-md">
                  <ProactiveSuggestion
                    suggestion={suggestion}
                    onAccept={handleSuggestionAccept}
                    onDismiss={dismissSuggestion}
                  />
                </div>
              )}

              {/* Quick actions */}
              <div className="flex flex-wrap justify-center gap-2">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => sendMessage(qa.cmd)}
                    className="rounded-lg border border-zinc-800/50 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white active:scale-[0.98]"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl px-4 py-6">
              {messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  msg={m}
                  onApproved={() => handleApproval(i)}
                  onCancelled={() => handleCancellation(i)}
                />
              ))}
              {isThinking && <ThinkingDots />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <ChatInputBar
          input={input}
          setInput={setInput}
          streaming={streaming}
          contextHint={contextHint}
          onSend={sendMessage}
          inputRef={inputRef}
        />
      </div>
    );
  }

  // Other pages — bottom overlay
  return (
    <div className="relative">
      {expanded && messages.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 max-h-[50vh] overflow-y-auto border-t border-zinc-800/60 bg-zinc-950/98 backdrop-blur-sm">
          <div className="mx-auto max-w-2xl px-4 py-4">
            {messages.map((m, i) => (
              <ChatMessage
                key={i}
                msg={m}
                onApproved={() => handleApproval(i)}
                onCancelled={() => handleCancellation(i)}
              />
            ))}
            {isThinking && <ThinkingDots />}
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
  onApproved,
  onCancelled,
}: {
  msg: Message;
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
        <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
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
    <div className={`border-t border-zinc-800/60 bg-zinc-950 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
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
          placeholder="Demandez à Hearst…"
          rows={1}
          className={`flex-1 resize-none rounded-xl border border-zinc-800/50 bg-zinc-900/60 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-600/40 ${
            compact ? "px-3 py-2" : "px-4 py-3"
          }`}
          disabled={streaming}
          style={{ minHeight: compact ? "36px" : "44px", maxHeight: "120px" }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className={`shrink-0 rounded-xl bg-cyan-500 text-white transition-colors hover:bg-cyan-400 active:scale-[0.97] disabled:opacity-30 ${
            compact ? "flex h-9 w-9 items-center justify-center" : "flex h-11 w-11 items-center justify-center"
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
