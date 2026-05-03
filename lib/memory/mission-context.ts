/**
 * Mission Memory (vague 9) — assemble le contexte d'une mission long-terme et
 * met à jour son `context_summary` après chaque run.
 *
 * Trois fonctions exposées :
 *  - getMissionContext()  → lit summary + 10 derniers messages + retrieval
 *                           pgvector scoped sur la mission + KG global. Sert
 *                           à pré-charger le prompt avant un run.
 *  - updateMissionContextSummary() → post-run, génère un résumé éditorial
 *                           (Claude Haiku 4.5, 4 sections) et persiste dans
 *                           `actions.contextSummary` du record mission.
 *  - appendMissionMessage() → INSERT dans `mission_messages` (table créée
 *                           par migration 0056). Append-only, durable, multi-
 *                           device.
 *
 * Principe : zéro duplication. On compose les helpers existants (getSummary,
 * searchEmbeddings, getKgContextForUser, ingestConversationTurn) ; on
 * n'introduit pas un système mémoire parallèle.
 *
 * Fail-soft sur tout : si Supabase ou Anthropic indisponible, on retourne un
 * contexte partiel, jamais d'erreur upstream — la mission peut toujours
 * tourner sans mémoire.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { searchEmbeddings } from "@/lib/embeddings/store";
import { formatRetrievedItems } from "./retrieval-context";
import { getKgContextForUser } from "./kg-context";
import { updateScheduledMission } from "@/lib/engine/runtime/state/adapter";
import { MISSION_CONTEXT_FEWSHOT_FR, formatFewShotBlock } from "@/lib/prompts/examples";
import { composeEditorialPrompt } from "@/lib/editorial/charter";

// ── Types ────────────────────────────────────────────────────

export interface MissionMessage {
  id: string;
  missionId: string;
  userId: string;
  tenantId: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  runId: string | null;
  createdAt: number;
  metadata: Record<string, unknown>;
}

export interface MissionContext {
  /** Last context_summary persisté (null au premier run). */
  summary: string | null;
  /** Timestamp epoch ms de la dernière update du summary. */
  summaryUpdatedAt: number | null;
  /** 10 derniers messages mission, ORDER BY created_at ASC pour affichage chrono. */
  recentMessages: MissionMessage[];
  /** Bloc retrieval pgvector formaté (peut être vide). */
  retrievedMemory: string;
  /** Snippet KG global du user (peut être null si vide). */
  kgSnippet: string | null;
  /** Timestamp d'assemblage. */
  generatedAt: number;
}

// ── Prompt summary ───────────────────────────────────────────

/**
 * Prompt « archiviste de mission ». Garde 4 sections strictes pour éviter
 * la dérive run-after-run. Chaque update reçoit le previousSummary pour
 * que Claude ré-écrive plutôt que d'append (évite le creep). Le ton et
 * les bannis sont chargés via la charte éditoriale unifiée.
 */
export const MISSION_CONTEXT_SYSTEM_PROMPT = composeEditorialPrompt([
  "Tu es l'archiviste d'une mission longue durée. Tu maintiens un résumé éditorial actualisé qui sera relu au prochain run.",
  "",
  "FORMAT STRICT (4 sections, dans cet ordre, en markdown) :",
  "1. **Objectif.** Une phrase qui rappelle pourquoi cette mission existe.",
  "2. **État actuel.** 1-2 phrases qui décrivent où on en est après le dernier run.",
  "3. **Décisions actées.** Bullet ou phrase qui consigne les décisions stables (ne pas re-débattre).",
  "4. **Prochaine étape.** Une recommandation concrète, datée si possible.",
  "",
  "CONTRAINTES SPÉCIFIQUES :",
  "- Max 250 mots au total.",
  "- Tu RÉ-ÉCRIS le résumé entier, tu n'appendes pas. Le previousSummary est ta base, pas un préfixe à conserver.",
  "",
  "EXEMPLES :",
  formatFewShotBlock(MISSION_CONTEXT_FEWSHOT_FR),
].join("\n"));

// ── Supabase queries ─────────────────────────────────────────

