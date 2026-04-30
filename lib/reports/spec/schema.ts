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
  // Kuala — nouveaux domaines métier
  "people",
  "marketing",
] as const;
export type ReportDomain = (typeof REPORT_DOMAINS)[number];

/**
 * Profil d'utilisateur ciblé. Influence la narration et le ton.
 *
 * Backward-compatible : "eng" est maintenu pour les specs existants.
 * "engineering" est l'alias canonique pour les nouveaux catalogues.
 */
export const REPORT_PERSONAS = [
  "founder",
  "csm",
  "ops",
  "sales",
  "eng",
  // Kuala — nouveaux personas métier
  "engineering",
  "marketing",
  "people",
  "finance",
  "product",
  "support",
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
    /** `by: []` est valide → produit une row unique avec les agrégats globaux. */
    by: z.array(z.string().min(1)),
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

// ── Schémas de props par primitive (V2) ─────────────────────
//
// Ces schémas valident le contenu de `block.props` quand un block utilise une
// primitive V2 dont la donnée n'est pas une Tabular linéaire mais une
// structure spécifique (waterfall barres, cohort triangle, heatmap matrice).
// Ils sont exposés pour permettre à la UI/runtime de valider les props avant
// rendu, et à de futurs catalogues de produire des Specs typés.
//
// Le `block.dataRef` reste la source de vérité quand le runtime calcule la
// donnée via les transforms ; `block.props.<champ>` est le fallback quand la
// donnée est livrée inline (cas LLM-only sans transform).

export const waterfallDatumSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.number().finite(),
  type: z.enum(["start", "delta", "total"]),
});
export type WaterfallDatum = z.infer<typeof waterfallDatumSchema>;

export const waterfallPropsSchema = z.object({
  data: z.array(waterfallDatumSchema).min(2).max(20),
  format: z.enum(["number", "currency"]).default("currency"),
  currency: z.string().min(1).max(8).default("EUR"),
  height: z.number().int().min(80).max(800).optional(),
});
export type WaterfallPropsSpec = z.infer<typeof waterfallPropsSchema>;

export const cohortRowSchema = z.object({
  label: z.string().min(1).max(40),
  values: z.array(z.number().finite()).min(1).max(60),
});
export type CohortRowSpec = z.infer<typeof cohortRowSchema>;

export const cohortTrianglePropsSchema = z.object({
  cohorts: z.array(cohortRowSchema).min(1).max(60),
  periodPrefix: z.string().min(1).max(8).default("M"),
  asPercent: z.boolean().default(true),
});
export type CohortTrianglePropsSpec = z.infer<typeof cohortTrianglePropsSchema>;

export const heatmapPropsSchema = z
  .object({
    xLabels: z.array(z.string().min(1)).min(1).max(60),
    yLabels: z.array(z.string().min(1)).min(1).max(60),
    values: z.array(z.array(z.number().finite())).min(1).max(60),
    cellHeight: z.number().int().min(8).max(80).optional(),
    showValues: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    // values doit avoir une row par yLabel et chaque row une cellule par xLabel.
    if (val.values.length !== val.yLabels.length) {
      ctx.addIssue({
        code: "custom",
        message: `heatmap.values.length (${val.values.length}) doit égaler yLabels.length (${val.yLabels.length})`,
        path: ["values"],
      });
    }
    val.values.forEach((row, i) => {
      if (row.length !== val.xLabels.length) {
        ctx.addIssue({
          code: "custom",
          message: `heatmap.values[${i}].length (${row.length}) doit égaler xLabels.length (${val.xLabels.length})`,
          path: ["values", i],
        });
      }
    });
  });
export type HeatmapPropsSpec = z.infer<typeof heatmapPropsSchema>;

// ── Sankey ──────────────────────────────────────────────────

export const sankeyNodeSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/, "id node : minuscules, chiffres, underscore"),
  label: z.string().min(1).max(80),
});
export type SankeyNodeSpec = z.infer<typeof sankeyNodeSchema>;

