/**
 * Composio bootstrap — kicks off OAuth-connect requests for the apps that
 * back our SSO providers (Gmail/Calendar pour Google, Outlook/Office365
 * pour Microsoft) right after signIn, so the user lands on Hearst with
 * email + calendar already connected.
 *
 * The redirectUrls returned by `composio.toolkits.authorize()` are stashed
 * in a process-local Map keyed by userId. The frontend pulls them via
 * `GET /api/auth/composio-pending` and walks the user through each consent
 * popup. We never block the JWT/session creation — the user can land on
 * the home page even if Composio is slow.
 */
import { initiateConnection, listConnections } from "@/lib/connectors/composio";

export interface BootstrapItem {
  app: string;
  redirectUrl: string;
}

const pendingByUser = new Map<string, BootstrapItem[]>();

/**
 * Connection slugs to bootstrap depending on the SSO provider.
 * `google` covers email+calendar via Composio's `gmail` + `googlecalendar`
 * toolkits. `microsoft` (Azure AD) routes to `outlook` + `office365`.
 */
const BOOTSTRAP_BY_PROVIDER: Record<"google" | "microsoft", string[]> = {
  google: ["gmail", "googlecalendar"],
  microsoft: ["outlook", "office365"],
};

/**
 * Run the bootstrap for the given user + SSO provider. Skips toolkits
 * already ACTIVE on Composio so re-login is idempotent.
 */
export async function bootstrapComposioForUser(
  userId: string,
  provider: "google" | "microsoft",
): Promise<void> {
  const targets = BOOTSTRAP_BY_PROVIDER[provider];
  if (!targets || targets.length === 0) return;

  let activeApps = new Set<string>();
  try {
    const accounts = await listConnections(userId);
    activeApps = new Set(
      accounts
        .filter((a) => a.status === "ACTIVE")
        .map((a) => a.appName.toLowerCase()),
    );
  } catch (err) {
    console.error("[composio-bootstrap] listConnections failed:", err);
  }

  const needed = targets.filter((slug) => !activeApps.has(slug));
  if (needed.length === 0) return;

  const items: BootstrapItem[] = [];
  for (const slug of needed) {
    try {
      const res = await initiateConnection(userId, slug);
      if (res.ok && res.redirectUrl) {
        items.push({ app: slug, redirectUrl: res.redirectUrl });
      } else {
        console.warn(
          `[composio-bootstrap] ${slug} authorize did not return a redirect URL ` +
            `(code=${res.errorCode ?? "-"}): ${res.error ?? "—"}`,
        );
      }
    } catch (err) {
      console.error(`[composio-bootstrap] ${slug} authorize threw:`, err);
    }
  }

  if (items.length > 0) {
    pendingByUser.set(userId, items);
  }
}

/**
 * Read pending bootstraps for a user without consuming them. Frontend
 * polls this until the list is empty (each entry is removed when its
 * Composio connection becomes ACTIVE — see `consumeBootstrap`).
 */
export function getPendingBootstraps(userId: string): BootstrapItem[] {
  return pendingByUser.get(userId) ?? [];
}

/**
 * Drop a single app from the pending list. Called by the Composio OAuth
 * callback handler when a connection moves to ACTIVE.
 */
export function consumeBootstrap(userId: string, app: string): void {
  const list = pendingByUser.get(userId);
  if (!list) return;
  const next = list.filter((item) => item.app !== app);
  if (next.length === 0) {
    pendingByUser.delete(userId);
  } else {
    pendingByUser.set(userId, next);
  }
}

/** Test helper. */
export function _resetBootstrapState(): void {
  pendingByUser.clear();
}
