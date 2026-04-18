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