export const sankeyLinkSchema = z.object({
  source: z.string().min(1).max(80),
  target: z.string().min(1).max(80),
  value: z.number().finite().min(0),
});
export type SankeyLinkSpec = z.infer<typeof sankeyLinkSchema>;

export const sankeyPropsSchema = z
  .object({
    nodes: z.array(sankeyNodeSchema).min(2).max(60),
    links: z.array(sankeyLinkSchema).min(1).max(200),
    height: z.number().int().min(80).max(800).optional(),
  })
  .superRefine((val, ctx) => {
    // Unicité des ids node + chaque link.source/target doit référencer un node.
    const ids = new Set<string>();
    for (const n of val.nodes) {
      if (ids.has(n.id)) {
        ctx.addIssue({
          code: "custom",
          message: `sankey.nodes : id dupliqué '${n.id}'`,
          path: ["nodes"],
        });
      }
      ids.add(n.id);
    }
    val.links.forEach((l, i) => {
      if (!ids.has(l.source)) {
        ctx.addIssue({
          code: "custom",
          message: `sankey.links[${i}].source '${l.source}' ne référence aucun node`,
          path: ["links", i, "source"],
        });
      }
      if (!ids.has(l.target)) {
        ctx.addIssue({
          code: "custom",
          message: `sankey.links[${i}].target '${l.target}' ne référence aucun node`,
          path: ["links", i, "target"],
        });
      }
      if (l.source === l.target) {
        ctx.addIssue({
          code: "custom",
          message: `sankey.links[${i}] : source et target identiques ('${l.source}')`,
          path: ["links", i],
        });
      }
    });
  });
export type SankeyPropsSpec = z.infer<typeof sankeyPropsSchema>;

// ── Bullet ──────────────────────────────────────────────────

export const bulletRangeSchema = z.object({
  bad: z.number().finite(),
  ok: z.number().finite(),
  good: z.number().finite(),
});
export type BulletRangeSpec = z.infer<typeof bulletRangeSchema>;

export const bulletItemSchema = z.object({
  label: z.string().min(1).max(80),
  actual: z.number().finite(),
  target: z.number().finite(),
  ranges: bulletRangeSchema,
});
export type BulletItemSpec = z.infer<typeof bulletItemSchema>;

export const bulletPropsSchema = z.object({
  items: z.array(bulletItemSchema).min(1).max(20),
  format: z.enum(["number", "currency"]).default("number"),
  currency: z.string().min(1).max(8).default("EUR"),
});
export type BulletPropsSpec = z.infer<typeof bulletPropsSchema>;

// ── Radar ───────────────────────────────────────────────────

export const radarSeriesSchema = z.object({
  label: z.string().min(1).max(80),
  values: z.array(z.number().finite()).min(1).max(20),
});
export type RadarSeriesSpec = z.infer<typeof radarSeriesSchema>;

export const radarPropsSchema = z
  .object({
    axes: z.array(z.string().min(1).max(40)).min(3).max(20),
    series: z.array(radarSeriesSchema).min(1).max(8),
    height: z.number().int().min(120).max(800).optional(),
    rings: z.number().int().min(1).max(10).optional(),
  })
  .superRefine((val, ctx) => {
    // Chaque série doit avoir autant de values que d'axes.
    val.series.forEach((s, i) => {
      if (s.values.length !== val.axes.length) {
        ctx.addIssue({
          code: "custom",
          message: `radar.series[${i}].values.length (${s.values.length}) doit égaler axes.length (${val.axes.length})`,
          path: ["series", i, "values"],
        });
      }
    });
  });
export type RadarPropsSpec = z.infer<typeof radarPropsSchema>;

// ── Gantt ───────────────────────────────────────────────────

const isoDateSchema = z
  .string()
  .min(1)
  .refine((s) => Number.isFinite(Date.parse(s)), {
    message: "ISODate invalide (attendu YYYY-MM-DD ou ISO complet)",
  });

export const ganttRangeSchema = z.object({
  start: isoDateSchema,
  end: isoDateSchema,
});
export type GanttRangeSpec = z.infer<typeof ganttRangeSchema>;

