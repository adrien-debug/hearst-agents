/**
 * Trello preview formatters.
 */

import { footer, header, line, preview, asArray } from "./shared";

export function formatTrelloCreateCard(args: Record<string, unknown>): string {
  const name = String(args.name ?? args.title ?? "(sans titre)");
  const list = args.idList ?? args.list_id ?? args.list;
  const desc = args.desc ?? args.description;
  const due = args.due ?? args.due_date;
  const labels = asArray(args.idLabels ?? args.labels);
  const members = asArray(args.idMembers ?? args.members);

  const lines = [
    line("Carte", name),
    list ? line("Liste", String(list)) : null,
    desc ? line("Description", preview(String(desc), 200)) : null,
    due ? line("Échéance", String(due)) : null,
    labels.length > 0 ? line("Labels", labels.join(", ")) : null,
    members.length > 0 ? line("Membres", members.join(", ")) : null,
  ].filter(Boolean) as string[];

  return [header("TRELLO", "Créer une carte"), ...lines, footer()].join("\n");
}
