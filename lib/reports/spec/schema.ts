/**
 * ReportSpec — format pivot déclaratif du système de reports cross-app.
 *
 * Un ReportSpec décrit, de bout en bout, comment un report est composé :
 *   sources[]    → quelles données fetcher (Composio, Google natif, HTTP, asset)
 *   transforms[] → DAG d'opérations déterministes (filter, join, groupBy, …)
 *   blocks[]     → composants graphiques à afficher + layout
 *   narration?   → un appel LLM final qui commente les agrégats
 *
 * Le LLM ne fait que deux choses : générer un Spec valide (via tool
 * Zod-constrained), et écrire la narration finale. Tout le reste — fetch,
 * agrégation, rendu — est déterministe.
 *
 * Stocké comme asset (kind="report") avec provenance.specId pour les renders.
 *
 * Voir le plan : /Users/adrienbeyondcrypto/.claude/plans/tr-s-bien-continue-reactive-pond.md
 */

import { z } from "zod";

// ── Énumérations métier ─────────────────────────────────────

/**
 * Domaines fonctionnels reconnus. Aligne avec lib/capabilities/taxonomy.ts pour
 * que l'intent detector puisse router vers le bon catalogue.
 */
export const REPORT_DOMAINS = [
  "finance",
  "crm",
  "ops",
  "growth",
  "founder",
  "ops-eng",
  "support",
  "mixed",
] as const;
export type ReportDomain = (typeof REPORT_DOMAINS)[number];

/**
 * Profil d'utilisateur ciblé. Influence la narration et le ton.
 */
export const REPORT_PERSONAS = [
  "founder",
  "csm",
  "ops",
  "sales",
  "eng",
] as const;
export type ReportPersona = (typeof REPORT_PERSONAS)[number];

export const REPORT_CADENCES = [
  "ad-hoc",
  "daily",
  "weekly",
  "monthly",
  "event",
] as const;
export type ReportCadence = (typeof REPORT_CADENCES)[number];

export const REPORT_CONFIDENTIALITY = ["internal", "shared"] as const;
export type ReportConfidentiality = (typeof REPORT_CONFIDENTIALITY)[number];

// ── Sources ─────────────────────────────────────────────────

/**
 * Action Composio nommée explicitement (slug action toolkit ex. STRIPE_LIST_CHARGES).
 * Les paramètres de l'action sont passés tels quels à executeComposioAction.
 */
const composioSourceSpecSchema = z.object({
  action: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
  paginate: z
    .object({
      mode: z.enum(["cursor", "page", "none"]).default("none"),
      maxPages: z.number().int().min(1).max(100).default(10),
    })
    .optional(),
});

/**
 * Source Google natif (gmail/calendar/drive). On délègue à lib/connectors/google.
 */
const nativeGoogleSourceSpecSchema = z.object({
  service: z.enum(["gmail", "calendar", "drive"]),
  op: z.string().min(1), // ex. "threads.list", "events.list", "files.search"
  params: z.record(z.string(), z.unknown()).default({}),
});

const httpSourceSpecSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("GET"),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
});

/**
 * Pull un asset existant du thread comme dataset (CSV/JSON → Tabular).
 */
const assetSourceSpecSchema = z.object({
  assetId: z.string().uuid(),
  format: z.enum(["json", "csv"]).default("json"),
});

/**
 * Source dans un Spec. Le kind est un discriminant sur spec.
 *
 * id : identifiant local au Spec, référencé par les transforms/blocks.
 * mapping : optionnel — projection de RawShape vers CanonicalShape (Tier 2).
 *           Liste de paires { from, to } appliquée après le fetch.
 */
