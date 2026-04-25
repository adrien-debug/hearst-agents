import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/platform/auth";

const DEV_BYPASS = process.env.HEARST_DEV_AUTH_BYPASS === "1";
const DEV_USER = "adrien@hearstcorporation.io";

/**
 * Extracts the userId (email) from the current NextAuth session.
 * Returns null if not authenticated.
 *
 * In dev mode (HEARST_DEV_AUTH_BYPASS=1), returns a fixed dev user
 * so the app is testable without OAuth credentials.
 */
export async function getUserId(): Promise<string | null> {
  if (DEV_BYPASS) {
    return DEV_USER;
  }

  const session = await getServerSession(authOptions);
  if (!session) return null;

  const s = session as unknown as Record<string, unknown>;
  if (typeof s.userId === "string" && s.userId) return s.userId;
  if (session.user?.email) return session.user.email;

  return null;
}
