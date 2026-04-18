"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { gmailToUnifiedMessage, slackToUnifiedMessage } from "@/lib/connectors/unified-types";
import { applyPriorities } from "@/lib/connectors/priority";
import { detectSuggestions, type Suggestion } from "../lib/suggestions";
import type { UnifiedMessage } from "@/lib/connectors/unified-types";

const DISMISSED_KEY = "hearst_dismissed_suggestions";

function getDismissed(): Set<string> {
  try {
    if (typeof window === "undefined") return new Set();
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function addDismissed(type: string) {
  try {
    const set = getDismissed();
    set.add(type);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch { /* ok */ }
}

function getSuggestionType(s: Suggestion): string {
  if (s.action.type === "mission") {
    return (s.action.mission.title ?? "").slice(0, 30);
  }
  return s.action.type;
}

export function useProactiveSuggestion(surface: string) {
  const { data: session } = useSession();
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (surface !== "inbox" || !session || fetched.current || dismissed) return;
    fetched.current = true;

    const timer = setTimeout(() => {
      Promise.all([
        fetch("/api/gmail/messages")
          .then((r) => (r.ok ? r.json() : { emails: [] }))
          .then((d) => (Array.isArray(d.emails) ? d.emails.map(gmailToUnifiedMessage) : []))
          .catch(() => [] as UnifiedMessage[]),
        fetch("/api/slack/messages")
          .then((r) => (r.ok ? r.json() : { messages: [] }))
          .then((d) => (Array.isArray(d.messages) ? d.messages.map(slackToUnifiedMessage) : []))
          .catch(() => [] as UnifiedMessage[]),
      ]).then(([gmail, slack]) => {
        const all = applyPriorities([...gmail, ...slack]);
        const s = detectSuggestions(all);
        if (s) {
          const type = getSuggestionType(s);
          if (!getDismissed().has(type)) {
            setSuggestion(s);
          }
        }
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [surface, session, dismissed]);

  useEffect(() => {
    if (surface !== "inbox") {
      fetched.current = false;
    }
  }, [surface]);

  const dismiss = useCallback(() => {
    if (suggestion) {
      addDismissed(getSuggestionType(suggestion));
    }
    setSuggestion(null);
    setDismissed(true);
  }, [suggestion]);

  const accept = useCallback(() => {
    setSuggestion(null);
    setDismissed(true);
  }, []);

  return { suggestion, dismiss, accept };
}
