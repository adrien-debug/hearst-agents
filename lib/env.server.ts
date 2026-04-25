/**
 * Environment validation — Server-side only
 *
 * This module validates critical environment variables at boot time.
 * Import it at the top of server entry points to trigger validation early.
 *
 * Rules:
 * - HEARST_DEV_AUTH_BYPASS=1 is forbidden in production
 * - NODE_ENV=production triggers strict validation mode
 */

const isProd = process.env.NODE_ENV === "production";

// Validate security-critical environment variables
function validateEnv(): void {
  // Critical: prevent dev bypass in production
  if (isProd && process.env.HEARST_DEV_AUTH_BYPASS === "1") {
    throw new Error(
      "[ENV ERROR] HEARST_DEV_AUTH_BYPASS=1 is forbidden in production. " +
        "This would expose all API routes without authentication."
    );
  }

  // Production mode confirmation
  if (isProd) {
    console.log("[ENV] Production mode validated — auth bypass disabled");
  }

  // Optional: warn if HEARST_API_KEY is not set in production
  // (session-only auth is allowed per decision, but we log for visibility)
  if (isProd && !process.env.HEARST_API_KEY) {
    console.log(
      "[ENV] Note: HEARST_API_KEY not set — relying on session auth only"
    );
  }
}

// Execute validation immediately on module load
validateEnv();

export { validateEnv };
