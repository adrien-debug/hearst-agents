/**
 * Client-side consumption of POST /api/orchestrate SSE body.
 * Surfaces terminal run_failed; otherwise treats stream completion as ok.
 */

export type OrchestrateStreamResult = { ok: true } | { ok: false; error: string };

/**
 * Read an orchestrate Response body until close; fail fast on run_failed events.
 */
export async function consumeOrchestrateSseResponse(res: Response): Promise<OrchestrateStreamResult> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const t = await res.text();
      if (t) {
        try {
          const j = JSON.parse(t) as { error?: string };
          if (j.error) msg = j.error;
          else msg = t.slice(0, 300);
        } catch {
          msg = t.slice(0, 300);
        }
      }
    } catch {
      /* keep msg */
    }
    return { ok: false, error: msg };
  }

  const reader = res.body?.getReader();
  if (!reader) {
    return { ok: false, error: "empty_response_body" };
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6)) as { type?: string; error?: string };
          if (event.type === "run_failed") {
            return {
              ok: false,
              error: typeof event.error === "string" && event.error.length > 0
                ? event.error
                : "run_failed",
            };
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  return { ok: true };
}