export const sourceRefSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "id de source : minuscules, chiffres, underscore (commence par une lettre)",
      ),
    label: z.string().max(80).optional(),
    mapping: z
      .array(
        z.object({
          from: z.string().min(1),
          to: z.string().min(1),
        }),
      )
      .optional(),
  })
  .and(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("composio"), spec: composioSourceSpecSchema }),
      z.object({
        kind: z.literal("native_google"),
        spec: nativeGoogleSourceSpecSchema,
      }),
      z.object({ kind: z.literal("http"), spec: httpSourceSpecSchema }),
      z.object({ kind: z.literal("asset"), spec: assetSourceSpecSchema }),
    ]),
  );
export type SourceRef = z.infer<typeof sourceRefSchema>;
export type SourceKind = SourceRef extends { kind: infer K } ? K : never;

// ── Transforms (DAG déterministe) ───────────────────────────

/**
 * Référence à un dataset amont — soit l'id d'une source, soit l'id d'un autre
 * transform. Le runtime détecte automatiquement la nature au runtime, mais
 * ils partagent le même espace de noms : un id source ne peut pas porter le
 * même nom qu'un id transform.
 */
const datasetRefSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const filterOpSchema = z.object({
  op: z.literal("filter"),
  inputs: z.tuple([datasetRefSchema]),
  params: z.object({
    /** Expression simple "field op value" — voir tabular.ts whitelist. */
    where: z.string().min(1),
  }),
});

const joinOpSchema = z.object({
  op: z.literal("join"),
  inputs: z.tuple([datasetRefSchema, datasetRefSchema]),
  params: z.object({
    on: z.array(
      z.object({ left: z.string(), right: z.string() }),
    ).min(1),
    how: z.enum(["inner", "left"]).default("inner"),
  }),
});

const groupByOpSchema = z.object({
  op: z.literal("groupBy"),
  inputs: z.tuple([datasetRefSchema]),
  params: z.object({
    by: z.array(z.string().min(1)).min(1),
    measures: z
      .array(
        z.object({
          name: z.string().min(1),
          fn: z.enum([
            "count",
            "sum",
            "avg",
            "min",
            "max",
            "median",
            "p95",
            "first",
            "last",
          ]),
          field: z.string().optional(), // requis sauf pour count
        }),
      )
      .min(1),
  }),
});

const windowOpSchema = z.object({
  op: z.literal("window"),
  inputs: z.tuple([datasetRefSchema]),
  params: z.object({
    /** Range temporel relatif. Ex: "30d", "12w", "6m". */
    range: z
      .string()
      .regex(/^\d+(d|w|m|y)$/, "format attendu: <nombre><d|w|m|y>"),
    field: z.string().min(1).default("created_at"),
  }),
});

const diffOpSchema = z.object({
  op: z.literal("diff"),
  inputs: z.tuple([datasetRefSchema]),
  params: z.object({
    /** Champ scalaire à comparer entre deux fenêtres. */
    field: z.string().min(1),
    window: z
      .string()
      .regex(/^\d+(d|w|m|y)$/),
  }),
});

const rankOpSchema = z.object({
  op: z.literal("rank"),
  inputs: z.tuple([datasetRefSchema]),
  params: z.object({
    by: z.string().min(1),
    direction: z.enum(["asc", "desc"]).default("desc"),
    limit: z.number().int().min(1).max(1000).default(20),
  }),
});

const deriveOpSchema = z.object({
  op: z.literal("derive"),
  inputs: z.tuple([datasetRefSchema]),
  params: z.object({
    /**
     * Définition de colonnes dérivées avec expressions whitelistées.
     * Voir tabular.ts pour les fonctions autorisées (no eval, no access global).
     */
    columns: z
      .array(
        z.object({
          name: z.string().min(1),
          expr: z.string().min(1),
        }),
      )
      .min(1),
  }),
});

const pivotOpSchema = z.object({
  op: z.literal("pivot"),
  inputs: z.tuple([datasetRefSchema]),
  params: z.object({
    rows: z.array(z.string().min(1)).min(1),
    columns: z.string().min(1),
    values: z.object({
      field: z.string().min(1),
      fn: z.enum(["count", "sum", "avg", "min", "max"]),
    }),
  }),
});

