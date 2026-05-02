/**
 * Arcjet — rate limiting + bot detection + email validation.
 * Branché en middleware Next.js (cf. middleware.ts à la racine).
 *
 * No-op si ARCJET_KEY absent (le middleware retourne `undefined` et Next continue normalement).
 */

import arcjet, { tokenBucket, detectBot, shield } from "@arcjet/next";

const KEY = process.env.ARCJET_KEY;

export const isArcjetEnabled = (): boolean => Boolean(KEY);

export const aj = KEY
  ? arcjet({
      key: KEY,
      characteristics: ["ip.src"],
      rules: [
        // Shield protects against common attacks (SQLi, XSS, etc.)
        shield({ mode: "LIVE" }),
        // Bot detection — block known scrapers, allow search engines
        detectBot({
          mode: "LIVE",
          allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:MONITOR", "CATEGORY:PREVIEW"],
        }),
        // Rate limit — 60 requests / minute per IP, refill 60/min, capacity 100
        tokenBucket({
          mode: "LIVE",
          characteristics: ["ip.src"],
          refillRate: 60,
          interval: 60,
          capacity: 100,
        }),
      ],
    })
  : null;
