/**
 * Few-shot examples library — référence éditoriale partagée pour les prompts critiques.
 *
 * Style : mature, sobre, factuel. Phrases courtes. Vocabulaire premium
 * (anticipation, équilibre, vitalité, tension, signal, levier). Pas de
 * buzzwords, pas de "voici", "n'hésite pas", "j'espère que".
 *
 * Chaque exemple suit le pattern { input, output } pour injection directe
 * dans un prompt sous forme `<example>…</example>`.
 */

export interface FewShotExample {
  readonly input: string;
  readonly output: string;
}

// ── Briefing matinal (founder context) ─────────────────────────

export const BRIEFING_FEWSHOT_FR: ReadonlyArray<FewShotExample> = [
  {
    input: [
      "Activité 24h : 3 emails non lus dont 1 de Sarah (lead Series A) en attente depuis 18h.",
      "Réunion à 10h avec Marc (CFO Acme) pour signature contrat 240k€.",
      "Hier : décision actée de geler le hiring marketing jusqu'à closing.",
    ].join(" "),
    output: [
      "**What happened.** Hier, le hiring marketing a été gelé jusqu'au closing.",
      "",
      "**What matters.**",
      "- Sarah (Series A) attend une réponse depuis 18h. Silence prolongé = signal négatif.",
      "- Marc signe à 10h le contrat Acme (240k€). Préparer l'envoi du DocuSign avant 9h45.",
      "- Décision hiring marketing à reconfirmer en weekly équipe.",
      "",
      "**What's next.** Réponds à Sarah dans l'heure, même brièvement. Le timing pèse plus que la longueur.",
    ].join("\n"),
  },
  {
    input: [
      "Activité 24h : aucun email urgent. 2 réunions internes hier.",
      "Pipeline : 4 deals en negotiation, aucun mouvement depuis 6 jours.",
      "Calendrier aujourd'hui : focus block 9h-12h, pas de meeting.",
    ].join(" "),
    output: [
      "**What happened.** Pipeline gelé : 4 deals en negotiation sans mouvement depuis 6 jours.",
      "",
      "**What matters.**",
      "- Le silence pipeline n'est pas neutre. Vérifier qui relance, et si chaque deal a un next step daté.",
      "- Le focus block 9h-12h est rare. À protéger pour le travail de fond, pas pour rattraper l'inbox.",
      "",
      "**What's next.** Bloque 30 min en fin de journée pour auditer chaque deal stuck et imposer un next step.",
    ].join("\n"),
  },
];

// ── Narration report (data → prose éditoriale) ─────────────────

export const NARRATION_FEWSHOT_FR: ReadonlyArray<FewShotExample> = [
  {
    input: [
      "Report: Pipeline Sales · Persona: founder · Cadence: weekly",
      "Scalaires : pipeline_total = 1 240 000 € · deals_count = 18 · stalled_30d = 7",
      "Top deals stuck : Acme (180k, 42 jours), Globex (95k, 38 jours), Initech (60k, 35 jours).",
    ].join("\n"),
    output: [
      "Le pipeline tient à 1,24M€ sur 18 deals — mais 7 sont figés depuis plus d'un mois.",
      "",
      "* **Concentration de risque.** Acme (180k, 42j), Globex (95k, 38j) et Initech (60k, 35j) cumulent 27% du pipeline et n'ont pas bougé.",
      "* **Cadence de relance défaillante.** 39% des deals stuck = process commercial à corriger, pas conjoncture.",
      "* **Effort à recentrer.** Concentre la semaine sur les 3 deals stuck > 35j. Un next step daté ou un signal de mort claire.",
    ].join("\n"),
  },
  {
    input: [
      "Report: Customer Health · Persona: csm · Cadence: monthly",
      "Scalaires : nps = 42 · churn_signals = 3 · expansions = 5",
      "Top churn risks : BetaCo (usage -68%), GammaInc (no login 21j), DeltaCorp (ticket open 9j).",
    ].join("\n"),
    output: [
      "Le NPS à 42 masque trois signaux faibles convergents : usage en chute, silence prolongé, ticket non clos.",
      "",
      "* **BetaCo (-68% usage).** Décrochage net. Appel direct au sponsor, pas un email.",
      "* **GammaInc (21j sans login).** Compte mort si rien d'ici 7 jours. Activer le playbook de réactivation.",
      "* **DeltaCorp (ticket 9j ouvert).** Retard support = friction visible. Escalade owner aujourd'hui.",
    ].join("\n"),
  },
];

