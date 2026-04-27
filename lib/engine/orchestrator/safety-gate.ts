/**
 * Safety gate — runs BEFORE the AI pipeline so we can refuse hostile or
 * abusive intents without ever proposing a tool call (and crucially, without
 * triggering an OAuth card for an action that should never happen).
 *
 * Two layers:
 *   1. Hostile-content check (violence, threats, harassment, illegal asks).
 *   2. Mass-action cap (soft warn at >10 recipients, hard refuse at >50).
 *
 * The gate is intentionally heuristic — final-quality moderation is the
 * model's job. This is a pre-LLM defence-in-depth so the orchestrator never
 * even gets to the point of asking Composio to send a death threat.
 */

export type SafetyVerdict =
  | { kind: "ok" }
  | { kind: "refuse"; reason: string; userMessage: string }
  | { kind: "clarify"; reason: string; userMessage: string };

const VIOLENT_PATTERNS = [
  /\b(je\s+vais|je\s+veux|tu\s+vas)\s+(te\s+|vous\s+|le\s+|la\s+|les\s+)?(tuer|frapper|cogner|casser\s+la\s+gueule|défoncer|égorger|massacrer)\b/i,
  /\b(menace|menacer|tuer|kill|murder|assassinate|harm|hurt)\s+(de\s+mort|to\s+death)?\b/i,
  /\b(bomb|explos|attentat|terrorist|terroriste)\w*/i,
  /\b(rape|violer|agresser\s+sexuell)\w*/i,
  /\bje\s+vais\s+te\s+(tuer|buter|défoncer|fracasser|massacrer|exploser)\b/i,
  /\bI'?ll\s+(kill|murder|hurt|harm)\s+you\b/i,
  /\b(suicide|self[-\s]harm|kill\s+myself|me\s+suicider|me\s+tuer)\b/i,
];

const HARASSMENT_PATTERNS = [
  /\b(harceler|harass|stalk|intimider|insulter\s+publiquement)\w*/i,
  /\bdoxx?\b/i,
];

const ILLEGAL_PATTERNS = [
  /\b(extorsion|extort|blackmail|chantage|ranç?onner)\w*/i,
  /\bvol(er)?\s+(des\s+données|de\s+l'argent|son\s+identité|sa\s+carte)\b/i,
  /\b(steal\s+(data|money|identity|credit\s+card))\b/i,
  /\bfaux\s+passeport|fake\s+passport|forged?\s+document\b/i,
];

const EXFIL_PATTERNS = [
  /(reveal|montre[\sr]|affiche|expose|dump|leak|exfiltre[rz]?)\s+(your|ton|le)\s+(system\s+)?prompt/i,
  /\bingore\s+(all\s+)?(previous|prior|prior\s+all)\s+instructions?\b/i,
  /\boublie\s+toutes?\s+(tes|les)\s+(instructions?|règles?)\b/i,
  /\bignore\s+(all\s+)?(previous|prior)\s+instructions?\b/i,
];

// Mass-action soft / hard caps — the second number wins.
const MASS_PATTERNS: Array<{ pattern: RegExp; recipients: number }> = [
  { pattern: /\b(\d{2,})\s*(contacts?|destinataires?|clients?|leads?|recipients?|personnes?|utilisateurs?|users?|emails?\s+\w+)\b/i, recipients: 0 },
  { pattern: /\btous\s+(mes|tes|nos)\s+(contacts?|clients?|leads?|emails?|abonn[ée]s?|users?|utilisateurs?)\b/i, recipients: 9999 },
  { pattern: /\ball\s+(my|the|our)\s+(contacts?|clients?|leads?|users?|customers?)\b/i, recipients: 9999 },
];

const SOFT_CAP = 10;
const HARD_CAP = 50;

export function checkSafetyGate(message: string): SafetyVerdict {
  // 1. Hostile content — hard refusal.
  for (const p of VIOLENT_PATTERNS) {
    if (p.test(message)) {
      return {
        kind: "refuse",
        reason: "violent_content",
        userMessage:
          "Je ne peux pas aider à envoyer un message menaçant ou violent. " +
          "Si tu traverses une situation difficile, je peux t'aider à reformuler " +
          "ou à rédiger un message ferme et constructif à la place.",
      };
    }
  }
  for (const p of HARASSMENT_PATTERNS) {
    if (p.test(message)) {
      return {
        kind: "refuse",
        reason: "harassment",
        userMessage:
          "Je ne peux pas aider à harceler ou intimider quelqu'un. " +
          "Dis-moi ce que tu veux vraiment résoudre — je peux t'aider sur le fond.",
      };
    }
  }
  for (const p of ILLEGAL_PATTERNS) {
    if (p.test(message)) {
      return {
        kind: "refuse",
        reason: "illegal_content",
        userMessage:
          "Je ne peux pas aider sur des actions illégales (extorsion, vol, " +
          "documents falsifiés, etc.).",
      };
    }
  }

  // 2. Prompt-injection / system-prompt exfil attempts — refuse politely.
  for (const p of EXFIL_PATTERNS) {
    if (p.test(message)) {
      return {
        kind: "refuse",
        reason: "prompt_exfiltration",
        userMessage:
          "Mes règles de fonctionnement ne sont pas modifiables et ne peuvent pas " +
          "être révélées. Je reste Hearst, ton assistant exécutif. Comment puis-je t'aider ?",
      };
    }
  }

  // 3. Mass-action caps. Extract the largest recipient count.
  let recipients = 0;
  for (const { pattern, recipients: bulk } of MASS_PATTERNS) {
    const m = message.match(pattern);
    if (!m) continue;
    if (bulk > 0) {
      recipients = Math.max(recipients, bulk);
    } else {
      const n = parseInt(m[1] ?? "0", 10);
      if (Number.isFinite(n)) recipients = Math.max(recipients, n);
    }
  }

  if (recipients > HARD_CAP) {
    return {
      kind: "refuse",
      reason: "mass_action_hard_cap",
      userMessage:
        `Je ne lance pas une action vers ${recipients > 9000 ? "tes contacts en masse" : `${recipients} destinataires`} ` +
        "sans segmentation et validation explicite. " +
        `Je peux préparer un brouillon ou travailler sur un échantillon de ${SOFT_CAP} contacts maximum, ` +
        "puis on valide ensemble avant tout envoi groupé.",
    };
  }
  if (recipients > SOFT_CAP) {
    return {
      kind: "clarify",
      reason: "mass_action_soft_cap",
      userMessage:
        `Tu cibles ${recipients} destinataires — au-dessus de ${SOFT_CAP}, je préfère valider avant.\n\n` +
        "Confirme-moi :\n" +
        "1. Le segment exact (critère, source).\n" +
        "2. Le contenu précis du message.\n" +
        "3. Si tu veux personnaliser par destinataire ou envoyer le même texte.\n\n" +
        `Sinon je peux commencer par un test sur ${SOFT_CAP} contacts.`,
    };
  }

  return { kind: "ok" };
}
