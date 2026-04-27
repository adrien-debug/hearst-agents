import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import { saveTokens } from "@/lib/platform/auth/tokens";
import { registerProviderUsage } from "@/lib/connectors/control-plane/register";
import { bootstrapComposioForUser } from "@/lib/platform/auth/composio-bootstrap";

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
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
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
          scope: "openid email profile offline_access Mail.Read Calendars.Read Files.Read.All",
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

        // Bootstrap Composio email+calendar for the SSO provider — fire and
        // forget so a slow Composio call doesn't block sign-in. The
        // resulting redirectUrls are exposed via /api/auth/composio-pending.
        const composioProvider: "google" | "microsoft" =
          account.provider === "azure-ad" ? "microsoft" : "google";
        void bootstrapComposioForUser(userId, composioProvider).catch((err) => {
          console.error("[auth] composio bootstrap failed:", err);
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
