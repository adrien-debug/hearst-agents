import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: number;
  webViewLink?: string;
}

export async function searchDriveFiles(
  userId: string,
  query: string,
  limit = 10,
): Promise<DriveFile[]> {
  const auth = await getGoogleAuth(userId);
  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.list({
    pageSize: limit,
    fields: "files(id, name, mimeType, modifiedTime, size, webViewLink)",
    q: `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
  });
  return (response.data.files ?? []).map((file): DriveFile => ({
    id: file.id ?? "",
    name: file.name ?? "(Sans nom)",
    mimeType: file.mimeType ?? "application/octet-stream",
    modifiedTime: file.modifiedTime ?? new Date().toISOString(),
    size: file.size ? parseInt(file.size, 10) : undefined,
    webViewLink: file.webViewLink ?? undefined,
  }));
}

export async function readDriveFileContent(userId: string, fileId: string): Promise<string> {
  const auth = await getGoogleAuth(userId);
  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" },
  );
  return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
}

export async function getRecentFiles(userId: string, limit = 10): Promise<DriveFile[]> {
  const auth = await getGoogleAuth(userId);
  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.list({
    pageSize: limit,
    fields: "files(id, name, mimeType, modifiedTime, size, webViewLink)",
    orderBy: "modifiedTime desc",
    q: "trashed = false",
  });

  return (response.data.files ?? []).map((file): DriveFile => ({
    id: file.id ?? "",
    name: file.name ?? "(Sans nom)",
    mimeType: file.mimeType ?? "application/octet-stream",
    modifiedTime: file.modifiedTime ?? new Date().toISOString(),
    size: file.size ? parseInt(file.size, 10) : undefined,
    webViewLink: file.webViewLink ?? undefined,
  }));
}
