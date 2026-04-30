/**
 * Recall.ai provider — meeting bots Zoom/Meet/Teams.
 *
 * Le bot rejoint la réunion via `meeting_url`, enregistre + transcrit (via
 * Deepgram embarqué côté Recall) et expose le statut + transcript via API.
 * Les routes /api/v2/meetings/start et /api/v2/meetings/[id] consomment ce
 * provider, ainsi que le worker meeting-bot pour la persistence finale.
 *
 * Sans `RECALL_API_KEY`, chaque fonction throw `RecallAiUnavailableError`
 * — les routes le mappent en 503 propre.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const RECALL_API_BASE =
  process.env.RECALL_API_BASE ?? "https://us-east-1.recall.ai/api/v1";

export class RecallAiUnavailableError extends Error {
  constructor(message = "Recall.ai non configuré (RECALL_API_KEY manquant)") {
    super(message);
    this.name = "RecallAiUnavailableError";
  }
}

export function isRecallAiConfigured(): boolean {
  return Boolean(process.env.RECALL_API_KEY);
}

function getApiKey(): string {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new RecallAiUnavailableError();
  return key;
}

export interface CreateMeetingBotParams {
  meetingUrl: string;
  botName?: string;
  recordingMode?: "speaker_view" | "gallery_view";
  language?: string;
  /** Provider de transcription côté Recall (defaults to Deepgram nova-2). */
  transcriptionProvider?: "deepgram" | "assembly_ai" | "rev";
}

export interface CreateMeetingBotResult {
  botId: string;
  status: string;
  meetingUrl: string;
}

