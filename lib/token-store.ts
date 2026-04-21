import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

/* ─── Supabase client (untyped, user_tokens isn't in generated types) ─── */

const USE_MEMORY_STORE =
  !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/* ─── In-memory fallback for dev without Supabase ─── */

const memoryTokens = new Map<string, Record<string, unknown>>();

function memKey(userId: string, provider: string) {
  return `${userId}::${provider}`;
}

/* ─── Key Provider abstraction (env var now, KMS later) ─── */

export interface KeyProvider {
  getKey(): Buffer;
}

class EnvKeyProvider implements KeyProvider {
  getKey(): Buffer {
    const hex = process.env.TOKEN_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
      throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-char hex string (256-bit)");
    }
    return Buffer.from(hex, "hex");
  }
}

let keyProvider: KeyProvider = new EnvKeyProvider();

export function setKeyProvider(provider: KeyProvider) {
  keyProvider = provider;
}

/* ─── AES-256-GCM encryption ─── */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function encrypt(plaintext: string): string {
  const key = keyProvider.getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

function decrypt(ciphertext: string): string {
  const key = keyProvider.getKey();
  const [ivHex, authTagHex, encHex] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !encHex) throw new Error("Malformed encrypted token");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
}

/* ─── Constants ─── */

const MAX_AUTH_FAILURES = 5;
const REFRESH_ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ─── Types ─── */

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number;
}

export interface TokenMeta {
  tokens: StoredTokens;
  revoked: boolean;
  authFailureCount: number;
  needsRotation: boolean;
}

const EMPTY: StoredTokens = { accessToken: null, refreshToken: null, expiresAt: 0 };

/* ─── Read ─── */

export async function getTokens(userId: string, provider = "google"): Promise<StoredTokens> {
  const meta = await getTokenMeta(userId, provider);
  if (meta.revoked) return EMPTY;
  return meta.tokens;
}

export async function getTokenMeta(userId: string, provider = "google"): Promise<TokenMeta> {
  if (USE_MEMORY_STORE) {
    const row = memoryTokens.get(memKey(userId, provider));
    if (!row) return { tokens: EMPTY, revoked: false, authFailureCount: 0, needsRotation: false };
    return {
      tokens: {
        accessToken: (row.accessToken as string) ?? null,
        refreshToken: (row.refreshToken as string) ?? null,
        expiresAt: (row.expiresAt as number) ?? 0,
      },
      revoked: false,
      authFailureCount: 0,
      needsRotation: false,
    };
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("user_tokens")
      .select("access_token_enc, refresh_token_enc, expires_at, revoked_at, auth_failure_count, refresh_rotated_at")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single();

    if (error || !data) {
      return { tokens: EMPTY, revoked: false, authFailureCount: 0, needsRotation: false };
    }

    const revoked = !!data.revoked_at;
    const authFailureCount = data.auth_failure_count ?? 0;

    const lastRotation = data.refresh_rotated_at ? new Date(data.refresh_rotated_at).getTime() : 0;
    const needsRotation = lastRotation > 0
      ? Date.now() - lastRotation > REFRESH_ROTATION_INTERVAL_MS
      : false;

    return {
      tokens: {
        accessToken: data.access_token_enc ? decrypt(data.access_token_enc) : null,
        refreshToken: data.refresh_token_enc ? decrypt(data.refresh_token_enc) : null,
        expiresAt: data.expires_at ?? 0,
      },
      revoked,
      authFailureCount,
      needsRotation,
    };
  } catch (err) {
    console.error("[TokenStore] Read error:", err instanceof Error ? err.message : err);
    return { tokens: EMPTY, revoked: false, authFailureCount: 0, needsRotation: false };
  }
}

/* ─── Write ─── */

