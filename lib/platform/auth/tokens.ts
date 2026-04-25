/**
 * Platform Auth — Token Store (AES-256-GCM)
 *
 * Re-exports from the canonical token-store implementation.
 * Architecture Finale: lib/platform/auth/tokens.ts
 */

export {
  getTokens,
  getTokenMeta,
  saveTokens,
  touchLastUsed,
  recordAuthFailure,
  resetAuthFailures,
  revokeToken,
  clearTokens,
  isTokenExpired,
  setKeyProvider,
  type KeyProvider,
  type StoredTokens,
  type TokenMeta,
} from "@/lib/token-store";
