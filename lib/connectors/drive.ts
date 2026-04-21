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

/**
 * Search Drive files by name query, return matching entries.
 */
export async function searchDriveFiles(
  userId: string,
  query: string,
  limit = 10,
): Promise<FileEntry[]> {
  const auth = await getGoogleAuth(userId);
  const drive = google.drive({ version: "v3", auth });

  const escaped = query.replace(/'/g, "\\'");
  const res = await drive.files.list({
    pageSize: limit,
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
    q: `name contains '${escaped}' and trashed = false`,
  });

  return (res.data.files ?? []).map((f) => ({
    id: f.id ?? "",
    name: f.name ?? "(sans nom)",
    mimeType: f.mimeType ?? "",
    size: formatFileSize(f.size),
    modifiedTime: f.modifiedTime ?? "",
    webViewLink: f.webViewLink ?? undefined,
    shared: f.shared ?? false,
  }));
}

/**
 * Read the text content of a Google Drive file.
 * Supports Google Docs (exported as plain text) and plain text files.
 */
export async function readDriveFileContent(
  userId: string,
  fileId: string,
): Promise<string> {
  const auth = await getGoogleAuth(userId);
  const drive = google.drive({ version: "v3", auth });

  const meta = await drive.files.get({ fileId, fields: "mimeType,name" });
  const mimeType = meta.data.mimeType ?? "";

  if (mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    return typeof res.data === "string" ? res.data : String(res.data);
  }

  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    const res = await drive.files.export(
      { fileId, mimeType: "text/csv" },
      { responseType: "text" },
    );
    return typeof res.data === "string" ? res.data : String(res.data);
  }

  if (mimeType === "application/vnd.google-apps.presentation") {
    const res = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    return typeof res.data === "string" ? res.data : String(res.data);
  }

  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "text" },
    );
    return typeof res.data === "string" ? res.data : String(res.data);
  }

  return `[Fichier binaire: ${meta.data.name} (${mimeType}) — contenu non lisible en texte]`;
}
