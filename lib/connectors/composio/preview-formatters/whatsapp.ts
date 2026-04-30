/**
 * WhatsApp preview formatters.
 */

import { footer, header, line, preview } from "./shared";

export function formatWhatsappSendMessage(args: Record<string, unknown>): string {
  const to = String(args.to ?? args.recipient ?? args.phone ?? "—");
  const text = String(args.text ?? args.message ?? args.body ?? "");
  const mediaUrl = args.media_url ?? args.mediaUrl;
  const template = args.template_name ?? args.template;

  const lines = [
    line("Destinataire", to),
    template ? line("Template", String(template)) : null,
    line("Aperçu", preview(text, 200)),
    mediaUrl ? line("Média", String(mediaUrl)) : null,
  ].filter(Boolean) as string[];

  return [header("WHATSAPP", "Envoyer un message"), ...lines, footer()].join("\n");
}
