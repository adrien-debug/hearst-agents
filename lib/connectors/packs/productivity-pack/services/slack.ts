import { WebClient } from "@slack/web-api";
import { getTokens, touchLastUsed, recordAuthFailure } from "@/lib/platform/auth/tokens";
import type { SlackConnector, ConnectorResult, SlackMessage } from "@/lib/connectors/types";

const PROVIDER = "slack";

export class SlackApiError extends Error {
  constructor(
    public readonly slackCode: string,
    message?: string,
  ) {
    super(message ?? slackCode);
    this.name = "SlackApiError";
  }
}

function extractSlackCode(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as Record<string, unknown>).data;
    if (data && typeof data === "object" && "error" in data) {
      return String((data as Record<string, unknown>).error);
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/An API error occurred: (\S+)/);
  return match ? match[1] : null;
}

async function getSlackClient(userId: string): Promise<WebClient> {
  const { accessToken } = await getTokens(userId, PROVIDER);
  if (!accessToken) {
    console.warn("[Slack] No token found for userId:", userId);
    throw new SlackApiError("not_authed", "No Slack token stored");
  }
  console.log("[Slack] Token found for userId:", userId, "| prefix:", accessToken.slice(0, 8) + "…");
  touchLastUsed(userId, PROVIDER).catch(() => {});
  return new WebClient(accessToken);
}

export const slackConnector: SlackConnector = {
  async getMessages(userId, limit = 20): Promise<ConnectorResult<SlackMessage>> {
    let client: WebClient;
    try {
      client = await getSlackClient(userId);
    } catch (e) {
      if (e instanceof SlackApiError) throw e;
      throw new SlackApiError("not_authed");
    }

    try {
      console.log("[Slack] conversations.list — scopes needed: channels:read,groups:read,im:read,mpim:read");
      const channelsRes = await client.conversations.list({
        types: "public_channel,private_channel,im,mpim",
        exclude_archived: true,
        limit: 50,
      });

      const channels = channelsRes.channels ?? [];
      const memberChannels = channels.filter((c) => c.is_member || c.is_im);
      console.log("[Slack] channels total:", channels.length, "| member/im:", memberChannels.length);

      const usersCache = new Map<string, string>();
      async function resolveUser(uid: string): Promise<string> {
        if (usersCache.has(uid)) return usersCache.get(uid)!;
        try {
          const info = await client.users.info({ user: uid });
          const name = info.user?.real_name || info.user?.name || uid;
          usersCache.set(uid, name);
          return name;
        } catch {
          usersCache.set(uid, uid);
          return uid;
        }
      }

      const allMessages: SlackMessage[] = [];
      const channelsToFetch = memberChannels.slice(0, 10);

      for (const ch of channelsToFetch) {
        try {
          const history = await client.conversations.history({
            channel: ch.id!,
            limit: Math.ceil(limit / channelsToFetch.length),
          });

          for (const msg of history.messages ?? []) {
            if (msg.subtype && msg.subtype !== "bot_message") continue;

            const senderName = msg.user ? await resolveUser(msg.user) : (msg.username ?? "Bot");
            const channelName = ch.name || (ch.is_im ? `DM` : ch.id!);

            allMessages.push({
              id: `${ch.id}-${msg.ts}`,
              channel: ch.id!,
              channelName,
              sender: senderName,
              text: msg.text ?? "",
              timestamp: msg.ts ?? "",
              threadTs: msg.thread_ts,
              isMention: (msg.text ?? "").includes(`<@`),
            });
          }
        } catch (chErr) {
          const code = extractSlackCode(chErr);
          console.warn(`[Slack] channel ${ch.id} (${ch.name}) skipped — code: ${code ?? "unknown"}`);
        }
      }

      allMessages.sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp));

      return { data: allMessages.slice(0, limit), provider: "slack" };
    } catch (err) {
      const code = extractSlackCode(err) ?? (err instanceof Error ? err.message : "unknown");
      console.error("[Slack] API error — code:", code);

      const AUTH_ERRORS = ["invalid_auth", "token_revoked", "not_authed", "account_inactive"];
      if (AUTH_ERRORS.includes(code)) {
        await recordAuthFailure(userId, PROVIDER);
        throw new SlackApiError(code);
      }

      throw new SlackApiError(code);
    }
  },
};
