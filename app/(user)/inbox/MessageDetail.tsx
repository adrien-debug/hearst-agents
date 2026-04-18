"use client";

import type { UnifiedMessage } from "@/lib/connectors/unified-types";

interface MessageDetailProps {
  message: UnifiedMessage;
  onBack: () => void;
  onReplyWithAI?: () => void;
}

function formatDate(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function MessageDetail({ message, onBack, onReplyWithAI }: MessageDetailProps) {
  const initials = message.from
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const date = formatDate(message.timestamp);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800/60 px-6 py-4">
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-white">
              {message.context ?? message.subject}
            </h1>
            <span className="shrink-0 rounded bg-zinc-800/50 px-1.5 py-0.5 text-[9px] font-medium capitalize text-zinc-500">
              {message.source.provider === "gmail" ? "Email" : message.source.provider}
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            {message.from} · {date}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800">
            <span className="text-sm font-semibold text-white">{initials}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-white">{message.from}</p>
            {message.fromDetail && (
              <p className="text-xs text-zinc-600">{message.fromDetail}</p>
            )}
            {message.context && (
              <p className="text-xs text-zinc-500">{message.context}</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-5">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
            {message.body}
          </pre>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-zinc-800/60 px-6 py-4">
        {message.canReply ? (
          <>
            <button className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white">
              Répondre
            </button>
            {onReplyWithAI && (
              <button
                onClick={onReplyWithAI}
                className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                Répondre avec Hearst
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-zinc-600">Lecture seule</p>
        )}
        <button className="ml-auto rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-600 transition-colors hover:border-zinc-600 hover:text-zinc-400">
          Archiver
        </button>
      </div>
    </div>
  );
}
