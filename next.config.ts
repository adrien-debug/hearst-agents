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
// Active uniquement si SENTRY_AUTH_TOKEN + SENTRY_PROJECT + SENTRY_ORG présents.
// Sans ça, le DSN runtime reste actif (errors capturées) mais pas de release
// tracking ni de sourcemaps upload.
const sentryProject = process.env.SENTRY_PROJECT;
const sentryOrg = process.env.SENTRY_ORG;

export default process.env.SENTRY_AUTH_TOKEN && sentryProject && sentryOrg
  ? withSentryConfig(nextConfig, {
      org: sentryOrg,
      project: sentryProject,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Silencieux en build local, verbeux en CI
      silent: !process.env.CI,
      // Upload une plus grande surface de fichiers client pour de meilleures stack traces
      widenClientFileUpload: true,
      // Upload sourcemaps mais ne les serve pas publiquement
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
      // Tunnel les requêtes Sentry via /monitoring (contourne adblockers)
      tunnelRoute: "/monitoring",
    })
  : nextConfig;