export async function saveTokens(
  userId: string,
  tokens: Partial<StoredTokens>,
  provider = "google",
  options?: { tenantId?: string },
) {
  if (USE_MEMORY_STORE) {
    const k = memKey(userId, provider);
    const existing = memoryTokens.get(k) ?? {};
    if (tokens.accessToken !== undefined) existing.accessToken = tokens.accessToken;
    if (tokens.refreshToken !== undefined) existing.refreshToken = tokens.refreshToken;
    if (tokens.expiresAt !== undefined) existing.expiresAt = tokens.expiresAt;
    if (options?.tenantId) existing.tenantId = options.tenantId;
    memoryTokens.set(k, existing);
    console.log(`[TokenStore] Saved to memory for ${userId}/${provider}`);
    return;
  }
  try {
    const sb = getSupabase();
    const row: Record<string, unknown> = {
      user_id: userId,
      provider,
      updated_at: new Date().toISOString(),
      auth_failure_count: 0,
      revoked_at: null,
    };

    if (options?.tenantId) {
      row.tenant_id = options.tenantId;
    }

    if (tokens.accessToken !== undefined) {
      row.access_token_enc = tokens.accessToken ? encrypt(tokens.accessToken) : null;
    }
    if (tokens.refreshToken !== undefined) {
      row.refresh_token_enc = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;
      row.refresh_rotated_at = new Date().toISOString();
    }
    if (tokens.expiresAt !== undefined) {
      row.expires_at = tokens.expiresAt;
    }

    const { error } = await sb
      .from("user_tokens")
      .upsert(row, { onConflict: "user_id,provider" });

    if (error) {
      console.error("[TokenStore] Save failed:", error.message);
    }
  } catch (err) {
    console.error("[TokenStore] Save error:", err instanceof Error ? err.message : err);
  }
}

/* ─── Touch last_used_at ─── */

export async function touchLastUsed(userId: string, provider = "google") {
  try {
    const sb = getSupabase();
    await sb
      .from("user_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider", provider);
  } catch {
    // non-critical
  }
}

/* ─── Auth failure tracking ─── */

export async function recordAuthFailure(userId: string, provider = "google"): Promise<boolean> {
  try {
    const sb = getSupabase();

    const { data } = await sb
      .from("user_tokens")
      .select("auth_failure_count")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single();

    const count = (data?.auth_failure_count ?? 0) + 1;

    if (count >= MAX_AUTH_FAILURES) {
      await sb
        .from("user_tokens")
        .update({
          auth_failure_count: count,
          revoked_at: new Date().toISOString(),
          access_token_enc: null,
          refresh_token_enc: null,
        })
        .eq("user_id", userId)
        .eq("provider", provider);

      console.error(`[TokenStore] Auto-revoked tokens for ${userId} after ${count} auth failures`);
      return true;
    }

    await sb
      .from("user_tokens")
      .update({ auth_failure_count: count })
      .eq("user_id", userId)
      .eq("provider", provider);

    return false;
  } catch (err) {
    console.error("[TokenStore] Failure tracking error:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function resetAuthFailures(userId: string, provider = "google") {
  try {
    const sb = getSupabase();
    await sb
      .from("user_tokens")
      .update({ auth_failure_count: 0 })
      .eq("user_id", userId)
      .eq("provider", provider);
  } catch {
    // non-critical
  }
}

/* ─── Revoke / Clear ─── */

export async function revokeToken(userId: string, provider = "google") {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("user_tokens")
      .update({
        revoked_at: new Date().toISOString(),
        access_token_enc: null,
        refresh_token_enc: null,
      })
      .eq("user_id", userId)
      .eq("provider", provider);

    if (error) {
      console.error("[TokenStore] Revoke failed:", error.message);
    }
  } catch (err) {
    console.error("[TokenStore] Revoke error:", err instanceof Error ? err.message : err);
  }
}

export async function clearTokens(userId: string) {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("user_tokens")
      .delete()
      .eq("user_id", userId);

    if (error) {
      console.error("[TokenStore] Clear failed:", error.message);
    }
  } catch (err) {
    console.error("[TokenStore] Clear error:", err instanceof Error ? err.message : err);
  }
}

/* ─── Helpers ─── */

export function isTokenExpired(expiresAt: number): boolean {
  if (!expiresAt) return true;
  return Date.now() / 1000 > expiresAt - 60;
}
