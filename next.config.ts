import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin la racine workspace pour que Turbopack n'aille pas la déduire
  // depuis un package.json plus haut dans l'arbo (ex. ~/package.json).
  turbopack: {
    root: import.meta.dirname,
  },
};

// Sentry config — wrapper pour upload des sourcemaps + tunneling.
// Active uniquement si SENTRY_AUTH_TOKEN présent au build (sinon no-op).
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: "adrien-debug",
      project: "hearst-os",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Silencieux en build local, verbeux en CI
      silent: !process.env.CI,
      // Upload sourcemaps mais ne les serve pas publiquement
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
      // Tunnel les requêtes Sentry via /monitoring (contourne adblockers)
      tunnelRoute: "/monitoring",
    })
  : nextConfig;
