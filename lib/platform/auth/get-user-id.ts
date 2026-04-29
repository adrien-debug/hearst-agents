import { getServerSession } from "next-auth";
import { authOptions } from "./options";

const DEV_BYPASS = process.env.HEARST_DEV_AUTH_BYPASS === "1";
// UUID Adrien dans public.users — utilisé en mode dev bypass (HEARST_DEV_AUTH_BYPASS=1)
// pour avoir un identifiant cohérent avec les rows post-migration UUID.
const DEV_USER = "36914162-75f9-4c27-b38b-bb050f51d52b";

/**
 * Extracts the userId (UUID) from the current NextAuth session.
 * Returns null if not authenticated or si le UUID n'est pas résolu.
 *
 * En mode dev bypass (HEARST_DEV_AUTH_BYPASS=1), retourne un UUID fixe
 * pour pouvoir tester l'app sans flow OAuth complet.
 *
 * Anti-pattern banni : retourner l'email comme fallback. Si la résolution
 * email → UUID échoue dans le callback NextAuth (DB indispo, public.users
 * pas peuplée), session.userId est undefined et cette fonction retourne
 * null. Le caller doit traiter ça comme "auth failed", pas substituer
 * un identifiant alternatif.
 */
export async function getUserId(): Promise<string | null> {
  if (DEV_BYPASS) {
    return DEV_USER;
  }

  const session = await getServerSession(authOptions);
  if (!session) return null;

  // Priorité 1 : session.user.id (UUID exposé par le callback session()).
  const userIdFromSession = (session.user as { id?: string } | undefined)?.id;
  if (typeof userIdFromSession === "string" && userIdFromSession.length > 0) {
    return userIdFromSession;
  }

  // Priorité 2 : session.userId (legacy, posé par token.userId dans jwt()).
  // Reste valide tant qu'on garde la propagation token → session.
  const s = session as unknown as Record<string, unknown>;
  if (typeof s.userId === "string" && s.userId.length > 0) {
    return s.userId;
  }

  // Auth présente mais pas de UUID → on retourne null. Pas de fallback email.
  return null;
}
