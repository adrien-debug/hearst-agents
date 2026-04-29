const RUNWAY_API_BASE = "https://api.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";

export async function runwayGenerateVideo(params: {
  promptText: string;
  duration?: 5 | 10;
  ratio?: "1280:720" | "720:1280";
}): Promise<{ taskId: string; status: string }> {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error("Runway non configuré");

  const body = {
    promptText: params.promptText,
    duration: params.duration ?? 5,
    ratio: params.ratio ?? "1280:720",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${RUNWAY_API_BASE}/image_to_video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Runway-Version": RUNWAY_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`[Runway] generate failed ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = (await res.json()) as { id?: string; status?: string };
    const taskId = data?.id;
    if (!taskId) throw new Error("[Runway] No task id in response");

    return { taskId, status: data?.status ?? "PENDING" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runwayGetTask(taskId: string): Promise<{
  status: string;
  videoUrl?: string;
  error?: string;
}> {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error("Runway non configuré");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": RUNWAY_VERSION,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `[Runway] task status failed ${res.status}: ${errBody.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as {
      status?: string;
      output?: string[];
      failure?: string;
    };

    return {
      status: data?.status ?? "unknown",
      videoUrl: data?.output?.[0],
      error: data?.failure,
    };
  } finally {
    clearTimeout(timeout);
  }
}
