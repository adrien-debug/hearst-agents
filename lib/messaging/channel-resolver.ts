/**
 * Channel Resolver — Determines which messaging provider to use for a contact.
 *
 * The user NEVER picks a channel. The OS resolves it silently.
 *
 * Resolution priority:
 * 1. Explicit override from user input ("sur WhatsApp")
 * 2. Last-used channel for this contact (stickiness)
 * 3. Only known channel (deterministic)
 * 4. Multiple channels, no preference → ambiguous (chat clarifies)
 *
 * Anti-patterns:
 * - NO channel picker UI
 * - NO dropdown
 * - NO provider-specific messaging views
 * - Ambiguity is resolved through chat clarification, not UI controls
 */

import type { ProviderId } from "@/lib/providers/types";

// ── Types ───────────────────────────────────────────────────

export type ChannelConfidence = "known" | "inferred" | "ambiguous";

export interface ChannelResolution {
  contactName: string;
  resolvedProvider: ProviderId;
  channelRef: string;
  confidence: ChannelConfidence;
}

export interface ContactChannel {
  provider: ProviderId;
  ref: string;
}

export interface ChannelHint {
  contactName: string;
  preferredChannel?: ProviderId;
  lastUsedChannel?: ProviderId;
  availableChannels: ContactChannel[];
}

export interface ChannelResolverContext {
  forcedProvider?: ProviderId;
  userId: string;
  tenantId: string;
}

// ── Contact channel store (in-memory, future: persistence) ──

const contactChannelHistory = new Map<string, Map<string, ProviderId>>();

function historyKey(userId: string, tenantId: string): string {
  return `${tenantId}:${userId}`;
}

export function recordChannelUsed(
  userId: string,
  tenantId: string,
  contactName: string,
  provider: ProviderId,
): void {
  const key = historyKey(userId, tenantId);
  let contacts = contactChannelHistory.get(key);
  if (!contacts) {
    contacts = new Map();
    contactChannelHistory.set(key, contacts);
  }
  contacts.set(contactName.toLowerCase(), provider);
}

function getLastUsedChannel(
  userId: string,
  tenantId: string,
  contactName: string,
): ProviderId | null {
  const contacts = contactChannelHistory.get(historyKey(userId, tenantId));
  return contacts?.get(contactName.toLowerCase()) ?? null;
}

// ── Resolver ────────────────────────────────────────────────

export function resolveChannel(
  hint: ChannelHint,
  ctx: ChannelResolverContext,
): ChannelResolution | null {
  const { contactName, availableChannels } = hint;

  if (availableChannels.length === 0) return null;

  // 1. Explicit override from user input
  if (ctx.forcedProvider) {
    const match = availableChannels.find((c) => c.provider === ctx.forcedProvider);
    if (match) {
      return {
        contactName,
        resolvedProvider: match.provider,
        channelRef: match.ref,
        confidence: "known",
      };
    }
  }

  // 2. User-level preferred channel for this contact
  if (hint.preferredChannel) {
    const match = availableChannels.find((c) => c.provider === hint.preferredChannel);
    if (match) {
      return {
        contactName,
        resolvedProvider: match.provider,
        channelRef: match.ref,
        confidence: "known",
      };
    }
  }

  // 3. Last-used channel (stickiness)
  const lastUsed = hint.lastUsedChannel ?? getLastUsedChannel(ctx.userId, ctx.tenantId, contactName);
  if (lastUsed) {
    const match = availableChannels.find((c) => c.provider === lastUsed);
    if (match) {
      return {
        contactName,
        resolvedProvider: match.provider,
        channelRef: match.ref,
        confidence: "inferred",
      };
    }
  }

  // 4. Single channel → deterministic
  if (availableChannels.length === 1) {
    return {
      contactName,
      resolvedProvider: availableChannels[0].provider,
      channelRef: availableChannels[0].ref,
      confidence: "known",
    };
  }

  // 5. Multiple channels, no preference → ambiguous
  // Return the highest-priority available channel but flag as ambiguous
  // so the orchestrator can ask for clarification via chat
  return {
    contactName,
    resolvedProvider: availableChannels[0].provider,
    channelRef: availableChannels[0].ref,
    confidence: "ambiguous",
  };
}
