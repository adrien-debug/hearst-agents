"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useChatContext } from "../lib/chat-context";
import { useMission, detectIntent, executeMission } from "../lib/missions";
import type { Surface } from "../lib/missions/types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SURFACE_ROUTES: Record<string, string> = {
  inbox: "/inbox",
  calendar: "/calendar",
  files: "/files",
  tasks: "/tasks",
  apps: "/apps",
  home: "/",
};

const SURFACE_LABELS: Record<string, string> = {
  inbox: "votre boîte de réception",
  calendar: "votre agenda",
  files: "vos fichiers",
  tasks: "vos tâches",
  apps: "vos applications",
  home: "l'accueil",
};

const QUICK_ACTIONS = [
  { label: "Résume mes emails du jour", icon: "📬" },
  { label: "Qu'est-ce qui nécessite mon attention ?", icon: "🔔" },
  { label: "Montre mon agenda de la semaine", icon: "📅" },
  { label: "Quelles sont mes tâches en cours ?", icon: "✅" },
] as const;

export default function GlobalChat() {
  const { surface, selectedItem, connectedServices, expanded, setExpanded, getContextHint } = useChatContext();
  const { setActiveSurface } = useMission();
  const router = useRouter();
  const pathname = usePathname();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isHome = pathname === "/";
  const contextHint = getContextHint();

  useEffect(() => {
    if (expanded) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Je m'en occupe. Je lance : "${outcome.mission.title}".\nVous pouvez suivre l'avancement dans le panneau à droite.`,
          },
        ]);
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
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Je vous redirige vers ${SURFACE_LABELS[outcome.surface]}.` },
        ]);
        setStreaming(false);
        const route = SURFACE_ROUTES[outcome.surface];
        if (route) router.push(route);
        return;
      }

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            conversation_id: conversationId,
            context: {
              surface,
              selectedItem: selectedItem ?? undefined,
              connectedServices,
            },
          }),
        });

        if (!conversationId) {
          const cid = res.headers.get("X-Conversation-Id");
          if (cid) setConversationId(cid);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

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
                  assistantContent += payload.delta;
                  setMessages((prev) => {
                    const copy = [...prev];
                    copy[copy.length - 1] = { role: "assistant", content: assistantContent };
                    return copy;
                  });
                }
              } catch {
                /* skip */
              }
            }
          }
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Impossible de se connecter. Réessayez." },
        ]);
      } finally {
        setStreaming(false);
      }
    },
    [conversationId, streaming, surface, selectedItem, connectedServices, expanded, setExpanded, setActiveSurface, router],
  );

  // On home page, render full-page chat
  if (isHome) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6">
              <div className="mb-8 text-center">
                <h1 className="text-2xl font-semibold text-white">Bonjour</h1>
                <p className="mt-2 text-sm text-zinc-500">
                  Comment puis-je vous aider aujourd&apos;hui ?
                </p>
              </div>
              <div className="mb-8 grid w-full max-w-lg grid-cols-2 gap-2.5">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => sendMessage(qa.label)}
                    className="flex items-center gap-3 rounded-xl border border-zinc-800/50 bg-zinc-900/40 px-4 py-3.5 text-left text-sm text-zinc-400 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-800/50 hover:text-white active:scale-[0.98]"
                  >
                    <span className="text-base">{qa.icon}</span>
                    <span className="leading-tight">{qa.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl px-4 py-6">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`mb-4 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "assistant" && (
                    <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                      <span className="text-[10px] font-bold text-zinc-300">H</span>
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === "user" ? "bg-zinc-800 text-zinc-100" : "text-zinc-300"
                    }`}
                  >
                    <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                  </div>
                </div>
              ))}
              {streaming && messages[messages.length - 1]?.content === "" && (
                <div className="mb-4 flex justify-start">
                  <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                    <span className="text-[10px] font-bold text-zinc-300">H</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-2xl px-4 py-3">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:0.2s]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input bar — full page version */}
        <ChatInputBar
          input={input}
          setInput={setInput}
          streaming={streaming}
          contextHint={contextHint}
          connectedServices={connectedServices}
          onSend={sendMessage}
          inputRef={inputRef}
        />
      </div>
    );
  }

  // On other pages, render as bottom overlay
  return (
    <div className="relative">
      {/* Expanded chat overlay */}
      {expanded && messages.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 max-h-[50vh] overflow-y-auto border-t border-zinc-800/60 bg-zinc-950/98 backdrop-blur-sm">
          <div className="mx-auto max-w-2xl px-4 py-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-800">
                    <span className="text-[9px] font-bold text-zinc-300">H</span>
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user" ? "bg-zinc-800 text-zinc-100" : "text-zinc-300"
                  }`}
                >
                  <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                </div>
              </div>
            ))}
            {streaming && messages[messages.length - 1]?.content === "" && (
              <div className="mb-3 flex justify-start">
                <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-800">
                  <span className="text-[9px] font-bold text-zinc-300">H</span>
                </div>
                <div className="flex items-center gap-1 px-3 py-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:0.2s]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:0.4s]" />
                </div>
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

      {/* Input bar */}
      <ChatInputBar
        input={input}
        setInput={setInput}
        streaming={streaming}
        contextHint={contextHint}
        connectedServices={connectedServices}
        onSend={sendMessage}
        inputRef={inputRef}
        compact
        onFocus={() => { if (messages.length > 0) setExpanded(true); }}
      />
    </div>
  );
}