// ── Conversation summary (long → 2-3 phrases denses) ──────────

export const CONV_SUMMARY_FEWSHOT: ReadonlyArray<FewShotExample> = [
  {
    input: [
      "Utilisateur: J'ai besoin d'une analyse de mon pipeline pour vendredi.",
      "Assistant: Je peux générer un report avec les deals stuck > 30j et leur owner. Tu veux par stade ou par owner ?",
      "Utilisateur: Par owner, et ajoute les deals fermés perdus du mois dernier pour comparer.",
      "Assistant: Compris. Je prépare ça pour jeudi soir, tu valideras vendredi matin.",
      "Utilisateur: Parfait. Et envoie aussi un brief Slack à l'équipe sales avant la review.",
    ].join("\n"),
    output: [
      "Adrien commande un report pipeline (deals stuck par owner + closed-lost du mois) pour jeudi soir, validation vendredi matin.",
      "Brief Slack équipe sales à envoyer avant la review.",
    ].join(" "),
  },
  {
    input: [
      "Utilisateur: Ok donc on est d'accord, on repousse le hiring marketing.",
      "Assistant: Confirmé. Tu veux que je notifie Léa et Pierre ?",
      "Utilisateur: Non, je le ferai en 1:1 demain. Note juste qu'on revisite ça après le closing Series A.",
    ].join("\n"),
    output: [
      "Décision actée : hiring marketing gelé jusqu'après le closing Series A.",
      "Adrien notifiera Léa et Pierre lui-même en 1:1 demain.",
    ].join(" "),
  },
];

// ── Action items extraction (transcript → JSON) ────────────────

export const ACTION_ITEMS_FEWSHOT: ReadonlyArray<FewShotExample> = [
  {
    input: [
      "[Speaker 1 — Adrien] On a reçu le brief de Sarah ce matin. Léa, tu peux préparer la réponse pour mercredi ?",
      "[Speaker 2 — Léa] Oui, je m'en occupe.",
      "[Speaker 1 — Adrien] Pierre, tu valides le pricing avec Marc avant vendredi.",
      "[Speaker 3 — Pierre] Vendredi midi max, sinon on rate le call.",
    ].join("\n"),
    output: JSON.stringify(
      [
        { action: "Préparer la réponse au brief de Sarah", owner: "Léa", deadline: "mercredi" },
        { action: "Valider le pricing avec Marc", owner: "Pierre", deadline: "vendredi midi" },
      ],
      null,
      2,
    ),
  },
  {
    input: [
      "[Speaker 1] On va bien il faut qu'on regarde les chiffres du Q2.",
      "[Speaker 2] Oui, pas mal de choses à voir.",
      "[Speaker 1] Bon, on en reparle.",
    ].join("\n"),
    output: "[]",
  },
];

// ── Knowledge graph extraction (texte → entities + relations) ──

