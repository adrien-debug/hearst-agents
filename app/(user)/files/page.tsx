"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import type { UnifiedFile } from "@/lib/connectors/unified-types";
import { driveToUnifiedFile } from "@/lib/connectors/unified-types";

const MIME_ICON: Record<string, string> = {
  "application/pdf": "📕",
  "application/vnd.google-apps.spreadsheet": "📊",
  "application/vnd.google-apps.document": "📄",
  "application/vnd.google-apps.presentation": "📊",
  "application/vnd.google-apps.folder": "📁",
  "image/": "🖼️",
  "video/": "🎬",
};

function fileIcon(mimeType: string): string {
  for (const [key, icon] of Object.entries(MIME_ICON)) {
    if (mimeType.startsWith(key)) return icon;
  }
  return "📄";
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = diff / (1000 * 60 * 60);
    if (hours < 1) return "Il y a moins d'une heure";
    if (hours < 24) return `Il y a ${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Hier";
    if (days < 7) return `Il y a ${days} jours`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

export default function FilesPage() {
  const { data: session } = useSession();
  const [files, setFiles] = useState<UnifiedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/files/list");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        if (data.files && Array.isArray(data.files)) {
          setFiles(data.files.map(driveToUnifiedFile));
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[Files] Fetch failed:", err);
        setError("Impossible de charger vos fichiers. Réessayez plus tard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-zinc-800/60 px-6 py-5">
          <h1 className="text-xl font-semibold text-white">Fichiers</h1>
          <p className="mt-1 text-sm text-zinc-500">Connectez votre compte pour voir vos documents</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-zinc-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <p className="mt-5 text-sm text-zinc-400">Aucun stockage connecté</p>
          <p className="mt-1 text-xs text-zinc-600">Connectez un service depuis les Applications.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-zinc-800/60 px-6 py-5">
          <h1 className="text-xl font-semibold text-white">Fichiers</h1>
          <p className="mt-1 text-sm text-zinc-500">Chargement...</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
            <span className="text-sm text-zinc-400">Récupération de vos fichiers...</span>
          </div>
          <div className="w-full max-w-md space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-lg border border-zinc-800/60 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-zinc-800" />
                  <div className="flex-1">
                    <div className="h-3 w-2/3 rounded bg-zinc-800" />
                    <div className="mt-2 h-2 w-1/4 rounded bg-zinc-800/60" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-zinc-800/60 px-6 py-5">
          <h1 className="text-xl font-semibold text-white">Fichiers</h1>
          <p className="mt-1 text-sm text-zinc-500">Erreur de chargement</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-950/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-red-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm text-zinc-400">{error}</p>
          <button onClick={() => window.location.reload()} className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-zinc-800/60 px-6 py-5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-white">Fichiers</h1>
            <span className="rounded-full bg-emerald-950/40 px-2 py-0.5 text-[9px] font-medium text-emerald-400">Connecté</span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">Aucun fichier récent</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-zinc-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <p className="mt-5 text-sm text-zinc-400">Aucun fichier récent</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-800/60 px-6 py-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-white">Fichiers</h1>
          <span className="rounded-full bg-emerald-950/40 px-2 py-0.5 text-[9px] font-medium text-emerald-400">Connecté</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {files.length} fichier{files.length > 1 ? "s" : ""} récent{files.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4">
          <div className="space-y-2">
            {files.map((file) => (
              <a
                key={file.id}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-900/40 px-4 py-3 transition-all duration-200 hover:bg-zinc-800/50"
              >
                <span className="text-lg">{fileIcon(file.mimeType)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{file.name}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {file.size && <span className="text-[10px] text-zinc-600">{file.size}</span>}
                    {file.size && <span className="text-[10px] text-zinc-700">·</span>}
                    <span className="text-[10px] text-zinc-600">{formatRelativeTime(file.modifiedTime)}</span>
                  </div>
                </div>
                {file.shared && (
                  <span className="flex items-center gap-1 rounded-full bg-zinc-800/60 px-2 py-0.5 text-[10px] text-zinc-500">
                    Partagé
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
