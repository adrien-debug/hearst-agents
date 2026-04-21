import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth";
import type { EmailConnector, ConnectorResult, EmailMessage } from "./types";

interface GmailHeader {
  name?: string;
  value?: string;
}

function headerValue(headers: GmailHeader[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export const gmailConnector: EmailConnector = {
  async getEmails(userId: string, limit = 10): Promise<ConnectorResult<EmailMessage>> {
    const auth = await getGoogleAuth(userId);
    const gmail = google.gmail({ version: "v1", auth });

    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: limit,
      q: "in:inbox",
    });

    const messageIds = list.data.messages ?? [];

    const emails = await Promise.all(
      messageIds.map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        });

        const headers = (detail.data.payload?.headers ?? []) as GmailHeader[];

        return {
          id: detail.data.id ?? msg.id!,
          subject: headerValue(headers, "Subject") || "(sans sujet)",
          sender: headerValue(headers, "From"),
          snippet: detail.data.snippet ?? "",
          date: headerValue(headers, "Date"),
          isRead: !(detail.data.labelIds ?? []).includes("UNREAD"),
        };
      }),
    );

    return { data: emails, provider: "gmail" };
  },
};

/**
 * Search and read recent emails, optionally filtered by sender or query.
 * Returns emails with full snippet content for summarization.
 */
export async function searchEmails(
  userId: string,
  query?: string,
  limit = 10,
): Promise<Array<{ id: string; subject: string; sender: string; snippet: string; date: string; body: string }>> {
  const auth = await getGoogleAuth(userId);
  const gmail = google.gmail({ version: "v1", auth });

  const q = query ? `in:inbox ${query}` : "in:inbox";
  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: limit,
    q,
  });

  const messageIds = list.data.messages ?? [];
  if (messageIds.length === 0) return [];

  return Promise.all(
    messageIds.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      });

      const headers = (detail.data.payload?.headers ?? []) as GmailHeader[];
      const body = extractBody(detail.data.payload);

      return {
        id: detail.data.id ?? msg.id!,
        subject: headerValue(headers, "Subject") || "(sans sujet)",
        sender: headerValue(headers, "From"),
        snippet: detail.data.snippet ?? "",
        date: headerValue(headers, "Date"),
        body: body.slice(0, 2000),
      };
    }),
  );
}

function extractBody(payload: any): string {
  if (!payload) return "";

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    const textPart = payload.parts.find(
      (p: any) => p.mimeType === "text/plain" && p.body?.data,
    );
    if (textPart) {
      return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }
    const htmlPart = payload.parts.find(
      (p: any) => p.mimeType === "text/html" && p.body?.data,
    );
    if (htmlPart) {
      const html = Buffer.from(htmlPart.body.data, "base64url").toString("utf-8");
      return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  }

  return "";
}
