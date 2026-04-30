/**
 * Linear preview formatters.
 */

import { footer, header, line, preview, asArray } from "./shared";

const PRIORITY_LABELS: Record<string, string> = {
  "0": "Aucune",
  "1": "Urgente",
  "2": "Haute",
  "3": "Moyenne",
  "4": "Basse",
};

export function formatLinearCreateIssue(args: Record<string, unknown>): string {
  const team = String(args.team_id ?? args.teamId ?? args.team ?? "—");
  const title = String(args.title ?? "(sans titre)");
  const description = String(args.description ?? "");
  const assignee = args.assignee_id ?? args.assignee ?? null;
  const labels = asArray(args.labels ?? args.label_ids);
  const priorityRaw = args.priority;
  const priorityLabel =
    priorityRaw !== undefined && priorityRaw !== null
      ? PRIORITY_LABELS[String(priorityRaw)] ?? String(priorityRaw)
      : null;

  const lines = [
    line("Équipe", team),
    line("Titre", title),
    description ? line("Description", preview(description, 200)) : null,
    assignee ? line("Assigné à", String(assignee)) : null,
    labels.length > 0 ? line("Labels", labels.join(", ")) : null,
    priorityLabel ? line("Priorité", priorityLabel) : null,
  ].filter(Boolean) as string[];

  return [header("LINEAR", "Créer un issue"), ...lines, footer()].join("\n");
}