export const ganttTaskSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/, "id task : minuscules, chiffres, underscore"),
  label: z.string().min(1).max(120),
  start: isoDateSchema,
  end: isoDateSchema,
  progress: z.number().finite().min(0).max(1),
  dependsOn: z.array(z.string().min(1).max(80)).optional(),
});
export type GanttTaskSpec = z.infer<typeof ganttTaskSchema>;

export const ganttPropsSchema = z
  .object({
    range: ganttRangeSchema,
    tasks: z.array(ganttTaskSchema).min(0).max(60),
    height: z.number().int().min(80).max(1200).optional(),
  })
  .superRefine((val, ctx) => {
    const rangeStart = Date.parse(val.range.start);
    const rangeEnd = Date.parse(val.range.end);
    if (Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) && rangeEnd <= rangeStart) {
      ctx.addIssue({
        code: "custom",
        message: `gantt.range.end (${val.range.end}) doit être strictement après range.start (${val.range.start})`,
        path: ["range"],
      });
    }
    const ids = new Set<string>();
    val.tasks.forEach((t, i) => {
      if (ids.has(t.id)) {
        ctx.addIssue({
          code: "custom",
          message: `gantt.tasks : id dupliqué '${t.id}'`,
          path: ["tasks", i, "id"],
        });
      }
      ids.add(t.id);
    });
    val.tasks.forEach((t, i) => {
      const ts = Date.parse(t.start);
      const te = Date.parse(t.end);
      if (Number.isFinite(ts) && Number.isFinite(te) && te <= ts) {
        ctx.addIssue({
          code: "custom",
          message: `gantt.tasks[${i}] : end doit être strictement après start`,
          path: ["tasks", i, "end"],
        });
      }
      if (
        Number.isFinite(rangeStart) &&
        Number.isFinite(ts) &&
        ts < rangeStart
      ) {
        ctx.addIssue({
          code: "custom",
          message: `gantt.tasks[${i}].start (${t.start}) hors range.start (${val.range.start})`,
          path: ["tasks", i, "start"],
        });
      }
      if (
        Number.isFinite(rangeEnd) &&
        Number.isFinite(te) &&
        te > rangeEnd
      ) {
        ctx.addIssue({
          code: "custom",
          message: `gantt.tasks[${i}].end (${t.end}) hors range.end (${val.range.end})`,
          path: ["tasks", i, "end"],
        });
      }
      for (const dep of t.dependsOn ?? []) {
        if (!ids.has(dep) && !val.tasks.some((other) => other.id === dep)) {
          ctx.addIssue({
            code: "custom",
            message: `gantt.tasks[${i}].dependsOn : id inconnu '${dep}'`,
            path: ["tasks", i, "dependsOn"],
          });
        }
      }
    });
  });
export type GanttPropsSpec = z.infer<typeof ganttPropsSchema>;

/**
 * Validation des sous-scalaires d'un block KPI.
 *
 * `subScalars` (optionnel) déclare des champs additionnels du dataset à
 * exposer dans `payload.scalars` sous la clé `{blockId}.{name}`. Consommé par
 * les rules signals composites (cf. `lib/reports/signals/extract.ts` —
 * `expense_spike` lit `kpi_expenses.baseline_3m`, `retention_drop` lit
 * `kpi_retention_c2.baseline`, `incident_spike` lit `kpi_incidents.baseline_4w`,
 * etc.).
 *
 * Format : `{ scalarName: sourceField }` — les deux strings non vides,
 * scalarName en snake_case minuscule, sourceField libre (le nom du champ du
 * dataset). Validé en superRefine sur block KPI uniquement.
 */
const kpiSubScalarsSchema = z
  .record(
    z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_]*$/, "subScalars name : minuscules, chiffres, underscore"),
    z.string().min(1),
  )
  .refine((v) => Object.keys(v).length <= 8, {
    message: "subScalars : maximum 8 sous-scalaires par bloc KPI",
  });

