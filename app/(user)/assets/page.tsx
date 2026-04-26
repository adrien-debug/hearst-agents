"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import type { FocalObject } from "@/stores/focal";
import { Breadcrumb, type Crumb } from "../components/Breadcrumb";

interface Asset {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  url?: string;
}

const TYPE_GLYPH: Record<string, string> = {
  report: "▦",
  brief: "≡",
  message: "✉",
  document: "▤",
  doc: "▤",
  synthesis: "◇",
  plan: "◈",
};

function glyph(type: string): string {
  return TYPE_GLYPH[type.toLowerCase()] || "·";
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "à venir";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d}j`;
  const w = Math.floor(d / 7);
  if (w < 4) return `il y a ${w}sem`;
  const mo = Math.floor(d / 30);
  return `il y a ${mo}mo`;
}

function assetToFocal(asset: Asset, threadId: string | null): FocalObject {
  const now = Date.now();
  const typeMap: Record<string, FocalObject["type"]> = {
    report: "report",
    brief: "brief",
    document: "doc",
    doc: "doc",
    message: "message_receipt",
    plan: "outline",
    synthesis: "report",
  };
  return {
    id: asset.id,
    type: typeMap[asset.type.toLowerCase()] ?? "doc",
    status: "ready",
    title: asset.name,
    summary: `Asset · ${asset.type.toUpperCase()} · ${(asset.size / 1024).toFixed(1)} KB`,
    sourceAssetId: asset.id,
    threadId: threadId ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export default function AssetsPage() {
  const router = useRouter();
  const setFocal = useFocalStore((s) => s.setFocal);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAssets() {
      try {
        const res = await fetch("/api/v2/assets");
        if (res.ok) {
          const data = await res.json();
          setAssets(data.assets || []);
        }
      } catch (_err) {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }
    loadAssets();
  }, []);

  const handleOpen = (asset: Asset) => {
    setFocal(assetToFocal(asset, activeThreadId));
    router.push("/");
  };

  const handleDownload = (asset: Asset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (asset.url) {
      window.open(asset.url, "_blank");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="t-11 font-mono tracking-[0.3em] uppercase text-[var(--text-faint)] animate-pulse">
          Loading assets…
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="border-b border-[var(--surface-2)] p-6">
        <Breadcrumb trail={[{ label: "Hearst", href: "/" }, { label: "Assets" }] as Crumb[]} className="mb-4" />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="ghost-title-impact text-lg mb-1">Assets</h1>
            <p className="t-11 font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">
              {assets.length} {assets.length === 1 ? "fichier" : "fichiers"} stocké{assets.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          {assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
              <p className="t-9 font-mono tracking-[0.3em] uppercase text-[var(--text-faint)]">EMPTY_REGISTRY</p>
              <p className="t-13 text-[var(--text-muted)] max-w-md leading-relaxed">
                Aucun asset pour l&apos;instant. Les rapports, briefs et documents générés par tes runs apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="border-y border-[var(--surface-2)]">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] gap-x-6 px-2 py-3 t-9 font-mono uppercase tracking-[0.3em] text-[var(--text-faint)] border-b border-[var(--surface-2)]">
                <span className="w-4" />
                <span>Name</span>
                <span className="text-right">Type</span>
                <span className="text-right">Size</span>
                <span className="text-right">Created</span>
              </div>

              {assets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => handleOpen(asset)}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] gap-x-6 items-center px-2 py-4 hover:bg-[var(--surface-1)] transition-colors border-b border-[var(--surface-2)] group cursor-pointer"
                  title={`Open ${asset.name}`}
                >
                  <span className="t-15 text-[var(--cykan)] opacity-40 group-hover:opacity-100 transition-opacity leading-none w-4 text-center">
                    {glyph(asset.type)}
                  </span>
                  <span className="t-13 text-[var(--text-soft)] group-hover:text-[var(--cykan)] group-hover:halo-cyan-sm transition-colors truncate">
                    {asset.name}
                  </span>
                  <span className="t-9 font-mono tracking-[0.2em] text-[var(--text-faint)] uppercase text-right">
                    {asset.type}
                  </span>
                  <span className="t-9 font-mono text-[var(--text-faint)] text-right">
                    {(asset.size / 1024).toFixed(1)} KB
                  </span>
                  <span className="t-9 font-mono tracking-[0.2em] text-[var(--text-ghost)] uppercase text-right">
                    {formatRelative(asset.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleDownload(asset, e)}
                    disabled={!asset.url}
                    className="t-9 font-mono tracking-[0.2em] uppercase text-[var(--text-ghost)] hover:text-[var(--cykan)] opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0"
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
