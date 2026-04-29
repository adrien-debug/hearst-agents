/**
 * Tests signed-url : signing, expiration, hash uniqueness, rate-limit.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  signToken,
  verifyToken,
  hashToken,
  checkShareRateLimit,
  _resetShareRateLimit,
  buildShareUrl,
  TTL_MAX_HOURS,
  TTL_MIN_HOURS,
  SHARE_RATE_LIMIT_PER_HOUR,
} from "@/lib/reports/sharing/signed-url";

const VALID_SECRET = "x".repeat(64); // 64 chars > 32 min

beforeEach(() => {
  _resetShareRateLimit();
  process.env.REPORT_SHARING_SECRET = VALID_SECRET;
});

describe("signed-url — signing & verify", () => {
  it("signe et vérifie un token valide", () => {
    const signed = signToken({
      shareId: "share-1",
      assetId: "asset-1",
      ttlHours: 24,
    });
    expect(signed).not.toBeNull();
    if (!signed) return;
    expect(signed.token).toContain(".");
    expect(signed.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const verify = verifyToken(signed.token);
    expect(verify.ok).toBe(true);
    if (verify.ok) {
      expect(verify.payload.sid).toBe("share-1");
      expect(verify.payload.aid).toBe("asset-1");
    }
  });

  it("borne le TTL au max (7j)", () => {
    const signed = signToken({
      shareId: "s",
      assetId: "a",
      ttlHours: 9999,
      now: 1_000_000_000_000, // ts fixe
    });
    if (!signed) throw new Error("signing failed");
    const expectedExp = Math.floor(1_000_000_000_000 / 1000) + TTL_MAX_HOURS * 3600;
    expect(signed.payload.exp).toBe(expectedExp);
  });

  it("borne le TTL au min", () => {
    const signed = signToken({ shareId: "s", assetId: "a", ttlHours: 0 });
    if (!signed) throw new Error("signing failed");
    const ttlSec = signed.payload.exp - signed.payload.iat;
    expect(ttlSec).toBeGreaterThanOrEqual(TTL_MIN_HOURS * 3600);
  });

  it("rejette un token expiré", () => {
    const signed = signToken({
      shareId: "s",
      assetId: "a",
      ttlHours: 1,
      now: 1_000_000_000_000,
    });
    if (!signed) throw new Error("signing failed");
    const verify = verifyToken(signed.token, {
      now: 1_000_000_000_000 + 2 * 3600 * 1000, // +2h après iat
    });
    expect(verify.ok).toBe(false);
    if (!verify.ok) expect(verify.reason).toBe("expired");
  });

  it("rejette une signature falsifiée", () => {
    const signed = signToken({ shareId: "s", assetId: "a", ttlHours: 24 });
    if (!signed) throw new Error("signing failed");
    const [payload] = signed.token.split(".");
    const tampered = `${payload}.AAAAAAAAAA`;
    const verify = verifyToken(tampered);
    expect(verify.ok).toBe(false);
    if (!verify.ok) expect(verify.reason).toBe("bad_signature");
  });

  it("rejette un token malformé", () => {
    const verify = verifyToken("not-a-valid-token");
    expect(verify.ok).toBe(false);
    if (!verify.ok) expect(verify.reason).toBe("malformed");
  });

  it("refuse de signer si REPORT_SHARING_SECRET trop court", () => {
    process.env.REPORT_SHARING_SECRET = "tooshort";
    const signed = signToken({ shareId: "s", assetId: "a", ttlHours: 24 });
    expect(signed).toBeNull();
  });

  it("refuse de vérifier si REPORT_SHARING_SECRET absent", () => {
    delete process.env.REPORT_SHARING_SECRET;
    const verify = verifyToken("anything.anything");
    expect(verify.ok).toBe(false);
    if (!verify.ok) expect(verify.reason).toBe("no_secret");
  });

  it("hashToken est déterministe et 64 chars hex", () => {
    expect(hashToken("foo")).toBe(hashToken("foo"));
    expect(hashToken("foo")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken("foo")).not.toBe(hashToken("bar"));
  });
});

describe("signed-url — uniqueness", () => {
  it("deux tokens consécutifs avec shareId différents → tokenHashes différents", () => {
    const t1 = signToken({ shareId: "s1", assetId: "a", ttlHours: 24 });
    const t2 = signToken({ shareId: "s2", assetId: "a", ttlHours: 24 });
    if (!t1 || !t2) throw new Error("signing failed");
    expect(t1.tokenHash).not.toBe(t2.tokenHash);
  });
});

describe("signed-url — rate limit", () => {
  it("autorise jusqu'à SHARE_RATE_LIMIT_PER_HOUR puis refuse", () => {
    const userId = "user-rate-test";
    for (let i = 0; i < SHARE_RATE_LIMIT_PER_HOUR; i++) {
      expect(checkShareRateLimit(userId).ok).toBe(true);
    }
    const r = checkShareRateLimit(userId);
    expect(r.ok).toBe(false);
  });

  it("relâche après la fenêtre d'1h", () => {
    const userId = "user-window";
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < SHARE_RATE_LIMIT_PER_HOUR; i++) {
      checkShareRateLimit(userId, t0);
    }
    expect(checkShareRateLimit(userId, t0).ok).toBe(false);
    expect(
      checkShareRateLimit(userId, t0 + 3_600_001).ok,
    ).toBe(true);
  });
});

describe("signed-url — buildShareUrl", () => {
  it("construit l'URL avec base + token URL-encoded", () => {
    const url = buildShareUrl("abc.def", "https://hearst.example/");
    expect(url).toBe("https://hearst.example/public/reports/abc.def");
  });
});
