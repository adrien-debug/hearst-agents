/**
 * Seed marketplace — quelques templates publics initiaux.
 *
 * Idempotent : on vérifie l'existence par (kind, title, author_user_id).
 * Lancé manuellement (ex. depuis une route d'admin) ou via script — pas
 * d'auto-seed à la migration.
 */

import { getServerSupabase } from "@/lib/platform/db/supabase";
import { dailyStandupTemplate } from "@/lib/workflows/templates/daily-standup";
import { leadNurtureTemplate } from "@/lib/workflows/templates/lead-nurture";
import { publishTemplate } from "./store";
import type { PersonaPayload } from "./types";

const SEED_AUTHOR_USER_ID = "00000000-0000-0000-0000-000000000000";
const SEED_AUTHOR_TENANT_ID = "hearst-builtin";
const SEED_AUTHOR_DISPLAY = "Hearst OS";

interface SeedResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

export async function seedMarketplaceTemplates(): Promise<SeedResult> {
  const sb = getServerSupabase();
  if (!sb) return { inserted: 0, skipped: 0, errors: ["supabase_unavailable"] };

  const seeds: Array<{
    kind: "workflow" | "report_spec" | "persona";
    title: string;
    description: string;
    payload: unknown;
    tags: string[];
  }> = [
    {
      kind: "workflow",
      title: "Daily standup auto",
      description:
        "Cron 9h en semaine → commits GitHub + updates Linear → synthèse → message Slack #standup.",
      payload: dailyStandupTemplate(),
      tags: ["standup", "github", "slack"],
    },
    {
      kind: "workflow",
      title: "Lead nurture warmup",
      description:
        "Webhook → contact HubSpot → branche selon stage → brouillon email → approval → envoi.",
      payload: leadNurtureTemplate(),
      tags: ["sales", "hubspot", "email"],
    },
    {
      kind: "persona",
      title: "Sales rep direct",
      description: "Voix sales : direct, orienté closing, pas d'enrobage.",
      payload: {
        name: "Sales rep direct",
        description: "Voix commerciale franche, orientée closing.",
        tone: "direct",
        vocabulary: {
          preferred: ["proposition", "valeur", "ROI", "deadline", "next step"],
          avoid: ["peut-être", "essayer", "voir ensemble"],
        },
        styleGuide:
          "Phrases courtes. Une proposition concrète par message. Toujours un next step explicite.",
        systemPromptAddon:
          "Tu es un commercial direct. Tu vas droit au but, tu proposes, tu fixes un next step.",
        surface: null,
      } satisfies PersonaPayload,
      tags: ["sales", "voice", "direct"],
    },
  ];

  const out: SeedResult = { inserted: 0, skipped: 0, errors: [] };

  for (const seed of seeds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (sb.from as any)("marketplace_templates")
      .select("id")
      .eq("kind", seed.kind)
      .eq("title", seed.title)
      .eq("author_user_id", SEED_AUTHOR_USER_ID)
      .maybeSingle();

    if (existing) {
      out.skipped += 1;
      continue;
    }

    const created = await publishTemplate({
      kind: seed.kind,
      title: seed.title,
      description: seed.description,
      payload: seed.payload,
      tags: seed.tags,
      authorUserId: SEED_AUTHOR_USER_ID,
      authorTenantId: SEED_AUTHOR_TENANT_ID,
      authorDisplayName: SEED_AUTHOR_DISPLAY,
    });

    if (created) {
      out.inserted += 1;
    } else {
      out.errors.push(`${seed.kind}:${seed.title}`);
    }
  }

  return out;
}
