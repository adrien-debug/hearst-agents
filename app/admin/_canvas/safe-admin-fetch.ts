/**
 * Fetch JSON admin côté client — une seule implémentation pour éviter les doublons
 * entre `CanvasShell` et `RunRail`.
 */

export async function fetchAdminJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

export async function fetchAdminJsonWithMeta<T>(
  url: string,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    if (!text) return { data: null, error: null };
    try {
      return { data: JSON.parse(text) as T, error: null };
    } catch {
      return { data: null, error: "réponse invalide" };
    }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "erreur réseau" };
  }
}
