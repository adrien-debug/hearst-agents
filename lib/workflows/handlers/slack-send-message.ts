/**
 * Handler `slack_send_message` — envoie un message Slack via Composio.
 *
 * Args :
 *  - channel: string  (`#frontdesk` ou ID `C0123…`)
 *  - content: string | object  (si object, on stringify pretty)
 *  - _preview?: boolean (mode dry-run, pas d'envoi réel)
 *
 * En preview, retourne le payload sans frapper Composio.
 */

import type { WorkflowHandler } from "./types";
import { executeComposioAction } from "@/lib/connectors/composio/client";

const ACTION = "SLACK_SEND_MESSAGE";

function stringify(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

export const slackSendMessage: WorkflowHandler = async (args, ctx) => {
  const channel = typeof args.channel === "string" ? args.channel : "";
  const content = stringify(args.content);
  const preview = args._preview === true || ctx.preview === true;

  if (!channel) {
    return { success: false, error: "slack_send_message: channel manquant" };
  }
  if (!content) {
    return { success: false, error: "slack_send_message: content vide" };
  }

  if (preview) {
    return {
      success: true,
      output: {
        preview: true,
        channel,
        contentPreview: content.slice(0, 200),
        contentLength: content.length,
      },
    };
  }

  const result = await executeComposioAction({
    action: ACTION,
    entityId: ctx.userId,
    params: { channel, text: content },
  });

  if (!result.ok) {
    return { success: false, error: result.error ?? "slack_send_message failed" };
  }

  return {
    success: true,
    output: {
      sent: true,
      channel,
      composioData: result.data,
    },
  };
};
