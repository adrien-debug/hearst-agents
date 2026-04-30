/**
 * Notion preview formatters.
 */

import { footer, header, line, preview, asArray } from "./shared";

export function formatNotionCreatePage(args: Record<string, unknown>): string {
  const parent = String(
    (args.parent as Record<string, unknown> | undefined)?.database_id ??
      (args.parent as Record<string, unknown> | undefined)?.page_id ??
      args.parent_id ??
      args.parentId ??
      args.parent ??
      "—",
  );
  const title = String(
    args.title ??
      (args.properties as Record<string, unknown> | undefined)?.title ??
      "(sans titre)",
  );
  const blocks = asArray(args.children).length;
  const props =
    args.properties && typeof args.properties === "object"
      ? Object.keys(args.properties as Record<string, unknown>)
      : [];

  const lines = [
    line("Titre", title),
    line("Parent", preview(parent, 80)),
    props.length > 0 ? line("Propriétés", props.slice(0, 6).join(", ")) : null,
    blocks > 0 ? line("Contenu", `${blocks} bloc(s)`) : null,
  ].filter(Boolean) as string[];

  return [header("NOTION", "Créer une page"), ...lines, footer()].join("\n");
}
