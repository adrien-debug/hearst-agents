"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMission, detectIntent, executeMission } from "../lib/missions";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_ACTIONS = [
  { label: "Résume mes emails du jour", icon: "📬" },
  { label: "Qu'est-ce qui nécessite mon attention ?", icon: "🔔" },
  { label: "Montre mon agenda de la semaine", icon: "📅" },
  { label: "Quelles sont mes tâches en cours ?", icon: "✅" },
] as const;

const SUGGESTIONS = [
  "Mes fichiers récents",
  "Réponds aux emails urgents",
  "Montre le rapport crypto",
] as const;

const SURFACE_ROUTES: Record<string, string> = {
  inbox: "/inbox",
  calendar: "/calendar",
  files: "/files",
  tasks: "/tasks",
  apps: "/apps",
  home: "/",
};

interface ChatProps {
  defaultAgentId?: string;
}

export default function Chat({ defaultAgentId }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const { setActiveSurface } = useMission();

  const agentId = defaultAgentId ?? process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID ?? "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;
      const trimmed = text.trim();
      setInput("");
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
        const surfaceLabels: Record<string, string> = {
          inbox: "votre boîte de réception",
          calendar: "votre agenda",
          files: "vos fichiers",
          tasks: "vos tâches",
          apps: "vos applications",
          home: "l'accueil",
        };
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Je vous redirige vers ${surfaceLabels[outcome.surface]}.` },
        ]);
        setStreaming(false);
        const route = SURFACE_ROUTES[outcome.surface];
        if (route) router.push(route);
        return;
      }

      if (!agentId) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Aucun assistant configuré. Contactez l'administrateur." },
        ]);
        setStreaming(false);
        return;
      }

      try {
        const res = await fetch(`/api/agents/${agentId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, conversation_id: conversationId }),
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
    [agentId, conversationId, streaming, setActiveSurface, router],
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
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

            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="rounded-full border border-zinc-800/50 px-4 py-2 text-xs text-zinc-500 transition-all duration-200 hover:border-zinc-600 hover:text-zinc-300 active:scale-[0.98]"
                >
                  {s}
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

      <div className="border-t border-zinc-800/60 bg-zinc-950 px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Demandez n'importe quoi à Hearst..."
              rows={1}
              className="w-full resize-none rounded-xl border border-zinc-800/50 bg-zinc-900/60 px-4 py-3 pr-12 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all duration-200 focus:border-cyan-600/40"
              disabled={streaming}
              style={{ minHeight: "44px", maxHeight: "120px" }}
            />
          </div>
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white transition-all duration-200 hover:bg-cyan-400 active:scale-[0.98] disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          </button>
        </form>
        <p className="mx-auto mt-1.5 max-w-2xl text-center text-[10px] text-zinc-700">
          Hearst peut se tromper. Vérifiez les informations importantes.
        </p>
      </div>
    </div>
  );
}
