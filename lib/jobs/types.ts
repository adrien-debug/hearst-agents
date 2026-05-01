/**
 * Job Queue — Types canoniques.
 *
 * Phase B fondations (post-pivot 2026-04-29). Tous les workers Phase B
 * (image-gen, audio-gen, video-gen, document-parse, code-exec,
 * browser-task, meeting-bot, memory-ingest, asset-variant) consomment
 * ces types depuis BullMQ.
 *
 * Une JobPayload est typée par JobKind via un discriminated union pour
 * que le worker destinataire ait des input fields garantis sans cast.
 */

// ── JobKind canonique ───────────────────────────────────────

export type JobKind =
  | "image-gen"
  | "audio-gen"
  | "video-gen"
  | "document-parse"
  | "code-exec"
  | "browser-task"
  | "meeting-bot"
  | "memory-ingest"
  | "asset-variant"
  | "inbox-fetch"
  | "daily-brief";

// ── Payloads par JobKind (discriminated union) ───────────────

export interface JobScopeFields {
  userId: string;
  tenantId: string;
  workspaceId: string;
  /** Asset parent — utilisé par les jobs qui produisent un variant. */
  assetId?: string;
  /** Coût USD estimé pré-job pour Credits guard. Reservé via reserve_credits(). */
  estimatedCostUsd: number;
  /** Si l'output doit streamer vers une conversation SSE. */
  conversationId?: string;
}

export interface ImageGenInput extends JobScopeFields {
  jobKind: "image-gen";
  prompt: string;
  size?: "256x256" | "512x512" | "1024x1024" | "1536x1024" | "1024x1536";
  provider?: "fal" | "openai-image";
  modelHint?: string;
  /** Mode d'enrichissement automatique (suffixes stylistiques + params).
   *  Default = "editorial". Voir `lib/capabilities/providers/fal-prompt-enricher.ts`. */
  style?: "editorial" | "cinematic" | "flat-illustration" | "portrait" | "product";
}

export interface AudioGenInput extends JobScopeFields {
  jobKind: "audio-gen";
  text: string;
  voiceId?: string;
  provider?: "elevenlabs";
  modelId?: string;
  /** Tone de la persona — résout la voix + voice_settings via
   *  `lib/capabilities/providers/elevenlabs-voices.ts`. */
  tone?: string;
  /** ID persona (résolu côté worker pour récupérer le tone si besoin). */
  personaId?: string;
  /** Variant kind à attacher si assetId est défini. */
  variantKind?: "audio";
}

export interface VideoGenInput extends JobScopeFields {
  jobKind: "video-gen";
  prompt: string;
  scriptText?: string;
  voiceId?: string;
  avatarId?: string;
  provider?: "heygen" | "runway";
  durationSeconds?: number;
  variantKind?: "video";
}

export interface DocumentParseInput extends JobScopeFields {
  jobKind: "document-parse";
  fileUrl: string;
  fileName: string;
  mimeType: string;
  provider?: "llamaparse" | "anthropic-files";
}

export interface CodeExecInput extends JobScopeFields {
  jobKind: "code-exec";
  code: string;
  runtime: "python" | "node";
  /** Données CSV/JSON à mettre à dispo dans le sandbox. */
  files?: Array<{ name: string; content: string }>;
  timeoutMs?: number;
}

export interface BrowserTaskInput extends JobScopeFields {
  jobKind: "browser-task";
  task: string;
  startUrl?: string;
  maxSteps?: number;
}

export interface MeetingBotInput extends JobScopeFields {
  jobKind: "meeting-bot";
  meetingUrl: string;
  meetingProvider: "zoom" | "google_meet" | "teams";
  recordingPolicy: "all_participants_consent" | "user_only";
}

export interface MemoryIngestInput extends JobScopeFields {
  jobKind: "memory-ingest";
  content: string;
  contentType: "conversation" | "asset" | "meeting" | "email";
  sourceRef: string;
}

export interface AssetVariantInput extends JobScopeFields {
  jobKind: "asset-variant";
  variantKind: "audio" | "video" | "slides" | "site" | "image";
  /** L'asset source dont on dérive le variant. */
  sourceAssetId: string;
  /** Prompt ou paramètres de transformation. */
  hint?: string;
}

export interface InboxFetchInput extends JobScopeFields {
  jobKind: "inbox-fetch";
  /** Limit côté Gmail unread (défaut 20). */
  gmailLimit?: number;
  /** Limit Calendar today events (défaut 10). */
  calendarLimit?: number;
  /** Cron-triggered ou manual ? Influe sur le throttling 5min. */
  trigger?: "manual" | "cron";
}

/**
 * Daily Brief (vague 9 — Personal CIA Briefing).
 *
 * Worker qui ingère emails 24h + Slack DMs + agenda + GitHub PRs + Linear
 * issues et assemble un PDF éditorial 2 pages, livré comme asset
 * `kind: "daily_brief"`.
 */
export interface DailyBriefInput extends JobScopeFields {
  jobKind: "daily-brief";
  /** Date cible — défaut aujourd'hui. ISO date YYYY-MM-DD. */
  targetDate?: string;
  /** Cron-triggered (matin 7h) ou déclenché manuellement depuis le cockpit. */
  trigger?: "manual" | "cron";
  /** Caps optionnels par source. */
  gmailLimit?: number;
  slackLimit?: number;
  githubLimit?: number;
  linearLimit?: number;
}

export type JobPayload =
  | ImageGenInput
  | AudioGenInput
  | VideoGenInput
  | DocumentParseInput
  | CodeExecInput
  | BrowserTaskInput
  | MeetingBotInput
  | MemoryIngestInput
  | AssetVariantInput
  | InboxFetchInput
  | DailyBriefInput;

// ── Result canonique ─────────────────────────────────────────

export interface JobResult {
  /** Asset créé (si applicable). */
  assetId?: string;
  /** Variant créé (si applicable). */
  variantId?: string;
  /** URL storage du fichier produit. */
  storageUrl?: string;
  /** Coût USD réel — alimente settle_credits(). */
  actualCostUsd: number;
  /** Provider effectivement utilisé (fallback chain). */
  providerUsed: string;
  /** Modèle effectivement utilisé. */
  modelUsed?: string;
  /** Métadonnées libres. */
  metadata?: Record<string, unknown>;
}

// ── Progress events streamés vers le client ──────────────────

export interface JobProgressEvent {
  jobId: string;
  jobKind: JobKind;
  /** 0–100 ; 100 = ready, mais l'event final peut aussi être "failed". */
  progress: number;
  message?: string;
  assetId?: string;
  variantId?: string;
  status?: "pending" | "running" | "ready" | "failed";
}
