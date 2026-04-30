/**
 * Helpers partagés pour les preview formatters Composio.
 */

export function header(app: string, action: string): string {
  return `Draft ${app.toUpperCase()} — ${action}`;
}

export function line(label: string, value: string): string {
  return `**${label}** : ${value}`;
}

export function footer(): string {
  return "\nReponds **confirmer** pour executer, ou **annuler** pour abandonner.";
}

export function preview(text: string, max = 200): string {
  if (!text) return "(vide)";
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (v === undefined || v === null) return [];
  return [String(v)];
}

export function formatDateFR(value: unknown): string {
  if (!value) return "—";
  const s = typeof value === "string" ? value : String(value);
  // Si déjà un ISO valide → format FR readable
  const date = new Date(s);
  if (!Number.isNaN(date.getTime())) {
    try {
      return date.toLocaleString("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return s;
    }
  }
  return s;
}
