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
}

const RPM = Number(process.env.LLM_RATE_LIMIT_RPM ?? "60");
const TPH = Number(process.env.LLM_RATE_LIMIT_TPH ?? "1000000");

export class LLMRateLimiter {
  private userStates = new Map<string, UserState>();

  checkLimit(userId: string): void {
    const now = Date.now();
    let state = this.userStates.get(userId);

    if (!state) {
      state = {
        callTimestamps: [],
        tokenEntries: [],
        lastActivity: now,
      };
      this.userStates.set(userId, state);
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
      state = {
        callTimestamps: [],
        tokenEntries: [],
        lastActivity: now,
      };
      this.userStates.set(userId, state);
    }

    state.lastActivity = now;
    state.callTimestamps.push(now);
    if (tokens > 0) {
      state.tokenEntries.push({ ts: now, tokens });
    }

    const twoHoursAgo = now - 7200000;
    if (state.lastActivity < twoHoursAgo && state.callTimestamps.length === 0 && state.tokenEntries.length === 0) {
      this.userStates.delete(userId);
    }
  }
}

export const defaultRateLimiter = new LLMRateLimiter();