/* ─── Shared input bar ─── */

function ChatInputBar({
  input,
  setInput,
  streaming,
  contextHint,
  connectedServices,
  onSend,
  inputRef,
  compact,
  onFocus,
}: {
  input: string;
  setInput: (v: string) => void;
  streaming: boolean;
  contextHint: string;
  connectedServices: string[];
  onSend: (text: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  compact?: boolean;
  onFocus?: () => void;
}) {
  return (
    <div className={`border-t border-zinc-800/60 bg-zinc-950 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      {/* Connected services bar */}
      {connectedServices.length > 0 && !compact && (
        <div className="mx-auto mb-2 flex max-w-2xl items-center gap-1.5">
          {connectedServices.map((svc) => (
            <span
              key={svc}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-800/50 px-2 py-0.5 text-[9px] text-zinc-500"
            >
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              {svc}
            </span>
          ))}
        </div>
      )}

      {/* Context hint */}
      {contextHint && (
        <p className={`mx-auto max-w-2xl text-[10px] text-zinc-600 ${compact ? "mb-1.5" : "mb-2"}`}>
          {contextHint}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend(input);
        }}
        className={`mx-auto flex items-end gap-2 ${compact ? "max-w-none" : "max-w-2xl"}`}
      >
        <div className="relative flex-1">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={onFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend(input);
              }
            }}
            placeholder="Demandez n'importe quoi à Hearst..."
            rows={1}
            className={`w-full resize-none rounded-xl border border-zinc-800/50 bg-zinc-900/60 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all duration-200 focus:border-cyan-600/40 ${
              compact ? "px-3 py-2 pr-10" : "px-4 py-3 pr-12"
            }`}
            disabled={streaming}
            style={{ minHeight: compact ? "36px" : "44px", maxHeight: "120px" }}
          />
        </div>
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className={`shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white transition-all duration-200 hover:bg-cyan-400 active:scale-[0.98] disabled:opacity-30 ${
            compact ? "flex h-9 w-9" : "flex h-11 w-11"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
          </svg>
        </button>
      </form>
      {!compact && (
        <p className="mx-auto mt-1.5 max-w-2xl text-center text-[10px] text-zinc-700">
          Hearst peut se tromper. Vérifiez les informations importantes.
        </p>
      )}
    </div>
  );
}
