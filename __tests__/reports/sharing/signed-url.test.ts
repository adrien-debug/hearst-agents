/**
 * Tests du module sharing/signed-url :
 *   - sign + verify roundtrip
 *   - tampering de signature → bad_signature
 *   - expiration → expired
 *   - format malformé → malformed
 *   - hash stable + différent par token
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  signToken,
  verifyToken,
  hashToken,
  buildShareUrl,
  TTL_DEFAULT_HOURS,
  _resetShareRateLimit,
  checkShareRateLimit,
  SHARE_RATE_LIMIT_PER_HOUR,
} from "@/lib/reports/sharing/signed-url";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const ASSET_ID = "asset_abc";
const SHARE_ID = "11111111-2222-3333-4444-555555555555";

let savedSecret: string | undefined;
let savedAppUrl: string | undefined;

beforeAll(() => {
  savedSecret = process.env.REPORT_SHARING_SECRET;
  savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.REPORT_SHARING_SECRET = SECRET;
  process.env.NEXT_PUBLIC_APP_URL = "https://hearst.test";
});

afterAll(() => {
  if (savedSecret === undefined) {
    delete process.env.REPORT_SHARING_SECRET;
  } else {
    process.env.REPORT_SHARING_SECRET = savedSecret;
  }
  if (savedAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
  }
});

describe("signed-url — sign + verify roundtrip", () => {
  it("retourne un token signé avec hash et expiresAt cohérents", () => {
    const result = signToken({
      shareId: SHARE_ID,
      assetId: ASSET_ID,
      ttlHours: TTL_DEFAULT_HOURS,
      now: 1_700_000_000_000,
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.token.split(".").length).toBe(2);
    expect(result.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.payload).toEqual({
      sid: SHARE_ID,
      aid: ASSET_ID,
      iat: 1_700_000_000,
      exp: 1_700_000_000 + TTL_DEFAULT_HOURS * 3600,
    });
    expect(new Date(result.expiresAt).getTime()).toBe(
      (1_700_000_000 + TTL_DEFAULT_HOURS * 3600) * 1000,
    );
  });

  it("verify renvoie payload identique sur token valide", () => {
    const signed = signToken({
      shareId: SHARE_ID,
      assetId: ASSET_ID,
      ttlHours: 24,
      now: 1_700_000_000_000,
    });
    if (!signed) throw new Error("signToken returned null");
    const v = verifyToken(signed.token, { now: 1_700_000_000_000 + 1000 });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.payload).toEqual(signed.payload);
    expect(v.tokenHash).toBe(signed.tokenHash);
  });

  it("hashToken est stable et déterministe", () => {
    const signed = signToken({
      shareId: SHARE_ID,
      assetId: ASSET_ID,
      ttlHours: 24,
      now: 1_700_000_000_000,
    });
    if (!signed) throw new Error("signToken returned null");
    expect(hashToken(signed.token)).toBe(signed.tokenHash);
    expect(hashToken(signed.token)).toBe(hashToken(signed.token));
  });

  it("borne TTL : ttlHours=0 → TTL_MIN_HOURS, ttlHours=999 → TTL_MAX_HOURS", () => {
    const tooLow = signToken({
      shareId: SHARE_ID,
      assetId: ASSET_ID,
      ttlHours: 0,
      now: 1_700_000_000_000,
    });
    const tooHigh = signToken({
      shareId: SHARE_ID,
      assetId: ASSET_ID,
      ttlHours: 999,
      now: 1_700_000_000_000,
    });
    if (!tooLow || !tooHigh) throw new Error("signToken returned null");
    // tooLow doit être borné à 1h, tooHigh à 168h
    expect(tooLow.payload.exp - tooLow.payload.iat).toBe(3600);
    expect(tooHigh.payload.exp - tooHigh.payload.iat).toBe(168 * 3600);
  });
});

describe("signed-url — tampering & expiration", () => {
  it("token avec signature altérée → bad_signature", () => {
    const signed = signToken({
      shareId: SHARE_ID,
      assetId: ASSET_ID,
      ttlHours: 24,
      now: 1_700_000_000_000,
    });
    if (!signed) throw new Error("signToken returned null");
    const [payloadB64] = signed.token.split(".");
    // Réécrit la signature avec un HMAC bidon (mais valide base64url).
    const tampered = `${payloadB64}.${"a".repeat(43)}`;
    const v = verifyToken(tampered);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.reason).toBe("bad_signature");
  });

  it("payload modifié → bad_signature (signature ne matche plus)", () => {
    const signed = signToken({
      shareId: SHARE_ID,
      assetId: ASSET_ID,
      ttlHours: 24,
      now: 1_700_000_000_000,
    });
    if (!signed) throw new Error("signToken returned null");
    const [, sigB64] = signed.token.split(".");
    // change l'asset id dans le payload
    const otherPayload = Buffer.from(
      JSON.stringify({
        sid: SHARE_ID,
        aid: "OTHER_ASSET",
        iat: signed.payload.iat,
        exp: signed.payload.exp,
      }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const v = verifyToken(`${otherPayload}.${sigB64}`);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.reason).toBe("bad_signature");
  });

  it("token sans séparateur → malformed", () => {
    const v = verifyToken("nope-no-dot-here");
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.reason).toBe("malformed");
  });

  it("token expiré → expired (avec payload pour debug)", () => {
    const signed = signToken({
      shareId: SHARE_ID,
      assetId: ASSET_ID,
      ttlHours: 1,
      now: 1_700_000_000_000,
    });
    if (!signed) throw new Error("signToken returned null");
    // Avance de 2 heures
    const v = verifyToken(signed.token, {
      now: 1_700_000_000_000 + 2 * 3600 * 1000,
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.reason).toBe("expired");
    if (v.reason === "expired") {
      expect(v.payload.aid).toBe(ASSET_ID);
    }
  });
});

describe("signed-url — buildShareUrl", () => {
  it("compose une URL absolue", () => {
    const signed = signToken({
      shareId: SHARE_ID,
      assetId: ASSET_ID,
      ttlHours: 24,
      now: 1_700_000_000_000,
    });
    if (!signed) throw new Error("signToken returned null");
    const url = buildShareUrl(signed.token);
    expect(url.startsWith("https://hearst.test/public/reports/")).toBe(true);
    expect(url).toContain(encodeURIComponent(signed.token));
  });
});

describe("signed-url — rate limiter", () => {
  it("autorise jusqu'à SHARE_RATE_LIMIT_PER_HOUR puis bloque", () => {
    _resetShareRateLimit();
    for (let i = 0; i < SHARE_RATE_LIMIT_PER_HOUR; i++) {
      const r = checkShareRateLimit("user-x");
      expect(r.ok).toBe(true);
    }
    const blocked = checkShareRateLimit("user-x");
    expect(blocked.ok).toBe(false);
  });

  it("isole les utilisateurs", () => {
    _resetShareRateLimit();
    for (let i = 0; i < SHARE_RATE_LIMIT_PER_HOUR; i++) {
      checkShareRateLimit("user-a");
    }
    const stillOk = checkShareRateLimit("user-b");
    expect(stillOk.ok).toBe(true);
  });
});
