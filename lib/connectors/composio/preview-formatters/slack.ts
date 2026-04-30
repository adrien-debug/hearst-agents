/**
 * Slack preview formatters.
 */

import { footer, header, line, preview, asArray } from "./shared";

export function formatSlackSendMessage(args: Record<string, unknown>): string {
  let channel = String(args.channel ?? args.channel_id ?? "—");
  if (!channel.startsWith("#") && !channel.startsWith("@") && channel !== "—") {
    channel = `#${channel}`;
  }
  const text = String(args.text ?? args.message ?? "");
  const blocks = asArray(args.blocks).length;
  const attachments = asArray(args.attachments).length;
  const threadTs = args.thread_ts ? String(args.thread_ts) : null;

  const lines = [
    line("Canal", channel),
    line("Aperçu", preview(text, 200)),
    threadTs ? line("Thread", threadTs) : null,
    blocks > 0 ? line("Blocks", `${blocks} block(s) interactif(s)`) : null,
    attachments > 0 ? line("Pièces jointes", `${attachments} fichier(s)`) : null,
  ].filter(Boolean) as string[];

  return [header("SLACK", "Envoyer un message"), ...lines, footer()].join("\n");
}