const unionAllOpSchema = z.object({
  op: z.literal("unionAll"),
  inputs: z.array(datasetRefSchema).min(2).max(8),
  params: z.object({}).default({}),
});

const transformOpUnion = z.discriminatedUnion("op", [
  filterOpSchema,
  joinOpSchema,
  groupByOpSchema,
  windowOpSchema,
  diffOpSchema,
  rankOpSchema,
  deriveOpSchema,
  pivotOpSchema,
  unionAllOpSchema,
]);

export const transformOpSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().max(80).optional(),
  })
  .and(transformOpUnion);
export type TransformOp = z.infer<typeof transformOpSchema>;
export type TransformKind = TransformOp extends { op: infer O } ? O : never;

// ── Blocs graphiques ────────────────────────────────────────

export const PRIMITIVE_KINDS = [
  // V1 — implémentés
  "kpi",
  "sparkline",
  "bar",
  "table",
  "funnel",
  // V2 — réservés
  "waterfall",
  "cohort_triangle",
  "heatmap",
  "sankey",
  "bullet",
  // V3 — réservés
  "network",
  "treemap",
  "box_violin",
  "geo",
  "pareto",
  "monte_carlo",
  "gantt",
  "radar",
  "calendar_heatmap",
  "control_chart",
] as const;
export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];

const blockLayoutSchema = z.object({
  /** Largeur dans la grille 4 colonnes. 1 = quart, 2 = moitié, 4 = pleine. */
  col: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  /** Position verticale logique (0-based). Le rendu fait le wrap automatique. */
  row: z.number().int().min(0).max(50).default(0),
});

export const blockSpecSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/),
  type: z.enum(PRIMITIVE_KINDS),
  label: z.string().max(80).optional(),
  /** Référence le dataset à afficher : id de transform ou de source. */
  dataRef: datasetRefSchema,
  layout: blockLayoutSchema,
  /**
   * Props passés à la primitive. Validés par primitive.propsSchema côté
   * render-blocks.ts. On laisse souple ici pour ne pas dupliquer la spec
   * de chaque primitive dans le pivot.
   */
  props: z.record(z.string(), z.unknown()).default({}),
});
export type BlockSpec = z.infer<typeof blockSpecSchema>;

// ── Narration LLM (one-shot, prompt-cached) ─────────────────

export const narrationSpecSchema = z.object({
  mode: z.enum(["bullets", "intro+bullets"]).default("intro+bullets"),
  /** Où afficher la narration : focal.body (long) ou meta.summary (court). */
  target: z.enum(["focal_body", "summary"]).default("focal_body"),
  maxTokens: z.number().int().min(60).max(1500).default(600),
  /** Style/ton optionnel injecté dans le prompt narration. */
  style: z.enum(["executive", "operational", "candid"]).default("executive"),
});
export type NarrationSpec = z.infer<typeof narrationSpecSchema>;

// ── Refresh & cache ─────────────────────────────────────────

const cronExprSchema = z
  .string()
  .regex(
    /^(\S+\s+){4}\S+$/,
    "cron 5 champs requis (minute heure jour mois jour-semaine)",
  );

export const refreshSpecSchema = z
  .object({
    mode: z.enum(["manual", "scheduled", "webhook", "event"]),
    cron: cronExprSchema.optional(),
    cooldownHours: z.number().int().min(0).max(720).default(0),
    /** Clés de webhook qui invalident le cache (Stripe, Linear, GitHub). */
    invalidateOn: z.array(z.string().min(1)).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "scheduled" && !val.cron) {
      ctx.addIssue({
        code: "custom",
        message: "refresh.cron est requis quand refresh.mode === 'scheduled'",
        path: ["cron"],
      });
    }
  });
export type RefreshSpec = z.infer<typeof refreshSpecSchema>;