interface MissionMessageRow {
  id: string;
  mission_id: string;
  user_id: string;
  tenant_id: string | null;
  role: string;
  content: string;
  run_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

function rowToMessage(row: MissionMessageRow): MissionMessage {
  const role: MissionMessage["role"] =
    row.role === "user" || row.role === "assistant" || row.role === "system"
      ? row.role
      : "user";
  return {
    id: row.id,
    missionId: row.mission_id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    role,
    content: row.content,
    runId: row.run_id,
    createdAt: new Date(row.created_at).getTime(),
    metadata: row.metadata ?? {},
  };
}

/**
 * Liste les N derniers messages d'une mission. ASC par created_at pour
 * affichage chronologique côté UI.
 */
export async function listMissionMessages(opts: {
  missionId: string;
  userId: string;
  limit?: number;
  /** Si fourni, retourne uniquement les messages créés AVANT cette date (ISO). */
  before?: string;
}): Promise<MissionMessage[]> {
  const sb = getServerSupabase();
  if (!sb) return [];

  const limit = Math.max(1, Math.min(opts.limit ?? 20, 200));
  try {
    const query = (sb as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              order: (c: string, opts: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
                lt: (c: string, v: string) => {
                  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          };
        };
      };
    })
      .from("mission_messages")
      .select("id, mission_id, user_id, tenant_id, role, content, run_id, created_at, metadata")
      .eq("mission_id", opts.missionId)
      .eq("user_id", opts.userId)
      .order("created_at", { ascending: false });

    const result = opts.before
      ? await query.lt("created_at", opts.before).limit(limit)
      : await query.limit(limit);

    if (result.error) {
      console.warn(
        "[mission-context] listMissionMessages error:",
        (result.error as { message?: string }).message ?? result.error,
      );
      return [];
    }

    const rows = (result.data as MissionMessageRow[] | null) ?? [];
    // On a SELECT desc pour récupérer les N PLUS RÉCENTS, mais on retourne
    // ASC pour l'UI (chronologique).
    return rows.map(rowToMessage).reverse();
  } catch (err) {
    console.warn("[mission-context] listMissionMessages exception:", err);
    return [];
  }
}

/**
 * Append un message dans la mission. Idempotent par INSERT (pas d'UPSERT
 * volontaire — chaque message est unique).
 */
