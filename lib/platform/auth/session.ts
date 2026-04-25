/**
 * Platform Auth — Session Helpers
 *
 * Server-side session utilities for NextAuth.
 * Architecture Finale: lib/platform/auth/session.ts
 */

import { getServerSession } from "next-auth";
import { authOptions } from "./options";

export interface HearstSession {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  accessToken?: string;
  userId?: string;
}

/**
 * Get the current server-side session.
 * Returns null if the user is not authenticated.
 */
export async function getHearstSession(): Promise<HearstSession | null> {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  return session as unknown as HearstSession;
}

/**
 * Get the current user ID from the session.
 * Falls back to dev bypass if HEARST_DEV_AUTH_BYPASS is set.
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (process.env.HEARST_DEV_AUTH_BYPASS) {
    return process.env.HEARST_DEV_AUTH_BYPASS;
  }

  const session = await getHearstSession();
  return (session as unknown as Record<string, unknown>)?.userId as string | null ?? session?.user?.email ?? null;
}

/**
 * Require authentication — throws if not authenticated.
 */
export async function requireAuth(): Promise<HearstSession> {
  const session = await getHearstSession();
  if (!session) {
    throw new Error("Authentication required");
  }
  return session;
}
