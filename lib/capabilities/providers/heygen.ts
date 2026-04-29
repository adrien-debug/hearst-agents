const HEYGEN_API_BASE = "https://api.heygen.com/v2";

export async function heygenGenerateVideo(params: {
  scriptText: string;
  avatarId?: string;
  voiceId?: string;
  dimension?: { width: number; height: number };
}): Promise<{ videoId: string; status: "processing" | "completed"; videoUrl?: string }> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error("HeyGen non configuré");

  const dimension = params.dimension ?? { width: 1280, height: 720 };

  const voiceConfig = params.voiceId
    ? { type: "text", input_text: params.scriptText, voice_id: params.voiceId }
    : { type: "text", input_text: params.scriptText };

  const body = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: params.avatarId ?? "default",
          avatar_style: "normal",
        },
        voice: voiceConfig,
        background: { type: "color", value: "#ffffff" },
      },
    ],
    dimension,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${HEYGEN_API_BASE}/video/generate`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`[HeyGen] generate failed ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = (await res.json()) as { data?: { video_id?: string } };
    const videoId = data?.data?.video_id;
    if (!videoId) throw new Error("[HeyGen] No video_id in response");

    return { videoId, status: "processing" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function heygenGetStatus(videoId: string): Promise<{
  status: string;
  videoUrl?: string;
}> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error("HeyGen non configuré");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${HEYGEN_API_BASE}/video/status/${videoId}`, {
      headers: { "X-Api-Key": apiKey },
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`[HeyGen] status failed ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      data?: { status?: string; video_url?: string };
    };

    return {
      status: data?.data?.status ?? "unknown",
      videoUrl: data?.data?.video_url,
    };
  } finally {
    clearTimeout(timeout);
  }
}
