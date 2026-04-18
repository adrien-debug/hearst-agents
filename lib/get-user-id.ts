import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Extracts the userId (email) from the current NextAuth session.
 * Returns null if not authenticated.
 */
export async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const s = session as unknown as Record<string, unknown>;
  if (typeof s.userId === "string" && s.userId) return s.userId;
  if (session.user?.email) return session.user.email;

  return null;
}
