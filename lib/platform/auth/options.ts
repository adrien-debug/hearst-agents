import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import { saveTokens } from "@/lib/platform/auth/tokens";
import { registerProviderUsage } from "@/lib/connectors/control-plane/register";

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
        const userId = (profile as { email?: string }).email ?? token.sub ?? "unknown";

        const providerName = account.provider === "azure-ad" ? "microsoft" : "google";

        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at ?? 0;
        token.userId = userId;

        await saveTokens(
          userId,
          {
            accessToken: account.access_token ?? null,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at ?? 0,
          },
          providerName,
        );
        // Resolve scope from env (consistent with lib/scope.ts)
        const tenantId = process.env.HEARST_TENANT_ID ?? "dev-tenant";
        const workspaceId = process.env.HEARST_WORKSPACE_ID ?? "dev-workspace";
        void registerProviderUsage({
          provider: providerName as "google",
          scope: { tenantId, workspaceId, userId },
        });
      }
      return token;
    },
    async session({ session, token }) {
      const s = session as unknown as Record<string, unknown>;
      s.accessToken = token.accessToken;
      s.userId = token.userId;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
