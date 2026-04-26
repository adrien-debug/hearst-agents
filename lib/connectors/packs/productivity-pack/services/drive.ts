import { google } from "googleapis";
import { getGoogleAuth } from "../auth/google";
import type { ConnectorResult, FileConnector, FileEntry } from "@/lib/connectors/types";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: number;
  webViewLink?: string;
  thumbnailLink?: string;
  owners?: string[];
}

/**
 * Connector Drive pour l'interface unifiée
 */
export const driveConnector: FileConnector = {
  async getFiles(userId: string, limit = 10): Promise<ConnectorResult<FileEntry>> {
    const result = await getRecentFiles(userId, limit);
    return {
      data: result.data?.map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size?.toString(),
        webViewLink: f.webViewLink,
        shared: false, // Default value, would need additional API call to determine
      })),
      provider: "google-drive",
    };
  },
};

/**
 * Récupère les fichiers récents de Google Drive
 */
export async function getRecentFiles(
  userId: string,
  limit = 10,
): Promise<ConnectorResult<DriveFile>> {
  const auth = await getGoogleAuth(userId);
  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.list({
    pageSize: limit,
    fields: "files(id, name, mimeType, modifiedTime, size, webViewLink, thumbnailLink, owners)",
    orderBy: "modifiedTime desc",
    q: "trashed = false",
  });

  const files = (response.data.files ?? []).map((file): DriveFile => ({
    id: file.id ?? "",
    name: file.name ?? "(Sans nom)",
    mimeType: file.mimeType ?? "application/octet-stream",
    modifiedTime: file.modifiedTime ?? new Date().toISOString(),
    size: file.size ? parseInt(file.size, 10) : undefined,
    webViewLink: file.webViewLink ?? undefined,
    thumbnailLink: file.thumbnailLink ?? undefined,
    owners: file.owners?.map(o => o.displayName ?? o.emailAddress ?? "").filter(Boolean),
  }));

  return { data: files, provider: "google-drive" };
}

/**
 * Recherche des fichiers par nom (alias pour compatibilité legacy)
 */
export async function searchDriveFiles(
  userId: string,
  query: string,
  limit = 10,
): Promise<DriveFile[]> {
  return searchFiles(userId, query, limit);
}

/**
 * Recherche des fichiers par nom
 */
export async function searchFiles(
  userId: string,
  query: string,
  limit = 10,
): Promise<DriveFile[]> {
  const auth = await getGoogleAuth(userId);
  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.list({
    pageSize: limit,
    fields: "files(id, name, mimeType, modifiedTime, size, webViewLink, thumbnailLink, owners)",
    q: `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
  });

  return (response.data.files ?? []).map((file): DriveFile => ({
    id: file.id ?? "",
    name: file.name ?? "(Sans nom)",
    mimeType: file.mimeType ?? "application/octet-stream",
    modifiedTime: file.modifiedTime ?? new Date().toISOString(),
    size: file.size ? parseInt(file.size, 10) : undefined,
    webViewLink: file.webViewLink ?? undefined,
    thumbnailLink: file.thumbnailLink ?? undefined,
    owners: file.owners?.map(o => o.displayName ?? o.emailAddress ?? "").filter(Boolean),
  }));
}

/**
 * Récupère les fichiers par type MIME
 */
export async function getFilesByType(
  userId: string,
  mimeType: string,
  limit = 10,
): Promise<DriveFile[]> {
  const auth = await getGoogleAuth(userId);
  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.list({
    pageSize: limit,
    fields: "files(id, name, mimeType, modifiedTime, size, webViewLink, thumbnailLink, owners)",
    q: `mimeType = '${mimeType}' and trashed = false`,
    orderBy: "modifiedTime desc",
  });

  return (response.data.files ?? []).map((file): DriveFile => ({
    id: file.id ?? "",
    name: file.name ?? "(Sans nom)",
    mimeType: file.mimeType ?? "application/octet-stream",
    modifiedTime: file.modifiedTime ?? new Date().toISOString(),
    size: file.size ? parseInt(file.size, 10) : undefined,
    webViewLink: file.webViewLink ?? undefined,
    thumbnailLink: file.thumbnailLink ?? undefined,
    owners: file.owners?.map(o => o.displayName ?? o.emailAddress ?? "").filter(Boolean),
  }));
}

/**
 * Récupère les documents Google récents (Docs, Sheets, Slides)
 */
export async function getRecentDocuments(userId: string, limit = 10): Promise<DriveFile[]> {
  const auth = await getGoogleAuth(userId);
  const drive = google.drive({ version: "v3", auth });

  const mimeTypes = [
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
  ];

  const query = mimeTypes.map(t => `mimeType = '${t}'`).join(" or ");

  const response = await drive.files.list({
    pageSize: limit,
    fields: "files(id, name, mimeType, modifiedTime, size, webViewLink, thumbnailLink, owners)",
    q: `(${query}) and trashed = false`,
    orderBy: "modifiedTime desc",
  });

  return (response.data.files ?? []).map((file): DriveFile => ({
    id: file.id ?? "",
    name: file.name ?? "(Sans nom)",
    mimeType: file.mimeType ?? "application/octet-stream",
    modifiedTime: file.modifiedTime ?? new Date().toISOString(),
    size: file.size ? parseInt(file.size, 10) : undefined,
    webViewLink: file.webViewLink ?? undefined,
    thumbnailLink: file.thumbnailLink ?? undefined,
    owners: file.owners?.map(o => o.displayName ?? o.emailAddress ?? "").filter(Boolean),
  }));
}

/**
 * Lit le contenu d'un fichier Google Drive (texte simple)
 */
export async function readDriveFileContent(userId: string, fileId: string): Promise<string> {
  const auth = await getGoogleAuth(userId);
  const drive = google.drive({ version: "v3", auth });

  try {
    // Télécharger le contenu du fichier
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "text" }
    );
    
    return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
  } catch (err) {
    console.error("[Drive] Failed to read file content:", err);
    throw new Error(`Failed to read file ${fileId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
