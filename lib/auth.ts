import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { saveTokens } from "@/lib/token-store";

export const authOptions: AuthOptions = {
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
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const userId = (profile as { email?: string }).email ?? token.sub ?? "unknown";

        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at ?? 0;
        token.userId = userId;

        await saveTokens(userId, {
          accessToken: account.access_token ?? null,
          refreshToken: account.refresh_token ?? null,
          expiresAt: account.expires_at ?? 0,
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
