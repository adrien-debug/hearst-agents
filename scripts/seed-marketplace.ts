/**
 * Seed marketplace — publie 5 templates de référence pour que /marketplace
 * ne soit pas vide en MVP.
 *
 * Templates publiés (idempotents — re-run safe via tag "seed") :
 *  - 2 workflows : hospitality-guest-arrival-prep, hospitality-service-request-dispatch
 *  - 2 report_specs : Hospitality Daily Brief, Hospitality RevPAR
 *  - 1 persona : Hospitality Concierge (depuis BUILTIN_PERSONAS)
 *
 * Usage : `npx tsx scripts/seed-marketplace.ts`
 *
 * L'auteur des templates est un user "system" hardcodé (pas de scope user
 * réel). Les clones par les users reçoivent leur propre scope au moment
 * du clone (cf. lib/marketplace/store.cloneTemplate).
 */

/* eslint-disable no-console */

import { loadEnv } from "./lib/load-env";

loadEnv();

import { publishTemplate, listTemplates } from "@/lib/marketplace/store";
import { guestArrivalPrepTemplate } from "@/lib/workflows/templates/hospitality/guest-arrival-prep";
import { serviceRequestDispatchTemplate } from "@/lib/workflows/templates/hospitality/service-request-dispatch";
import { buildHospitalityDailyBrief } from "@/lib/reports/catalog/hospitality-daily-brief";
import { buildHospitalityRevpar } from "@/lib/reports/catalog/hospitality-revpar";
import { BUILTIN_PERSONAS } from "@/lib/personas/defaults";
import type { PublishTemplateInput, PersonaPayload } from "@/lib/marketplace/types";

const SEED_AUTHOR = {
  authorUserId: "00000000-0000-0000-0000-000000000000",
  authorTenantId: "hearst-system",
  authorDisplayName: "Hearst OS Team",
};

const SEED_TAG = "seed";

interface SeedTemplate {
  kind: "workflow" | "report_spec" | "persona";
  title: string;
  description: string;
  payload: unknown;
  tags: string[];
}

function buildSeedTemplates(): SeedTemplate[] {
  // Persona : extraire les champs autorisés par personaPayloadSchema depuis le builtin
  const hospitalityBuiltin = BUILTIN_PERSONAS.find(
    (p) => p.id === "builtin:hospitality-concierge",
  );
  if (!hospitalityBuiltin) {
    throw new Error("Persona builtin hospitality-concierge introuvable");
  }
  const personaPayload: PersonaPayload = {
    name: hospitalityBuiltin.name,
    description: hospitalityBuiltin.description ?? undefined,
    tone: hospitalityBuiltin.tone,
    vocabulary: hospitalityBuiltin.vocabulary,
    styleGuide: hospitalityBuiltin.styleGuide ?? null,
    systemPromptAddon: hospitalityBuiltin.systemPromptAddon ?? null,
    surface: hospitalityBuiltin.surface ?? null,
  };

  // Report specs : scope dummy (sera remplacé au clone par le scope user)
  const dummyScope = {
    tenantId: SEED_AUTHOR.authorTenantId,
    workspaceId: "seed-workspace",
    userId: SEED_AUTHOR.authorUserId,
  };

  return [
    {
      kind: "workflow",
      title: "Préparation arrivées guests",
      description:
        "Cron 10h → fetch arrivées PMS → filtre VIP → welcome notes Claude → approval → Slack frontdesk",
      payload: guestArrivalPrepTemplate(),
      tags: [SEED_TAG, "hospitality", "ops"],
    },
    {
      kind: "workflow",
      title: "Dispatch service requests",
      description:
        "Webhook service request → classify priority Haiku → branche urgent/normal → Slack alert + PMS update",
      payload: serviceRequestDispatchTemplate(),
      tags: [SEED_TAG, "hospitality", "ops"],
    },
    {
      kind: "report_spec",
      title: "Daily Briefing — Hospitality",
      description:
        "Occupancy, ADR/RevPAR, arrivées/départs du jour + VIP + service requests.",
      payload: buildHospitalityDailyBrief(dummyScope),
      tags: [SEED_TAG, "hospitality", "kpi"],
    },
    {
      kind: "report_spec",
      title: "RevPAR & ADR — Hospitality",
      description: "Performance revenus 30 derniers jours par segment et canal.",
      payload: buildHospitalityRevpar(dummyScope),
      tags: [SEED_TAG, "hospitality", "revenue"],
    },
    {
      kind: "persona",
      title: "Hospitality Concierge",
      description:
        "Concierge digital d'un hôtel haut de gamme — chaleureux, discret, anticipe besoins guests.",
      payload: personaPayload,
      tags: [SEED_TAG, "hospitality", "voice"],
    },
  ];
}

async function isAlreadySeeded(title: string): Promise<boolean> {
  const result = await listTemplates({ q: title, limit: 5 });
  return result.some((t) => t.title === title && t.tags.includes(SEED_TAG));
}

async function main(): Promise<void> {
  console.log("🌱 Hearst OS — Marketplace seed\n");

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquants");
    process.exit(1);
  }

  const templates = buildSeedTemplates();
  let published = 0;
  let skipped = 0;
  let failed = 0;

  for (const tpl of templates) {
    if (await isAlreadySeeded(tpl.title)) {
      console.log(`⊘  ${tpl.title} — déjà publié, skip`);
      skipped++;
      continue;
    }

    const input: PublishTemplateInput = {
      kind: tpl.kind,
      title: tpl.title,
      description: tpl.description,
      payload: tpl.payload,
      tags: tpl.tags,
      authorUserId: SEED_AUTHOR.authorUserId,
      authorTenantId: SEED_AUTHOR.authorTenantId,
      authorDisplayName: SEED_AUTHOR.authorDisplayName,
    };

    const result = await publishTemplate(input);
    if (result) {
      console.log(`✓  ${tpl.title} (${tpl.kind}) → id=${result.id}`);
      published++;
    } else {
      console.error(`✗  ${tpl.title} (${tpl.kind}) — publishTemplate a retourné null`);
      failed++;
    }
  }

  console.log(`\n${published} publiés · ${skipped} skippés · ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
