import { RateLimitExceededError } from "./errors";

export interface RateLimiterOptions {
  rpm: number;
  tph: number;
}

interface TokenEntry {
  ts: number;
  tokens: number;
}

interface UserState {
  callTimestamps: number[];
  tokenEntries: TokenEntry[];
  lastActivity: number;
  createdAt: number; // TTL max tracking
}

const RPM = Number(process.env.LLM_RATE_LIMIT_RPM ?? "60");
const TPH = Number(process.env.LLM_RATE_LIMIT_TPH ?? "1000000");
const MAX_USERS = Number(process.env.LLM_RATE_LIMIT_MAX_USERS ?? "10000");
const MAX_USER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours max TTL

export class LLMRateLimiter {
  private userStates = new Map<string, UserState>();
  private lastCleanup = Date.now();
  private readonly cleanupIntervalMs = 60000; // Cleanup every 60s

  private cleanupIfNeeded(): void {
    const now = Date.now();

    // Periodic cleanup every 60s
    if (now - this.lastCleanup < this.cleanupIntervalMs) {
      return;
    }
    this.lastCleanup = now;

    // Remove entries older than 24h or inactive for 2h
    const maxAge = now - MAX_USER_TTL_MS;
    const inactiveThreshold = now - 7200000; // 2h

    for (const [userId, state] of this.userStates.entries()) {
      const isExpired = state.createdAt < maxAge;
      const isInactive = state.lastActivity < inactiveThreshold &&
        state.callTimestamps.length === 0 &&
        state.tokenEntries.length === 0;

      if (isExpired || isInactive) {
        this.userStates.delete(userId);
      }
    }
  }

  private evictLRU(): void {
    // Find oldest entry by lastActivity
    let oldestUserId: string | null = null;
    let oldestActivity = Infinity;

    for (const [userId, state] of this.userStates.entries()) {
      if (state.lastActivity < oldestActivity) {
        oldestActivity = state.lastActivity;
        oldestUserId = userId;
      }
    }

    if (oldestUserId) {
      this.userStates.delete(oldestUserId);
      console.warn(`[RateLimiter] LRU evicted user ${oldestUserId} due to MAX_USERS limit`);
    }
  }

  checkLimit(userId: string): void {
    this.cleanupIfNeeded();

    const now = Date.now();
    let state = this.userStates.get(userId);

    if (!state) {
      // Check if we need to evict before adding new user
      if (this.userStates.size >= MAX_USERS) {
        this.evictLRU();
      }

      state = {
        callTimestamps: [],
        tokenEntries: [],
        lastActivity: now,
        createdAt: now,
      };
      this.userStates.set(userId, state);
    }

    // Check absolute TTL
    if (now - state.createdAt > MAX_USER_TTL_MS) {
      // Reset state after 24h
      state.callTimestamps = [];
      state.tokenEntries = [];
      state.createdAt = now;
    }

    state.lastActivity = now;

    const sixtySecondsAgo = now - 60000;
    state.callTimestamps = state.callTimestamps.filter((ts) => ts > sixtySecondsAgo);

    if (state.callTimestamps.length >= RPM) {
      throw new RateLimitExceededError(userId, "rpm");
    }

    const oneHourAgo = now - 3600000;
    state.tokenEntries = state.tokenEntries.filter((entry) => entry.ts > oneHourAgo);

    const totalTokens = state.tokenEntries.reduce((sum, entry) => sum + entry.tokens, 0);
    if (totalTokens >= TPH) {
      throw new RateLimitExceededError(userId, "tph");
    }
  }

  recordCall(userId: string, tokens: number = 0): void {
    const now = Date.now();
    let state = this.userStates.get(userId);

    if (!state) {
      // Should not happen if checkLimit was called first, but handle gracefully
      if (this.userStates.size >= MAX_USERS) {
        this.evictLRU();
      }

      state = {
        callTimestamps: [],
        tokenEntries: [],
        lastActivity: now,
        createdAt: now,
      };
      this.userStates.set(userId, state);
    }

    state.lastActivity = now;
    state.callTimestamps.push(now);
    if (tokens > 0) {
      state.tokenEntries.push({ ts: now, tokens });
    }

    // Cleanup this specific entry if inactive (not global cleanup)
    const twoHoursAgo = now - 7200000;
    if (state.lastActivity < twoHoursAgo && state.callTimestamps.length === 0 && state.tokenEntries.length === 0) {
      this.userStates.delete(userId);
    }
  }

  getStats(): { userCount: number; maxUsers: number } {
    return {
      userCount: this.userStates.size,
      maxUsers: MAX_USERS,
    };
  }
}

export const defaultRateLimiter = new LLMRateLimiter();
