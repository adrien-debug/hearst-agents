/**
 * Asset content parsers — helpers partagés entre FocalStage (embedded
 * dans ChatStage) et AssetStage (surface standalone post-pivot).
 *
 * Trois formats supportés pour `asset.contentRef` (string en DB) :
 *  1. JSON ReportPayload — structuré, rendu via <ReportLayout>
 *  2. HTML — rendu dans une <iframe sandbox>
 *  3. Plain text / markdown brut — rendu dans un <pre>
 *
 * Les call sites détectent le format via `tryParseReportPayload` puis
 * `isHtmlContent`, sinon fallback texte.
 */

import type { RenderPayload } from "@/lib/reports/engine/render-blocks";

/**
 * Type guard inline — évite le cross-import depuis app/ vers lib/.
 * Match le format produit par lib/reports/engine/run-report.ts (marker
 * `__reportPayload: true`).
 */
function isReportPayload(value: unknown): value is RenderPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "__reportPayload" in value &&
    (value as { __reportPayload: unknown }).__reportPayload === true
  );
}

/**
 * Heuristique : la string ressemble-t-elle à un document HTML ?
 * - Doctype au début, ou tag <html>/<body>
 * - Tags structurels reconnaissables dans les 200 premiers chars
 *
 * Volontairement permissive (intentionnellement) : un fragment HTML
 * collé sans wrapper passe quand même.
 */
export function isHtmlContent(content: string): boolean {
  const head = content.trim().slice(0, 200).toLowerCase();
  return (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.includes("<body") ||
    /<\/?(div|section|main|header|footer|p|span|h[1-6])\b/i.test(head)
  );
}

/**
 * Parse un asset content en payload report. Renvoie null si le contenu
 * n'est pas un JSON ou ne porte pas le marqueur __reportPayload (cf.
 * isReportPayload de ReportLayout). Préfere null à un throw pour que
 * le caller puisse chaîner avec isHtmlContent / fallback texte.
 */
export function tryParseReportPayload(content: string): ReturnType<typeof JSON.parse> | null {
  const head = content.trim().slice(0, 50);
  if (!head.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(content);
    return isReportPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