export async function appendMissionMessage(opts: {
  missionId: string;
  userId: string;
  tenantId?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  runId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<MissionMessage | null> {
  const sb = getServerSupabase();
  if (!sb) {
    console.warn("[mission-context] Supabase indisponible — message non persisté");
    return null;
  }

  const trimmed = opts.content.trim();
  if (!trimmed) return null;

  try {
    const { data, error } = await (sb as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => {
          select: () => {
            single: () => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    })
      .from("mission_messages")
      .insert({
        mission_id: opts.missionId,
        user_id: opts.userId,
        tenant_id: opts.tenantId ?? null,
        role: opts.role,
        content: trimmed,
        run_id: opts.runId ?? null,
        metadata: opts.metadata ?? {},
      })
      .select()
      .single();

    if (error) {
      console.warn(
        "[mission-context] appendMissionMessage error:",
        (error as { message?: string }).message ?? error,
      );
      return null;
    }

    return rowToMessage(data as MissionMessageRow);
  } catch (err) {
    console.warn("[mission-context] appendMissionMessage exception:", err);
    return null;
  }
}

// ── getMissionContext ────────────────────────────────────────

export async function getMissionContext(opts: {
  missionId: string;
  userId: string;
  tenantId: string;
  /** Texte de la mission (pour query embeddings pertinents). */
  missionInput: string;
  /** Override pour tests : court-circuite la lecture mission persistée. */
  preloadedSummary?: string | null;
  preloadedSummaryUpdatedAt?: number | null;
  /** Cap sur le nb de messages remontés (default 10). */
  messagesLimit?: number;
}): Promise<MissionContext> {
  const messagesLimit = opts.messagesLimit ?? 10;

  // 1) Summary : soit fourni en preload (run/route.ts l'a déjà chargé),
  //    soit lu via getScheduledMissions. On évite un round-trip si possible.
  let summary: string | null = opts.preloadedSummary ?? null;
  let summaryUpdatedAt: number | null = opts.preloadedSummaryUpdatedAt ?? null;

  if (summary === null && opts.preloadedSummary === undefined) {
    try {
      const { getScheduledMissions } = await import("@/lib/engine/runtime/state/adapter");
      const persisted = await getScheduledMissions({ userId: opts.userId });
      const found = persisted.find((m) => m.id === opts.missionId);
      if (found) {
        summary = found.contextSummary ?? null;
        summaryUpdatedAt = found.contextSummaryUpdatedAt ?? null;
      }
    } catch (err) {
      console.warn("[mission-context] getMissionContext summary load failed:", err);
    }
  }

  // 2) 3) 4) Lance les 3 sources mémoire en parallèle, fail-soft chacune.
  const [recentMessages, retrievedMemory, kgSnippet] = await Promise.all([
    listMissionMessages({
      missionId: opts.missionId,
      userId: opts.userId,
      limit: messagesLimit,
    }).catch(() => [] as MissionMessage[]),
    searchEmbeddings({
      userId: opts.userId,
      tenantId: opts.tenantId,
      queryText: opts.missionInput,
      k: 5,
    })
      .then(formatRetrievedItems)
      .catch(() => ""),
    getKgContextForUser(opts.userId, opts.tenantId).catch(() => null),
  ]);

  return {
    summary,
    summaryUpdatedAt,
    recentMessages,
    retrievedMemory,
    kgSnippet,
    generatedAt: Date.now(),
  };
}

// ── Format pour injection prompt ─────────────────────────────

/**
 * Sérialise un MissionContext en bloc XML <mission_context> injectable dans
 * le system prompt, AVANT la zone retrieved_memory pour rester dans la zone
 * cacheable Anthropic.
 *
 * Retourne string vide si aucune section n'a de contenu (rien à injecter).
 */
export function formatMissionContextBlock(ctx: MissionContext): string {
  const sections: string[] = [];

  if (ctx.summary && ctx.summary.trim().length > 0) {
    sections.push(`[Résumé de mission]\n${ctx.summary.trim()}`);
  }

  if (ctx.recentMessages.length > 0) {
    const lines = ctx.recentMessages.map((m) => {
      const who =
        m.role === "user"
          ? "Utilisateur"
          : m.role === "assistant"
            ? "Assistant"
            : "Système";
      // Cap chaque message à 240 chars pour éviter de saturer le prompt
      const text = m.content.length > 240 ? `${m.content.slice(0, 239)}…` : m.content;
      return `- ${who}: ${text}`;
    });
    sections.push(`[Notes récentes (chronologique)]\n${lines.join("\n")}`);
  }

  if (sections.length === 0) return "";

  return ["<mission_context>", ...sections, "</mission_context>"].join("\n");
}

// ── updateMissionContextSummary ──────────────────────────────

interface UpdateSummaryOpts {
  missionId: string;
  userId: string;
  tenantId: string;
  /** Texte canonique de la mission (le `mission.input`). */
  missionInput: string;
  /** Last summary persisté (peut être null au premier run). */
  previousSummary: string | null;
  /** Résultat du run qu'on vient de finir. */
  runResult: {
    runId: string;
    status: string;
    finalText?: string | null;
    outputs?: unknown;
    error?: string | null;
  };
}

export async function updateMissionContextSummary(opts: UpdateSummaryOpts): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[mission-context] ANTHROPIC_API_KEY absent — summary non régénéré");
    return;
  }

  const userMsg = [
    `Mission : « ${opts.missionInput} »`,
    "",
    "Résumé précédent :",
    opts.previousSummary && opts.previousSummary.trim().length > 0
      ? opts.previousSummary.trim()
      : "(aucun — premier run)",
    "",
    `Dernier run (${opts.runResult.runId}) :`,
    `Statut : ${opts.runResult.status}`,
    opts.runResult.error ? `Erreur : ${opts.runResult.error}` : "",
    opts.runResult.finalText && opts.runResult.finalText.trim().length > 0
      ? `Résultat :\n${opts.runResult.finalText.trim().slice(0, 3000)}`
      : "Résultat : (aucun texte exploitable retourné)",
    "",
    "Génère le résumé actualisé maintenant, en respectant strictement le format 4 sections.",
  ]
    .filter((l) => l !== "")
    .join("\n");

  let nextSummary: string | null = null;
  try {
    const anthropic = new Anthropic({ apiKey });
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: MISSION_CONTEXT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    });
    const block = res.content[0];
    nextSummary = block?.type === "text" ? block.text.trim() : null;
  } catch (err) {
    console.warn("[mission-context] updateMissionContextSummary LLM échouée:", err);
    return;
  }

  if (!nextSummary || nextSummary.length === 0) return;

  // Persiste — fail-soft (updateScheduledMission gère ses propres erreurs).
  await updateScheduledMission(opts.missionId, {
    contextSummary: nextSummary,
    contextSummaryUpdatedAt: Date.now(),
  });
}