export const KG_EXTRACTION_FEWSHOT: ReadonlyArray<FewShotExample> = [
  {
    input:
      "Sarah Martin, lead investisseur chez Sequoia, a confirmé le term sheet pour la Series A de Hearst OS. " +
      "Elle veut une décision avant le 15 mai. Marc Dubois (CFO d'Acme) signe le contrat de 240k€ demain.",
    output: JSON.stringify(
      {
        entities: [
          { type: "person", label: "Sarah Martin", properties: { role: "lead investisseur" } },
          { type: "company", label: "Sequoia", properties: {} },
          { type: "company", label: "Hearst OS", properties: {} },
          { type: "project", label: "Series A Hearst OS", properties: {} },
          { type: "commitment", label: "Décision Series A avant 15 mai", properties: { deadline: "2026-05-15" } },
          { type: "person", label: "Marc Dubois", properties: { role: "CFO" } },
          { type: "company", label: "Acme", properties: {} },
          { type: "decision", label: "Signature contrat Acme 240k€", properties: { amount: 240000, currency: "EUR" } },
        ],
        relations: [
          { source_label: "Sarah Martin", target_label: "Sequoia", type: "works_at", weight: 1.0 },
          { source_label: "Marc Dubois", target_label: "Acme", type: "works_at", weight: 1.0 },
          { source_label: "Sarah Martin", target_label: "Series A Hearst OS", type: "owns", weight: 1.0 },
          { source_label: "Series A Hearst OS", target_label: "Décision Series A avant 15 mai", type: "depends_on", weight: 1.0 },
          { source_label: "Marc Dubois", target_label: "Signature contrat Acme 240k€", type: "owns", weight: 1.0 },
        ],
      },
      null,
      2,
    ),
  },
  {
    input: "Belle journée pour réfléchir.",
    output: JSON.stringify({ entities: [], relations: [] }, null, 2),
  },
];

// ── Inbox priority classification (email batch → classification) ─

export const INBOX_PRIORITY_FEWSHOT: ReadonlyArray<FewShotExample> = [
  {
    input: JSON.stringify(
      [
        {
          id: "email:001",
          kind: "email",
          title: "URGENT — signature contrat Acme avant midi",
          excerpt: "Marc demande validation de la dernière clause avant l'envoi DocuSign à 11h45.",
        },
        {
          id: "email:002",
          kind: "email",
          title: "Newsletter — Top 10 SaaS metrics that matter",
          excerpt: "Dans cette édition : 10 KPIs essentiels pour 2026, un guide pricing…",
        },
        {
          id: "email:003",
          kind: "email",
          title: "Re: term sheet Series A",
          excerpt: "Sarah revient sur 2 points de la term sheet, attend ton retour cette semaine.",
        },
      ],
      null,
      2,
    ),
    output: JSON.stringify(
      [
        { id: "email:001", priority: "urgent", summary: "Marc attend validation clause Acme avant 11h45." },
        { id: "email:002", priority: "info", summary: "Newsletter SaaS metrics 2026." },
        { id: "email:003", priority: "important", summary: "Sarah attend retour term sheet Series A cette semaine." },
      ],
      null,
      2,
    ),
  },
  {
    input: JSON.stringify(
      [
        {
          id: "email:101",
          kind: "email",
          title: "Compte rendu réunion produit",
          excerpt: "Voici le résumé de la réunion d'hier, pour info.",
        },
        {
          id: "email:102",
          kind: "email",
          title: "Question rapide — staging cassé ?",
          excerpt: "L'env staging renvoie 500 sur /api/runs. Tu peux jeter un œil quand tu peux ?",
        },
      ],
      null,
      2,
    ),
    output: JSON.stringify(
      [
        { id: "email:101", priority: "info", summary: "Compte rendu réunion produit (FYI)." },
        { id: "email:102", priority: "important", summary: "Staging renvoie 500 sur /api/runs, regarder dans la journée." },
      ],
      null,
      2,
    ),
  },
];

// ── Helpers ───────────────────────────────────────────────────

/**
 * Formate un tableau d'exemples sous forme de bloc XML injectable dans un
 * system prompt. Cohérent avec le pattern d'Anthropic (cacheable).
 */
export function formatFewShotBlock(
  examples: ReadonlyArray<FewShotExample>,
  opts: { exampleTag?: string } = {},
): string {
  const tag = opts.exampleTag ?? "example";
  return examples
    .map((ex) => `<${tag}>\n<input>${ex.input}</input>\n<output>${ex.output}</output>\n</${tag}>`)
    .join("\n\n");
}
