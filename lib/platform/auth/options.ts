import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import { saveTokens } from "@/lib/platform/auth/tokens";
import { registerProviderUsage } from "@/lib/connectors/control-plane/register";
import { resolveOrCreateUserUuid } from "./user-resolver";

export const authOptions: AuthOptions = {
  pages: {
    signIn: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          // Le bouton "Continuer avec Google" est l'unique point d'entrée :
          // un seul consent demande à la fois l'identité ET les scopes
          // read+write Gmail / Calendar / Drive. La pipeline IA peut alors
          // appeler les tools natifs sans 2e popup.
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/drive.file",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
      tenantId: process.env.AZURE_AD_TENANT_ID ?? "common",
      authorization: {
        params: {
          // Idem côté Microsoft : identité + read+write Mail / Calendars /
          // Files au premier consent.
          scope:
            "openid email profile offline_access Mail.ReadWrite Mail.Send Calendars.ReadWrite Files.ReadWrite",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const email = (profile as { email?: string }).email ?? null;
        const providerName = account.provider === "azure-ad" ? "microsoft" : "google";

        // Résolution canonique de l'identifiant utilisateur :
        // public.users.id (UUID) via lookup par email, auto-provisioning
        // si l'utilisateur n'existe pas encore (premier login).
        // Avant ce fix, token.userId = profile.email — ce qui faisait
        // remonter un email comme identifiant dans toutes les écritures
        // DB (cf. cleanup migration 0026_user_identity_uuid_cleanup.sql).
        const uuid = email ? await resolveOrCreateUserUuid(email).catch((err) => {
          console.error("[Auth] resolveOrCreateUserUuid failed:", err);
          return null;
        }) : null;

        // Fallback strict : si la résolution échoue (DB indispo, email absent),
        // on ne fabrique PAS d'identifiant artificiel. Le user n'aura pas
        // d'userId valide → resolveScope() retournera null → 401 sur les
        // routes auth-required. Préférable à un email silencieux qui pollue.
        if (!uuid) {
          console.warn(`[Auth] Unable to resolve UUID for email=${email ?? "<none>"}, provider=${providerName}`);
        }

        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at ?? 0;
        token.userId = uuid ?? undefined;
        if (email) token.email = email;

        if (uuid) {
          await saveTokens(
            uuid,
            {
              accessToken: account.access_token ?? null,
              refreshToken: account.refresh_token ?? null,
              expiresAt: account.expires_at ?? 0,
            },
            providerName,
          );

          const tenantId = process.env.HEARST_TENANT_ID ?? "dev-tenant";
          const workspaceId = process.env.HEARST_WORKSPACE_ID ?? "dev-workspace";
          void registerProviderUsage({
            provider: providerName as "google",
            scope: { tenantId, workspaceId, userId: uuid },
          });
        }
      }
      return token;
    },
    async session({ session, token }) {
      const s = session as unknown as Record<string, unknown>;
      s.accessToken = token.accessToken;
      s.userId = token.userId;
      // Expose user.id (UUID) en plus de user.email pour que le frontend
      // ait accès à l'identifiant canonique sans transiter par un appel
      // serveur. À utiliser comme identifiant dans tout React state qui
      // a besoin d'une key user.
      if (session.user && typeof token.userId === "string") {
        (session.user as { id?: string }).id = token.userId;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
