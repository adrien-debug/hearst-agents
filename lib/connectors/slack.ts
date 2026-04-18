import { WebClient } from "@slack/web-api";
import { getTokens, touchLastUsed, recordAuthFailure } from "@/lib/token-store";
import type { SlackConnector, ConnectorResult, SlackMessage } from "./types";

const PROVIDER = "slack";

async function getSlackClient(userId: string): Promise<WebClient> {
  const { accessToken } = await getTokens(userId, PROVIDER);
  if (!accessToken) throw new Error("not_authenticated");
  touchLastUsed(userId, PROVIDER).catch(() => {});
  return new WebClient(accessToken);
}

export const slackConnector: SlackConnector = {
  async getMessages(userId, limit = 20): Promise<ConnectorResult<SlackMessage>> {
    let client: WebClient;
    try {
      client = await getSlackClient(userId);
    } catch {
      throw new Error("not_authenticated");
    }

    try {
      const channelsRes = await client.conversations.list({
        types: "public_channel,private_channel,im,mpim",
        exclude_archived: true,
        limit: 50,
      });

      const channels = channelsRes.channels ?? [];
      const memberChannels = channels.filter((c) => c.is_member || c.is_im);

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
        } catch {
          // channel access error, skip
        }
      }

      allMessages.sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp));

      return { data: allMessages.slice(0, limit), provider: "slack" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("invalid_auth") || message.includes("token_revoked") || message.includes("not_authed")) {
        await recordAuthFailure(userId, PROVIDER);
        throw new Error("not_authenticated");
      }
      throw err;
    }
  },
};