export const blockSpecSchema = z
  .object({
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
     *
     * Pour les primitives V2 (waterfall, cohort_triangle, heatmap) dont la
     * donnée structurelle est portée par les props, le `superRefine` plus
     * bas valide que `block.props` matche leur schéma typé.
     *
     * Pour les blocs KPI, `props.subScalars` (optionnel) est validé via
     * `kpiSubScalarsSchema` (voir superRefine plus bas).
     */
    props: z.record(z.string(), z.unknown()).default({}),
    /**
     * Visibilité du block dans le rendu UI. `true` = block masqué (skip render).
     * Utilisé par l'éditeur (ReportEditor.tsx) pour permettre à l'utilisateur
     * de masquer un block sans le supprimer du spec — les transforms et données
     * amont restent calculés, c'est purement UI. Par défaut visible.
     */
    hidden: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    // Validation des sous-scalaires (KPI uniquement).
    if (val.type === "kpi" && val.props && "subScalars" in val.props) {
      const r = kpiSubScalarsSchema.safeParse(val.props.subScalars);
      if (!r.success) {
        ctx.addIssue({
          code: "custom",
          message: `block '${val.id}' (kpi) : props.subScalars invalide — ${r.error.issues[0]?.message ?? "format inattendu"}`,
          path: ["props", "subScalars"],
        });
      }
    }
  })
  .superRefine((val, ctx) => {
    if (val.type === "waterfall") {
      const r = waterfallPropsSchema.safeParse(val.props);
      if (!r.success) {
        ctx.addIssue({
          code: "custom",
          message: `block '${val.id}' (waterfall) : props invalide — ${r.error.issues[0]?.message ?? "format inattendu"}`,
          path: ["props"],
        });
      }
    } else if (val.type === "cohort_triangle") {
      const r = cohortTrianglePropsSchema.safeParse(val.props);
      if (!r.success) {
        ctx.addIssue({
          code: "custom",
          message: `block '${val.id}' (cohort_triangle) : props invalide — ${r.error.issues[0]?.message ?? "format inattendu"}`,
          path: ["props"],
        });
      }
    } else if (val.type === "heatmap") {
      const r = heatmapPropsSchema.safeParse(val.props);
      if (!r.success) {
        ctx.addIssue({
          code: "custom",
          message: `block '${val.id}' (heatmap) : props invalide — ${r.error.issues[0]?.message ?? "format inattendu"}`,
          path: ["props"],
        });
      }
    } else if (val.type === "sankey") {
      const r = sankeyPropsSchema.safeParse(val.props);
      if (!r.success) {
        ctx.addIssue({
          code: "custom",
          message: `block '${val.id}' (sankey) : props invalide — ${r.error.issues[0]?.message ?? "format inattendu"}`,
          path: ["props"],
        });
      }
    } else if (val.type === "bullet") {
      const r = bulletPropsSchema.safeParse(val.props);
      if (!r.success) {
        ctx.addIssue({
          code: "custom",
          message: `block '${val.id}' (bullet) : props invalide — ${r.error.issues[0]?.message ?? "format inattendu"}`,
          path: ["props"],
        });
      }
    } else if (val.type === "radar") {
      const r = radarPropsSchema.safeParse(val.props);
      if (!r.success) {
        ctx.addIssue({
          code: "custom",
          message: `block '${val.id}' (radar) : props invalide — ${r.error.issues[0]?.message ?? "format inattendu"}`,
          path: ["props"],
        });
      }
    } else if (val.type === "gantt") {
      const r = ganttPropsSchema.safeParse(val.props);
      if (!r.success) {
        ctx.addIssue({
          code: "custom",
          message: `block '${val.id}' (gantt) : props invalide — ${r.error.issues[0]?.message ?? "format inattendu"}`,
          path: ["props"],
        });
      }
    }
  });
export type BlockSpec = z.infer<typeof blockSpecSchema>;

// ── Narration LLM (one-shot, prompt-cached) ─────────────────

export const narrationSpecSchema = z.object({
  mode: z.enum(["bullets", "intro+bullets", "editorial"]).default("intro+bullets"),
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
