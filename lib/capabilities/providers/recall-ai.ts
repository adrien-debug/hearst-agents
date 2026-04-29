const RECALL_API_BASE = "https://us-east-1.recall.ai/api/v1";

function getApiKey(): string {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new Error("Recall.ai non configuré");
  return key;
}

export async function createMeetingBot(params: {
  meetingUrl: string;
  botName?: string;
  recordingMode?: "speaker_view" | "gallery_view";
}): Promise<{ botId: string; status: string }> {
  const res = await fetch(`${RECALL_API_BASE}/bot`, {
    method: "POST",
    headers: {
      "Authorization": `Token ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meeting_url: params.meetingUrl,
      bot_name: params.botName ?? "Hearst Assistant",
      recording_config: {
        video_mixed_layout: params.recordingMode ?? "speaker_view",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[Recall.ai] createBot failed ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as { id: string; status: string };
  return { botId: data.id, status: data.status };
}

export async function getBotStatus(botId: string): Promise<{
  status: string;
  videoUrl?: string;
  transcript?: string;
}> {
  const res = await fetch(`${RECALL_API_BASE}/bot/${botId}`, {
    headers: { "Authorization": `Token ${getApiKey()}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[Recall.ai] getBotStatus failed ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    status: string;
    video_url?: string;
    transcript?: string;
  };

  return {
    status: data.status,
    videoUrl: data.video_url,
    transcript: data.transcript,
  };
}

export async function deleteBo(botId: string): Promise<void> {
  const res = await fetch(`${RECALL_API_BASE}/bot/${botId}`, {
    method: "DELETE",
    headers: { "Authorization": `Token ${getApiKey()}` },
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`[Recall.ai] deleteBot failed ${res.status}: ${body.slice(0, 200)}`);
  }
}
