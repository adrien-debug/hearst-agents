/**
 * Platform Auth — Public API
 *
 * NextAuth configuration, token store, and session helpers.
 */

export { authOptions } from "./options";

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
} from "./tokens";

export {
  getHearstSession,
  getCurrentUserId,
  requireAuth,
  type HearstSession,
} from "./session";

export { getUserId } from "./get-user-id";

export {
  resolveScope,
  requireScope,
  type CanonicalScope,
} from "./scope";
