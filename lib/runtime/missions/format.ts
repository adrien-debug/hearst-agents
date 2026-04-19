/**
 * Human-readable schedule formatting for scheduled missions.
 * Deterministic, French-first.
 */

const DAY_NAMES: Record<number, string> = {
  0: "dimanche",
  1: "lundi",
  2: "mardi",
  3: "mercredi",
  4: "jeudi",
  5: "vendredi",
  6: "samedi",
};

export function formatMissionSchedule(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return schedule;

  const [minuteRaw, hourRaw, , , dowRaw] = parts;
  const minute = minuteRaw === "*" ? null : parseInt(minuteRaw, 10);
  const hour = hourRaw === "*" ? null : parseInt(hourRaw, 10);
  const dow = dowRaw === "*" ? null : parseInt(dowRaw, 10);

  const timeStr =
    hour !== null
      ? `${String(hour).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}`
      : null;

  if (dow !== null && DAY_NAMES[dow] && timeStr) {
    return `Chaque ${DAY_NAMES[dow]} à ${timeStr}`;
  }

  if (timeStr) {
    return `Chaque jour à ${timeStr}`;
  }

  if (minute !== null) {
    return `Toutes les heures à :${String(minute).padStart(2, "0")}`;
  }

  return schedule;
}
