/**
 * Asana preview formatters.
 */

import { footer, header, line, preview, asArray } from "./shared";

export function formatAsanaCreateTask(args: Record<string, unknown>): string {
  const name = String(args.name ?? args.title ?? "(sans titre)");
  const project = args.project ?? args.project_id ?? args.workspace;
  const assignee = args.assignee ?? args.assignee_id;
  const dueOn = args.due_on ?? args.dueOn ?? args.due_at;
  const notes = args.notes ?? args.html_notes;
  const tags = asArray(args.tags);

  const lines = [
    line("Tâche", name),
    project ? line("Projet", String(project)) : null,
    assignee ? line("Assigné à", String(assignee)) : null,
    dueOn ? line("Échéance", String(dueOn)) : null,
    notes ? line("Notes", preview(String(notes), 200)) : null,
    tags.length > 0 ? line("Tags", tags.join(", ")) : null,
  ].filter(Boolean) as string[];

  return [header("ASANA", "Créer une tâche"), ...lines, footer()].join("\n");
}
