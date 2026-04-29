/**
 * Page publique d'un report partagé.
 *
 * Server component — pas de SessionProvider.
 * Récupère côté serveur le payload via le token et l'affiche en lecture seule.
 * Le robots noindex est porté par les metadata (Next 15 app router).
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  verifyToken,
  hashToken,
} from "@/lib/reports/sharing/signed-url";
import {
  findShareByTokenHash,
  incrementShareViewCount,
} from "@/lib/reports/sharing/store";
import { getServerSupabase } from "@/lib/platform/db/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: "Hearst — rapport partagé",
};

interface PageProps {
  params: Promise<{ token: string }>;
}

interface PublicReportData {
  status: "ok";
  title: string;
  summary: string | null;
  createdAt: string;
  expiresAt: string;
  narration: string | null;
  blocks: Array<{ id: string; type: string; label?: string }>;
}

interface PublicReportError {
  status: "error";
  code: string;
}

async function loadPublicReport(
  token: string,
): Promise<PublicReportData | PublicReportError> {
  const verify = verifyToken(token);
  if (!verify.ok) {
    return { status: "error", code: verify.reason };
  }
  const share = await findShareByTokenHash(hashToken(token));
  if (!share) return { status: "error", code: "not_found" };
  if (share.revoked_at) return { status: "error", code: "revoked" };

  const sb = getServerSupabase();
  if (!sb) return { status: "error", code: "storage_unavailable" };
  const { data: asset } = await sb
    .from("assets")
    .select("title, summary, content_ref, created_at")
    .eq("id", share.asset_id)
    .maybeSingle();
  if (!asset) return { status: "error", code: "asset_not_found" };

  void incrementShareViewCount(share.id);

  let narration: string | null = null;
  let blocks: Array<{ id: string; type: string; label?: string }> = [];
  if (
    typeof asset.content_ref === "string" &&
    asset.content_ref.trim().startsWith("{")
  ) {
    try {
      const parsed = JSON.parse(asset.content_ref) as Record<string, unknown>;
      const candidatePayload =
        (parsed.payload as Record<string, unknown> | undefined) ??
        (parsed.__reportPayload === true
          ? (parsed as Record<string, unknown>)
          : undefined);
      if (candidatePayload && Array.isArray(candidatePayload.blocks)) {
        blocks = (candidatePayload.blocks as Array<Record<string, unknown>>).map(
          (b) => ({
            id: String(b.id ?? "?"),
            type: String(b.type ?? "?"),
            label: typeof b.label === "string" ? b.label : undefined,
          }),
        );
      }
      if (typeof parsed.narration === "string") narration = parsed.narration;
    } catch {
      // ignore
    }
  }

  return {
    status: "ok",
    title: asset.title ?? "Rapport",
    summary: asset.summary ?? null,
    createdAt: String(asset.created_at ?? ""),
    expiresAt: share.expires_at,
    narration,
    blocks,
  };
}

export default async function PublicReportPage({ params }: PageProps) {
  // touche les headers pour forcer le rendering dynamique côté Next 15
  await headers();
  const { token } = await params;
  const result = await loadPublicReport(token);

  if (result.status === "error") {
    return (
      <main
        style={{
          padding: "var(--space-12)",
          maxWidth: "var(--space-160, 720px)",
          margin: "0 auto",
          color: "var(--text)",
        }}
      >
        <h1 className="halo-title-xl">Lien indisponible</h1>
        <p className="t-13" style={{ color: "var(--text-muted)" }}>
          Ce lien de partage n'est plus valide ({result.code}).
        </p>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: "var(--space-12)",
        maxWidth: "var(--space-160, 960px)",
        margin: "0 auto",
        color: "var(--text)",
      }}
    >
      <header style={{ marginBottom: "var(--space-6)" }}>
        <h1 className="halo-title-xl">{result.title}</h1>
        {result.summary ? (
          <p className="t-15" style={{ color: "var(--text-muted)" }}>
            {result.summary}
          </p>
        ) : null}
        <p className="t-9" style={{ color: "var(--text-muted)" }}>
          Lien valide jusqu'au {new Date(result.expiresAt).toLocaleString("fr-FR")}
        </p>
      </header>

      {result.narration ? (
        <section style={{ marginBottom: "var(--space-6)" }}>
          <h2 className="halo-mono-label">Narration</h2>
          <p className="t-13" style={{ whiteSpace: "pre-wrap" }}>
            {result.narration}
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="halo-mono-label">Blocs</h2>
        <ul className="t-13">
          {result.blocks.map((b) => (
            <li key={b.id}>
              <strong>{b.label ?? b.id}</strong>{" "}
              <span style={{ color: "var(--text-muted)" }}>({b.type})</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
