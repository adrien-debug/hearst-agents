/**
 * @deprecated — Use `@/lib/platform/auth/tokens` instead.
 * This file exists for backward compatibility only.
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
} from "@/lib/platform/auth/tokens";
