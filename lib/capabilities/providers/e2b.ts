import { Sandbox } from "@e2b/code-interpreter";

export async function executeCode(params: {
  code: string;
  language?: "python" | "javascript";
  timeoutMs?: number;
}): Promise<{
  stdout: string;
  stderr: string;
  results: Array<{ type: string; data: unknown }>;
  error?: string;
}> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    return { stdout: "", stderr: "", results: [], error: "E2B non configuré" };
  }

  const language = params.language ?? "python";
  const timeoutMs = params.timeoutMs ?? 30_000;

  let sandbox: Sandbox | undefined;
  try {
    sandbox = await Sandbox.create({ apiKey });

    const execution = await sandbox.runCode(params.code, { language, timeoutMs });

    const stdout = execution.logs.stdout.join("\n");
    const stderr = execution.logs.stderr.join("\n");

    const results = execution.results.map((r) => {
      if (r.json !== undefined) {
        let parsed: unknown = r.json;
        try { parsed = JSON.parse(r.json); } catch { /* keep raw string */ }
        return { type: "json", data: parsed };
      }
      if (r.png !== undefined) return { type: "image/png", data: r.png };
      if (r.jpeg !== undefined) return { type: "image/jpeg", data: r.jpeg };
      if (r.text !== undefined) return { type: "text", data: r.text };
      return { type: "unknown", data: r };
    });

    const error = execution.error
      ? `${execution.error.name}: ${execution.error.value}`
      : undefined;

    return { stdout, stderr, results, error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { stdout: "", stderr: "", results: [], error: message };
  } finally {
    if (sandbox) {
      await sandbox.kill().catch(() => {});
    }
  }
}