export const cacheTTLSchema = z.object({
  /** TTL en secondes. Défauts conservateurs. */
  raw: z.number().int().min(0).max(86_400).default(60),
  transform: z.number().int().min(0).max(86_400).default(600),
  render: z.number().int().min(0).max(86_400).default(3600),
});
export type CacheTTL = z.infer<typeof cacheTTLSchema>;

// ── Scope multi-tenant ──────────────────────────────────────

export const reportScopeSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  userId: z.string().min(1).optional(),
});
export type ReportScope = z.infer<typeof reportScopeSchema>;

// ── Métadonnées ─────────────────────────────────────────────

export const reportMetaSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().max(280).default(""),
  domain: z.enum(REPORT_DOMAINS),
  persona: z.enum(REPORT_PERSONAS),
  cadence: z.enum(REPORT_CADENCES),
  confidentiality: z.enum(REPORT_CONFIDENTIALITY).default("internal"),
});
export type ReportMeta = z.infer<typeof reportMetaSchema>;

// ── ReportSpec — pivot final ────────────────────────────────

const MAX_BLOCKS = 12;
const MAX_TRANSFORMS = 24;
const MAX_SOURCES = 8;

export const reportSpecSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(1).default(1),
    meta: reportMetaSchema,
    scope: reportScopeSchema,
    sources: z.array(sourceRefSchema).min(1).max(MAX_SOURCES),
    transforms: z.array(transformOpSchema).max(MAX_TRANSFORMS).default([]),
    blocks: z.array(blockSpecSchema).min(1).max(MAX_BLOCKS),
    narration: narrationSpecSchema.optional(),
    refresh: refreshSpecSchema,
    cacheTTL: cacheTTLSchema.default({
      raw: 60,
      transform: 600,
      render: 3600,
    }),
    createdAt: z.number().int().min(0),
    updatedAt: z.number().int().min(0),
  })
  .superRefine((spec, ctx) => {
    // Unicité des ids dans l'espace partagé sources + transforms.
    const idsSeen = new Set<string>();
    for (const s of spec.sources) {
      if (idsSeen.has(s.id)) {
        ctx.addIssue({
          code: "custom",
          message: `id source dupliqué: '${s.id}'`,
          path: ["sources"],
        });
      }
      idsSeen.add(s.id);
    }
    for (const t of spec.transforms) {
      if (idsSeen.has(t.id)) {
        ctx.addIssue({
          code: "custom",
          message: `id transform en collision avec source ou autre transform: '${t.id}'`,
          path: ["transforms"],
        });
      }
      idsSeen.add(t.id);
    }

    // Toutes les références d'inputs/dataRef doivent exister.
    const blockIds = new Set<string>();
    for (const t of spec.transforms) {
      for (const inp of t.inputs) {
        if (!idsSeen.has(inp)) {
          ctx.addIssue({
            code: "custom",
            message: `transform '${t.id}' référence un dataset inconnu: '${inp}'`,
            path: ["transforms"],
          });
        }
      }
    }
    for (const b of spec.blocks) {
      if (blockIds.has(b.id)) {
        ctx.addIssue({
          code: "custom",
          message: `id de block dupliqué: '${b.id}'`,
          path: ["blocks"],
        });
      }
      blockIds.add(b.id);
      if (!idsSeen.has(b.dataRef)) {
        ctx.addIssue({
          code: "custom",
          message: `block '${b.id}' référence un dataset inconnu: '${b.dataRef}'`,
          path: ["blocks"],
        });
      }
    }
  });

export type ReportSpec = z.infer<typeof reportSpecSchema>;

// ── Helpers de validation ───────────────────────────────────

export function parseReportSpec(value: unknown): ReportSpec {
  return reportSpecSchema.parse(value);
}

export function safeParseReportSpec(value: unknown):
  | { success: true; data: ReportSpec }
  | { success: false; error: z.ZodError } {
  return reportSpecSchema.safeParse(value);
}
