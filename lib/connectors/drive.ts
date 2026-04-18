import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth";
import type { FileConnector, ConnectorResult, FileEntry } from "./types";

function formatFileSize(bytes?: string | null): string {
  if (!bytes) return "";
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return "";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export const driveConnector: FileConnector = {
  async getFiles(userId: string, limit = 15): Promise<ConnectorResult<FileEntry>> {
    const auth = await getGoogleAuth(userId);
    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.list({
      pageSize: limit,
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,size,modifiedTime,webViewLink,shared)",
      q: "trashed = false",
    });

    const files: FileEntry[] = (res.data.files ?? []).map((f) => ({
      id: f.id ?? "",
      name: f.name ?? "(sans nom)",
      mimeType: f.mimeType ?? "",
      size: formatFileSize(f.size),
      modifiedTime: f.modifiedTime ?? "",
      webViewLink: f.webViewLink ?? undefined,
      shared: f.shared ?? false,
    }));

    return { data: files, provider: "google_drive" };
  },
};
