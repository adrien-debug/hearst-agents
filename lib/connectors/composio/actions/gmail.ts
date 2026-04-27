/**
 * Composio Gmail actions — typed wrappers around the generic adapter.
 *
 * Why a per-action wrapper instead of calling `executeComposioAction` directly?
 * - Caller-friendly typed params (autocomplete + compile-time check)
 * - Stable shape if Composio renames the action slug (we change one line here)
 * - Per-action telemetry / instrumentation hook point
 */

import { executeComposioAction } from "../client";
import type { ComposioResult } from "../types";

export interface GmailSendInput {
  /** Composio entityId — typically our user_id. */
  userId: string;
  /** Recipient address. Required. */
  to: string;
  /** Subject line. Required. */
  subject: string;
  /** Plain text or HTML body. Required. */
  body: string;
  cc?: string[];
  bcc?: string[];
  /** When true, body is interpreted as HTML. */
  isHtml?: boolean;
}

export interface GmailSendOutput extends ComposioResult {
  /** Gmail message id when the send succeeds. */
  messageId?: string;
}

const ACTION = "GMAIL_SEND_EMAIL";

export async function gmailSendEmail(input: GmailSendInput): Promise<GmailSendOutput> {
  if (!input.to.trim() || !input.subject.trim() || !input.body.trim()) {
    return {
      ok: false,
      error: "Missing required field — `to`, `subject` and `body` must be non-empty.",
      errorCode: "ACTION_FAILED",
    };
  }

  const result = await executeComposioAction({
    action: ACTION,
    entityId: input.userId,
    params: {
      recipient_email: input.to,
      subject: input.subject,
      body: input.body,
      ...(input.cc && input.cc.length > 0 ? { cc: input.cc } : {}),
      ...(input.bcc && input.bcc.length > 0 ? { bcc: input.bcc } : {}),
      ...(input.isHtml ? { is_html: true } : {}),
    },
  });

  if (!result.ok) return result;

  // Composio responses typically wrap the provider payload under `data` or `response_data`.
  const payload = result.data as { id?: string; messageId?: string; data?: { id?: string } } | undefined;
  const messageId = payload?.messageId ?? payload?.id ?? payload?.data?.id;

  return { ok: true, data: result.data, messageId };
}
