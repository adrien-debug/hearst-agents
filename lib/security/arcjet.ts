/**
 * Arcjet — rate limiting + bot detection + email validation.
 * Branché en middleware Next.js (cf. middleware.ts à la racine).
 *
 * No-op si ARCJET_KEY absent (le middleware retourne `undefined` et Next continue normalement).
 */

import arcjet, { tokenBucket, detectBot, shield } from "@arcjet/next";

const KEY = process.env.ARCJET_KEY;
// En dev, le renderer Electron est flagué comme bot et casse NextAuth
// (/api/auth/session → 403). On reste en DRY_RUN pour logger sans bloquer.
const MODE = process.env.NODE_ENV === "development" ? "DRY_RUN" : "LIVE";

export const isArcjetEnabled = (): boolean => Boolean(KEY);

export const aj = KEY
  ? arcjet({
      key: KEY,
      characteristics: ["ip.src"],
      rules: [
        shield({ mode: MODE }),
        detectBot({
          mode: MODE,
          allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:MONITOR", "CATEGORY:PREVIEW"],
        }),
        tokenBucket({
          mode: MODE,
          characteristics: ["ip.src"],
          refillRate: 60,
          interval: 60,
          capacity: 100,
        }),
      ],
    })
  : null;
