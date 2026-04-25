import { google } from "googleapis";
import {
  getTokenMeta,
  saveTokens,
  touchLastUsed,
  recordAuthFailure,
  resetAuthFailures,
  isTokenExpired,
} from "@/lib/platform/auth/tokens";

/**
 * Returns an authenticated OAuth2 client for a given user.
 * - Auto-refreshes access token if expired
 * - Rotates refresh token when Google issues a new one
 * - Tracks last_used_at
 * - Records auth failures and auto-revokes after repeated errors
 * Throws "not_authenticated" or "token_revoked" if unusable.
 */
export async function getGoogleAuth(userId: string) {
  const meta = await getTokenMeta(userId);

  if (meta.revoked) {
    throw new Error("token_revoked");
  }

  const { refreshToken, accessToken, expiresAt } = meta.tokens;

  if (!refreshToken && !accessToken) {
    throw new Error("not_authenticated");
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  if (refreshToken) {
    oauth2.setCredentials({ refresh_token: refreshToken });

    if (isTokenExpired(expiresAt) || meta.needsRotation) {
      try {
        const { credentials } = await oauth2.refreshAccessToken();
        oauth2.setCredentials(credentials);

        const updated: Parameters<typeof saveTokens>[1] = {
          accessToken: credentials.access_token ?? null,
          expiresAt: credentials.expiry_date
            ? Math.floor(credentials.expiry_date / 1000)
            : 0,
        };

        if (credentials.refresh_token) {
          updated.refreshToken = credentials.refresh_token;
        }

        await saveTokens(userId, updated);
        await resetAuthFailures(userId);
      } catch (err) {
        const revoked = await recordAuthFailure(userId);
        if (revoked) {
          throw new Error("token_revoked");
        }
        throw err;
      }
    }
  } else if (accessToken) {
    oauth2.setCredentials({ access_token: accessToken });
  }

  touchLastUsed(userId).catch(() => {});

  return oauth2;
}
