/**
 * Gmail preview formatters — affiche un draft lisible pour les actions
 * Gmail destructives (SEND_EMAIL, SEND_EMAIL_REPLY).
 */

import { footer, header, line, preview, asArray } from "./shared";

export function formatGmailSendEmail(args: Record<string, unknown>): string {
  const to = asArray(args.to ?? args.recipient_email).join(", ");
  const cc = asArray(args.cc).join(", ");
  const bcc = asArray(args.bcc).join(", ");
  const subject = String(args.subject ?? args.subject_line ?? "(sans objet)");
  const body = String(args.body ?? args.message_body ?? args.text ?? "");
  const attachments = asArray(args.attachments).length;

  const lines = [
    line("Destinataire", to || "—"),
    cc ? line("Cc", cc) : null,
    bcc ? line("Cci", bcc) : null,
    line("Objet", subject),
    line("Aperçu", preview(body, 200)),
    attachments > 0 ? line("Pièces jointes", `${attachments} fichier(s)`) : null,
  ].filter(Boolean) as string[];

  return [header("GMAIL", "Envoyer un email"), ...lines, footer()].join("\n");
}

export function formatGmailReply(args: Record<string, unknown>): string {
  const threadId = String(args.thread_id ?? args.threadId ?? "—");
  const body = String(args.body ?? args.message_body ?? args.text ?? "");

  return [
    header("GMAIL", "Répondre"),
    line("Thread", threadId),
    line("Aperçu", preview(body, 200)),
    footer(),
  ].join("\n");
}