export async function createMeetingBot(
  params: CreateMeetingBotParams,
): Promise<CreateMeetingBotResult> {
  const body = {
    meeting_url: params.meetingUrl,
    bot_name: params.botName ?? "Hearst Assistant",
    recording_config: {
      video_mixed_layout: params.recordingMode ?? "speaker_view",
      transcript: {
        provider: {
          [params.transcriptionProvider ?? "deepgram"]: {
            language: params.language ?? "fr",
          },
        },
      },
    },
  };

  const res = await fetch(`${RECALL_API_BASE}/bot`, {
    method: "POST",
    headers: {
      Authorization: `Token ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`[Recall.ai] createBot failed ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = (await res.json()) as { id: string; status?: string };
  return {
    botId: data.id,
    status: data.status ?? "joining",
    meetingUrl: params.meetingUrl,
  };
}

export interface BotStatus {
  status: string;
  videoUrl?: string;
  transcript?: string;
  recordingId?: string;
  meetingMetadata?: Record<string, unknown>;
}

export async function getBotStatus(botId: string): Promise<BotStatus> {
  const res = await fetch(`${RECALL_API_BASE}/bot/${botId}`, {
    headers: { Authorization: `Token ${getApiKey()}` },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`[Recall.ai] getBotStatus failed ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    status?: string;
    status_changes?: Array<{ code: string; created_at: string }>;
    video_url?: string;
    transcript?: string;
    recording_id?: string;
    meeting_metadata?: Record<string, unknown>;
  };

  const latestStatus =
    data.status ??
    data.status_changes?.[data.status_changes.length - 1]?.code ??
    "unknown";

  return {
    status: latestStatus,
    videoUrl: data.video_url,
    transcript: data.transcript,
    recordingId: data.recording_id,
    meetingMetadata: data.meeting_metadata,
  };
}

export interface TranscriptSegment {
  speaker: string | number;
  text: string;
  start: number;
  end: number;
}

/**
 * Pull le transcript détaillé du bot. Retourne un tableau de segments avec
 * locuteur si dispo. Sur certains plans Recall, le transcript brut est
 * inclus dans `getBotStatus` ; ce helper essaie d'abord l'endpoint dédié et
 * fallback sur le statut bot si 404.
 */
export async function getTranscript(
  botId: string,
): Promise<{ transcript: string; segments: TranscriptSegment[] }> {
  const res = await fetch(`${RECALL_API_BASE}/bot/${botId}/transcript`, {
    headers: { Authorization: `Token ${getApiKey()}` },
  });

  if (res.status === 404) {
    const status = await getBotStatus(botId);
    return { transcript: status.transcript ?? "", segments: [] };
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`[Recall.ai] getTranscript failed ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = (await res.json()) as Array<{
    speaker?: string;
    speaker_id?: number;
    words?: Array<{ text: string; start_timestamp?: number; end_timestamp?: number }>;
  }>;

  const segments: TranscriptSegment[] = data.map((seg) => {
    const text = (seg.words ?? []).map((w) => w.text).join(" ").trim();
    const start = seg.words?.[0]?.start_timestamp ?? 0;
    const end = seg.words?.[seg.words.length - 1]?.end_timestamp ?? start;
    return {
      speaker: seg.speaker ?? seg.speaker_id ?? "speaker",
      text,
      start,
      end,
    };
  });

  const transcript = segments.map((s) => `[${s.speaker}] ${s.text}`).join("\n");
  return { transcript, segments };
}

/** Demande au bot de quitter la réunion (sans supprimer la ressource). */
export async function stopBot(botId: string): Promise<void> {
  const res = await fetch(`${RECALL_API_BASE}/bot/${botId}/leave_call`, {
    method: "POST",
    headers: { Authorization: `Token ${getApiKey()}` },
  });

  if (!res.ok && res.status !== 404 && res.status !== 405) {
    const txt = await res.text().catch(() => "");
    throw new Error(`[Recall.ai] stopBot failed ${res.status}: ${txt.slice(0, 200)}`);
  }
}

export async function deleteBot(botId: string): Promise<void> {
  const res = await fetch(`${RECALL_API_BASE}/bot/${botId}`, {
    method: "DELETE",
    headers: { Authorization: `Token ${getApiKey()}` },
  });

  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(() => "");
    throw new Error(`[Recall.ai] deleteBot failed ${res.status}: ${txt.slice(0, 200)}`);
  }
}

/**
 * Reasons retournées par verifyWebhookSignature. La route consomme
 * ces codes pour différencier dev (no_secret accepté) vs prod (no_secret refusé).
 */
export type WebhookVerifyReason =
  | "valid"
  | "no_secret"
  | "signature_missing"
  | "length_mismatch"
  | "signature_mismatch"
  | "compare_failed";

/**
 * Vérifie une signature de webhook Recall.ai (header `x-recall-signature`).
 * Recall signe `timestamp.body` avec `RECALL_WEBHOOK_SECRET`.
 *
 * Retourne `{ valid: false, reason: "no_secret" }` si le secret manque —
 * la route appelle ce comportement et tranche selon NODE_ENV (accepte
 * en dev avec warn, refuse en prod avec 503).
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  signature: string | null | undefined;
  timestamp?: string | null;
}): { valid: boolean; reason: WebhookVerifyReason } {
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (!secret) {
    return { valid: false, reason: "no_secret" };
  }
  if (!params.signature) {
    return { valid: false, reason: "signature_missing" };
  }

  const payload = params.timestamp
    ? `${params.timestamp}.${params.rawBody}`
    : params.rawBody;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(params.signature);
    if (a.length !== b.length) return { valid: false, reason: "length_mismatch" };
    const ok = timingSafeEqual(a, b);
    return ok
      ? { valid: true, reason: "valid" }
      : { valid: false, reason: "signature_mismatch" };
  } catch {
    return { valid: false, reason: "compare_failed" };
  }
}

/** Détecte le provider de meeting depuis l'URL pour télémétrie / UI. */
export function detectMeetingProvider(
  url: string,
): "zoom" | "google_meet" | "teams" | "unknown" {
  const u = url.toLowerCase();
  if (u.includes("zoom.us") || u.includes("zoom.com")) return "zoom";
  if (u.includes("meet.google.com")) return "google_meet";
  if (u.includes("teams.microsoft.com") || u.includes("teams.live.com")) return "teams";
  return "unknown";
}

/** Validation legère côté API : URL parsable et provider connu. */
export function validateMeetingUrl(
  url: string,
): { ok: true } | { ok: false; reason: string } {
  if (!url || url.trim().length === 0) {
    return { ok: false, reason: "empty" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "invalid_protocol" };
  }
  const provider = detectMeetingProvider(url);
  if (provider === "unknown") {
    return { ok: false, reason: "unsupported_provider" };
  }
  return { ok: true };
}
