/**
 * Direct connect actions for providers.
 *
 * Used by BlockedCard, ConnectorsSection, and /apps to trigger
 * real auth flows without routing through intermediate pages.
 */

import { signIn } from "next-auth/react";

export type ConnectAction = {
  provider: string;
  label: string;
  execute: () => void;
  available: boolean;
};

const ACTIONS: Record<string, () => void> = {
  google: () => signIn("google"),
  slack: () => { window.location.href = "/api/auth/slack"; },
};

const LABELS: Record<string, string> = {
  google: "Google",
  slack: "Slack",
  web: "Web",
  anthropic_managed: "Anthropic",
  notion: "Notion",
  github: "GitHub",
  stripe: "Stripe",
  jira: "Jira",
  hubspot: "HubSpot",
  airtable: "Airtable",
  figma: "Figma",
  zapier: "Zapier",
};

export function getConnectAction(provider: string): ConnectAction {
  const action = ACTIONS[provider];
  return {
    provider,
    label: LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1),
    execute: action ?? (() => { window.location.href = `/apps?provider=${provider}`; }),
    available: !!action,
  };
}

export function canDirectConnect(provider: string): boolean {
  return provider in ACTIONS;
}

export function triggerConnect(provider: string): void {
  const action = ACTIONS[provider];
  if (action) {
    action();
  } else {
    window.location.href = `/apps?provider=${provider}`;
  }
}

/**
 * For a list of providers that can satisfy a capability,
 * returns them sorted by activation priority (most useful first).
 */
const PRIORITY: Record<string, number> = {
  google: 0,
  slack: 1,
};

export function sortByConnectPriority(providers: string[]): string[] {
  return [...providers].sort((a, b) => {
    const pa = PRIORITY[a] ?? 99;
    const pb = PRIORITY[b] ?? 99;
    return pa - pb;
  });
}
