/**
 * Rule-based message priority classifier (V1 — no LLM).
 *
 * Applies priority to UnifiedMessage based on deterministic rules.
 * Designed to be replaced by a smarter classifier later.
 */

import type { UnifiedMessage } from "./unified-types";

type Priority = UnifiedMessage["priority"];

const VIP_SENDERS = [
  "ceo", "cto", "cfo", "coo",
  "directeur", "director",
  "founder", "co-founder",
  "manager",
];

const NEWSLETTER_PATTERNS = [
  /no-?reply/i,
  /noreply/i,
  /newsletter/i,
  /unsubscribe/i,
  /do-not-reply/i,
  /notifications?@/i,
  /digest@/i,
  /updates?@/i,
  /marketing@/i,
  /info@/i,
  /support@/i,
  /billing@/i,
  /mailer-daemon/i,
];

const DEADLINE_PATTERNS = [
  /\baujourd'?hui\b/i,
  /\beod\b/i,
  /\basap\b/i,
  /\burgent\b/i,
  /\bdate limite\b/i,
  /\bdeadline\b/i,
  /\bce soir\b/i,
  /\bdemain\b/i,
  /\bavant \d{1,2}h/i,
  /\bimportant\b/i,
  /\bprioritaire\b/i,
  /\baction requise\b/i,
  /\baction required\b/i,
];

function isVipSender(from: string, fromDetail?: string): boolean {
  const lower = `${from} ${fromDetail ?? ""}`.toLowerCase();
  return VIP_SENDERS.some((v) => lower.includes(v));
}

function isNewsletter(from: string, fromDetail?: string, subject?: string): boolean {
  const combined = `${from} ${fromDetail ?? ""} ${subject ?? ""}`;
  return NEWSLETTER_PATTERNS.some((p) => p.test(combined));
}

function hasDeadlineSignal(subject: string, preview: string): boolean {
  const combined = `${subject} ${preview}`;
  return DEADLINE_PATTERNS.some((p) => p.test(combined));
}

function isSlackMention(msg: UnifiedMessage): boolean {
  return msg.source.provider === "slack" && !msg.read;
}

export function classifyPriority(msg: UnifiedMessage): Priority {
  if (!msg.read && (
    isSlackMention(msg) ||
    isVipSender(msg.from, msg.fromDetail) ||
    hasDeadlineSignal(msg.subject, msg.preview)
  )) {
    return "urgent";
  }

  if (isNewsletter(msg.from, msg.fromDetail, msg.subject)) {
    return "low";
  }

  return "normal";
}

export function applyPriorities(messages: UnifiedMessage[]): UnifiedMessage[] {
  return messages.map((msg) => {
    if (msg.priority === "urgent") return msg;
    return { ...msg, priority: classifyPriority(msg) };
  });
}

const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, normal: 1, low: 2 };

export function sortByPriority(messages: UnifiedMessage[]): UnifiedMessage[] {
  return [...messages].sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.timestamp - a.timestamp;
  });
}
