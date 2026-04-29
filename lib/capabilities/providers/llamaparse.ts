const API_BASE = "https://api.cloud.llamaindex.ai/api/parsing";
const POLL_INTERVAL_MS = 3_000;
const MAX_ATTEMPTS = 40;

export async function parseDocument(params: {
  fileUrl: string;
  mimeType?: string;
}): Promise<{ markdown: string; pages: number }> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY;
  if (!apiKey) {
    throw new Error("LlamaParse non configuré");
  }

  const mimeType = params.mimeType ?? "application/pdf";
  const authHeaders = { Authorization: `Bearer ${apiKey}` };

  // 1. Fetch file content
  const fileRes = await fetch(params.fileUrl);
  if (!fileRes.ok) {
    throw new Error(`[LlamaParse] Fetch fichier échoué: ${fileRes.status}`);
  }
  const fileBuffer = await fileRes.arrayBuffer();

  // 2. Upload (multipart)
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: mimeType }), "document");

  const uploadRes = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: authHeaders,
    body: form,
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text().catch(() => "");
    throw new Error(`[LlamaParse] Upload échoué ${uploadRes.status}: ${errBody.slice(0, 200)}`);
  }

  const { id: jobId } = await uploadRes.json() as { id: string };

  // 3. Poll GET /job/{jobId}/result every 3s, max 40 attempts
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const pollRes = await fetch(`${API_BASE}/job/${jobId}/result`, {
      headers: authHeaders,
    });

    if (!pollRes.ok) {
      console.warn(`[LlamaParse] Poll ${attempt + 1}/${MAX_ATTEMPTS} — HTTP ${pollRes.status}`);
      continue;
    }

    const result = await pollRes.json() as {
      status: string;
      markdown?: string;
      pages?: number;
    };

    if (result.status === "SUCCESS") {
      return {
        markdown: result.markdown ?? "",
        pages: result.pages ?? 0,
      };
    }

    if (result.status === "ERROR" || result.status === "FAILED") {
      throw new Error(`[LlamaParse] Job ${jobId} échoué avec statut: ${result.status}`);
    }
  }

  throw new Error("LlamaParse timeout après 120s");
}
