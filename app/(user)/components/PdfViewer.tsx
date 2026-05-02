"use client";

/**
 * PdfViewer — composant réutilisable pour afficher un PDF inline.
 *
 * Utilise <iframe> natif (couvre 95% navigateurs en 2026, zéro dep).
 * Fallback : si l'iframe échoue (CSP, 404), affiche un message + bouton
 * download via fallbackHref.
 *
 * Usage :
 *   <PdfViewer signedUrl={asset.pdfUrl} fallbackHref={asset.pdfUrl} />
 */

import { useState } from "react";

interface PdfViewerProps {
  signedUrl: string | null;
  fallbackHref?: string;
  /** Hauteur cible (default 600px). */
  height?: number;
  /** Aspect ratio CSS (default 8.5/11 — letter portrait). */
  aspectRatio?: string;
}

export function PdfViewer({
  signedUrl,
  fallbackHref,
  height = 600,
  aspectRatio = "8.5 / 11",
}: PdfViewerProps) {
  const [iframeError, setIframeError] = useState(false);

  if (!signedUrl) {
    return (
      <div
        className="t-11"
        style={{
          padding: "var(--space-6)",
          background: "var(--surface-2)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-faint)",
          textAlign: "center",
        }}
      >
        PDF indisponible.
      </div>
    );
  }

  if (iframeError) {
    return (
      <div
        className="t-11 flex flex-col items-center"
        style={{
          padding: "var(--space-6)",
          background: "var(--surface-2)",
          borderRadius: "var(--radius-sm)",
          gap: "var(--space-2)",
          textAlign: "center",
        }}
      >
        <p style={{ color: "var(--text-muted)" }}>
          Ce navigateur ne peut pas afficher le PDF en ligne.
        </p>
        {fallbackHref && (
          <a
            href={fallbackHref}
            target="_blank"
            rel="noopener noreferrer"
            className="read-more"
          >
            Télécharger le PDF →
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        aspectRatio,
        minHeight: height,
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <iframe
        src={signedUrl}
        title="PDF preview"
        style={{ width: "100%", height: "100%", border: 0 }}
        onError={() => setIframeError(true)}
      />
    </div>
  );
}
