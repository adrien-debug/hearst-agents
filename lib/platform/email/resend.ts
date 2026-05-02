/**
 * Resend — email transactionnel (magic links, notifications).
 * No-op si RESEND_API_KEY absent.
 */

import { Resend } from "resend";

let _client: Resend | null = null;

function getClient(): Resend | null {
  if (_client) return _client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  _client = new Resend(apiKey);
  return _client;
}

export const isResendEnabled = (): boolean => Boolean(process.env.RESEND_API_KEY);

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL ?? "Hearst OS <noreply@hearst.app>";

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}): Promise<{ id?: string; error?: string }> {
  const client = getClient();
  if (!client) return { error: "resend_not_configured" };
  try {
    const { data, error } = await client.emails.send({
      from: params.from ?? DEFAULT_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html ?? "",
      text: params.text,
    });
    if (error) return { error: error.message };
    return { id: data?.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "unknown_error" };
  }
}
