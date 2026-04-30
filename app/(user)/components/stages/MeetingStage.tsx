"use client";

import { useState, useEffect, useCallback } from "react";
import { useStageStore } from "@/stores/stage";
import { useStageData } from "@/stores/stage-data";
import { toast } from "@/app/hooks/use-toast";
import { StageActionBar, type StageAction } from "./StageActionBar";

interface MeetingStageProps {
  meetingId: string;
}

interface ActionItem {
  action: string;
  owner?: string;
  deadline?: string;
}

interface MeetingStatusResponse {
  status: string;
  transcript: string;
  actionItems: ActionItem[];
  videoUrl?: string;
}

export function MeetingStage({ meetingId }: MeetingStageProps) {
  const back = useStageStore((s) => s.back);
  const setMode = useStageStore((s) => s.setMode);

  const [meetingUrl, setMeetingUrl] = useState("");
  const [starting, setStarting] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [transcript, setTranscript] = useState<string>("");
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [selectedActions, setSelectedActions] = useState<Set<number>>(new Set());

  // Sync vers stage-data pour ContextRailForMeeting (C-light read-only).
  const setMeetingSlice = useStageData((s) => s.setMeeting);
  useEffect(() => {
    setMeetingSlice({ actionItems, transcript, status });
  }, [actionItems, transcript, status, setMeetingSlice]);

  // Reset quand on quitte la session (meetingId vidé par le bouton Stop).
  useEffect(() => {
    if (!meetingId) setMeetingSlice({ actionItems: [], transcript: "", status: "" });
  }, [meetingId, setMeetingSlice]);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/v2/meetings/${meetingId}`);
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as MeetingStatusResponse;
          if (cancelled) return;
          setStatus(data.status ?? "");
          setTranscript(data.transcript ?? "");
          setActionItems(data.actionItems ?? []);
          if (data.status !== "completed") {
            timer = setTimeout(poll, 5_000);
          }
        } else {
          timer = setTimeout(poll, 5_000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, 5_000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [meetingId]);

  const onStart = useCallback(async () => {
    const url = meetingUrl.trim();
    if (!url || starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/v2/meetings/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingUrl: url }),
      });
      const data = (await res.json()) as { meetingId?: string; error?: string; message?: string };
      if (!res.ok || !data.meetingId) {
        toast.error("Échec lancement bot", data.message ?? data.error ?? "Erreur inconnue");
        return;
      }
      setMode({ mode: "meeting", meetingId: data.meetingId });
    } catch (err) {
      toast.error(
        "Échec lancement bot",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setStarting(false);
    }
  }, [meetingUrl, starting, setMode]);

  const toggleAction = (idx: number) => {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const onApproveSelected = () => {
    const selected = Array.from(selectedActions)
      .map((idx) => actionItems[idx])
      .filter((a): a is ActionItem => Boolean(a));
    console.log("[approval] actions:", selected);
    toast.info(
      "Composio non branché",
      "L'exécution réelle des actions arrive en Phase B — pour l'instant les sélections sont loguées en console.",
    );
  };

  const headerLabel = meetingId
    ? status
      ? status.toUpperCase().slice(0, 16)
      : meetingId.slice(0, 8)
    : "STANDBY";

  const meetingPrimary: StageAction | undefined =
    meetingId && selectedActions.size > 0
      ? {
          id: "approve",
          label: `Approuver (${selectedActions.size})`,
          onClick: onApproveSelected,
        }
      : undefined;

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-center)" }}
    >
      <StageActionBar
        context={
          <>
            <span
              className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
            />
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
              MEETING
            </span>
            <span
              className="rounded-pill bg-[var(--text-ghost)]"
              style={{ width: "var(--space-1)", height: "var(--space-1)" }}
            />
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
              {headerLabel}
            </span>
          </>
        }
        primary={meetingPrimary}
        onBack={back}
      />

      {meetingId === "" ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md flex flex-col gap-6">
            <span
              className="block text-[var(--cykan)] opacity-30 halo-cyan-md mx-auto t-34"
              style={{ height: "var(--height-stage-empty-icon)" }}
              aria-hidden
            >
              ◍
            </span>
            <p
              className="t-15 font-medium tracking-tight text-[var(--text)]"
              style={{ lineHeight: "var(--leading-snug)" }}
            >
              Aucun meeting actif
            </p>
            <p
              className="t-13 text-[var(--text-muted)]"
              style={{ lineHeight: "var(--leading-base)" }}
            >
              Colle l{"'"}URL d{"'"}un meeting Zoom, Meet ou Teams. L
              {"'"}agent rejoint, transcrit en temps réel et détecte les{" "}
              <em>action items</em>.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void onStart();
              }}
              className="flex flex-col gap-3"
            >
              <input
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://zoom.us/j/..."
                className="input-focus-signature w-full bg-transparent border border-[var(--border-shell)] focus:outline-none t-13 text-[var(--text)] placeholder:text-[var(--text-faint)]"
                style={{
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                }}
                disabled={starting}
              />
              <button
                type="submit"
                disabled={starting || !meetingUrl.trim()}
                className="halo-on-hover inline-flex items-center justify-center gap-2 px-4 py-2 t-9 font-mono uppercase tracking-section border border-[var(--cykan)] text-[var(--cykan)] bg-[var(--cykan)]/[0.06] hover:bg-[var(--cykan)]/[0.12] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {starting ? "Lancement…" : "Lancer le bot"}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          <section
            className="basis-3/5 flex flex-col min-h-0 border-r border-[var(--border-default)]"
            style={{ padding: "var(--space-6)", gap: "var(--space-4)" }}
          >
            <header className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
              TRANSCRIPT
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {transcript.trim().length === 0 ? (
                <p className="t-11 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                  En attente du transcript…
                </p>
              ) : (
                <pre className="t-13 font-light text-[var(--text-muted)] whitespace-pre-wrap font-sans">
                  {transcript}
                </pre>
              )}
            </div>
          </section>

          <section
            className="basis-2/5 flex flex-col min-h-0"
            style={{ padding: "var(--space-6)", gap: "var(--space-4)" }}
          >
            <header className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
              ACTION_ITEMS · {actionItems.length}
            </header>
            <div
              className="flex-1 min-h-0 overflow-y-auto flex flex-col"
              style={{ gap: "var(--space-3)" }}
            >
              {actionItems.length === 0 ? (
                <p className="t-11 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                  Aucune action détectée pour le moment
                </p>
              ) : (
                actionItems.map((item, idx) => {
                  const checked = selectedActions.has(idx);
                  return (
                    <label
                      key={idx}
                      className="flex items-start gap-3 border-l-2 border-[var(--cykan)]/30 cursor-pointer hover:border-[var(--cykan)] transition-colors"
                      style={{ padding: "var(--space-3)" }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAction(idx)}
                        className="mt-1 accent-[var(--cykan)]"
                      />
                      <div className="flex-1 flex flex-col gap-1 min-w-0">
                        <p className="t-13 text-[var(--text)]">{item.action}</p>
                        {(item.owner || item.deadline) && (
                          <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                            {[item.owner, item.deadline]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
