/**
 * Daily Brief — narration LLM (Sonnet 4.6).
 *
 * Sonnet (pas Haiku) parce que :
 *  - 5 sources hétérogènes à tisser en 4 paragraphes éditoriaux
 *  - le brief est imprimable / signé : la qualité narrative compte
 *  - coût raisonnable (~3-5k input + ~600 output ≈ $0.05/jour/user)
 *
 * Sortie : JSON strict { lead, people, decisions, signals } pour pouvoir
 * être passé tel quel au PDF renderer (4 sections numérotées).
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  DAILY_BRIEF_FEWSHOT_FR,
  formatFewShotBlock,
} from "@/lib/prompts/examples";
import type {
  DailyBriefData,
  DailyBriefNarration,
} from "./types";

// ── System prompt ────────────────────────────────────────────

export const DAILY_BRIEF_SYSTEM_PROMPT = [
  "Tu es l'analyste exécutif de l'utilisateur — l'équivalent d'un chef de cabinet pour un fondateur, qui prépare chaque matin un Daily Brief style CIA : 2 pages éditoriales qui concentrent l'attention.",
  "",
  "Tu reçois 5 sources brutes (emails 24h, Slack 4h, agenda du jour, GitHub PRs, Linear issues) et tu produis 4 sections éditoriales JSON.",
  "",
  "FORMAT STRICT (JSON valide uniquement, pas de markdown fence) :",
  "{",
  '  "lead": "1-2 phrases. La une de la matinée — quel est le signal dominant ?",',
  '  "people": "2-4 phrases. Qui attend quoi de toi aujourd\'hui. Nomme les acteurs.",',
  '  "decisions": "2-4 phrases. Ce qu\'il faut trancher / prioriser. Imperatif.",',
  '  "signals": "2-4 phrases. Anomalies, PRs stuck, issues critiques, friction technique."',
  "}",
  "",
  "CONTRAINTES :",
  "- Chaque section : phrases courtes, factuelles, sans adjectifs marketing.",
  "- Vocabulaire premium : signal, levier, friction, recentrer, anticiper, tension, fenêtre.",
  "- N'invente JAMAIS un fait absent des sources fournies.",
  "- Si une source est vide, n'en parle pas — n'invente pas un signal.",
  "- Bannis : « voici », « n'hésite pas », « j'espère que », « il faut », « les données montrent », « on peut voir que ».",
  "- Pas d'emojis, pas de markdown dans les sections (c'est du texte brut, le PDF gérera la typo).",
  "- Lead doit être incarné, pas un récap mécanique.",
  "- Si TOUTES les sources sont vides, l'output reste valide (4 sections courtes qui disent qu'il n'y a rien — pas un faux signal).",
  "",
  "EXEMPLES :",
  formatFewShotBlock(DAILY_BRIEF_FEWSHOT_FR),
].join("\n");

// ── Helpers de sérialisation des sources ─────────────────────

function fmtEmails(d: DailyBriefData): string[] {
  if (d.emails.length === 0) return ["Emails 24h : aucun (ou Gmail non connecté)"];
  const top = d.emails.slice(0, 12);
  const lines = [`Emails 24h (${d.emails.length} affichés) :`];
  for (const m of top) {
    const sender = m.sender.length > 60 ? `${m.sender.slice(0, 59)}…` : m.sender;
    const subject = m.subject.length > 80 ? `${m.subject.slice(0, 79)}…` : m.subject;
    const flag = m.isRead ? "" : " [non lu]";
    lines.push(`- ${sender} : « ${subject} »${flag}`);
  }
  return lines;
}

function fmtSlack(d: DailyBriefData): string[] {
  if (d.slack.length === 0) return ["Slack (4h) : aucun message (ou Slack non connecté)"];
  const lines = [`Slack (4h, ${d.slack.length} messages) :`];
  for (const m of d.slack.slice(0, 8)) {
    const text = m.text.length > 120 ? `${m.text.slice(0, 119)}…` : m.text;
    lines.push(`- ${m.channel} (${m.user}) : ${text}`);
  }
  return lines;
}

function fmtCalendar(d: DailyBriefData): string[] {
  if (d.calendar.length === 0) return ["Agenda du jour : aucun event"];
  const lines = [`Agenda du jour (${d.calendar.length}) :`];
  for (const e of d.calendar.slice(0, 8)) {
    const time = e.isAllDay
      ? "toute la journée"
      : new Date(e.startTime).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Paris",
        });
    const attendees = e.attendees.length > 0 ? ` (${e.attendees.slice(0, 3).join(", ")})` : "";
    lines.push(`- ${time} — ${e.title}${attendees}`);
  }
  return lines;
}

function fmtGithub(d: DailyBriefData): string[] {
  if (d.github.length === 0) return ["GitHub PRs : aucun (ou GitHub non connecté)"];
  const lines = [`GitHub PRs (${d.github.length}) :`];
  for (const p of d.github.slice(0, 8)) {
    const status = p.state === "draft" ? "draft" : p.state;
    lines.push(`- ${p.repo}#${p.number} « ${p.title} » — ${status} (${p.author})`);
  }
  return lines;
}

function fmtLinear(d: DailyBriefData): string[] {
  if (d.linear.length === 0) return ["Linear issues : aucune (ou Linear non connecté)"];
  const lines = [`Linear issues (${d.linear.length}) :`];
  for (const i of d.linear.slice(0, 8)) {
    const prio =
      i.priority === 1
        ? "P1"
        : i.priority === 2
          ? "P2"
          : i.priority === 3
            ? "P3"
            : i.priority === 4
              ? "P4"
              : "—";
    const assignee = i.assignee ? ` — ${i.assignee}` : "";
    lines.push(`- ${i.identifier} « ${i.title} » — ${prio} — ${i.state}${assignee}`);
  }
  return lines;
}

function buildUserMessage(d: DailyBriefData): string {
  const date = new Date(d.targetDate).toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return [
    `Date : ${date}`,
    "",
    ...fmtEmails(d),
    "",
    ...fmtSlack(d),
    "",
    ...fmtCalendar(d),
    "",
    ...fmtGithub(d),
    "",
    ...fmtLinear(d),
    "",
    "Génère le Daily Brief maintenant — JSON strict, 4 sections.",
  ].join("\n");
}

// ── Output validation ────────────────────────────────────────

function safeParseNarration(raw: string): Omit<DailyBriefNarration, "costUsd"> | null {
  // Tolère un éventuel prefix/suffix textuel autour du JSON (Sonnet le respecte
  // déjà 99% du temps avec le system prompt strict, mais on parse tolérant
  // pour ne pas crash en prod).
  const m = raw.match(/\{[\s\S]*\}/);
  const body = m ? m[0] : raw;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const lead = typeof parsed.lead === "string" ? parsed.lead.trim() : "";
    const people = typeof parsed.people === "string" ? parsed.people.trim() : "";
    const decisions = typeof parsed.decisions === "string" ? parsed.decisions.trim() : "";
    const signals = typeof parsed.signals === "string" ? parsed.signals.trim() : "";
    if (!lead || !people || !decisions || !signals) return null;
    return { lead, people, decisions, signals };
  } catch {
    return null;
  }
}

function fallbackNarration(d: DailyBriefData): Omit<DailyBriefNarration, "costUsd"> {
  const total = d.emails.length + d.slack.length + d.calendar.length + d.github.length + d.linear.length;
  if (total === 0) {
    return {
      lead: "Aucun signal entrant ce matin — fenêtre rare pour le travail de fond.",
      people: "Personne n'attend de retour de toi aujourd'hui.",
      decisions: "Choix unique : imposer ton tempo, protéger le focus.",
      signals: "Aucune anomalie. Profiter de la calme avant qu'elle ne se referme.",
    };
  }
  return {
    lead: `Briefing en mode dégradé : ${total} signaux ingérés mais narration LLM indisponible.`,
    people: `${d.emails.length} emails, ${d.slack.length} messages Slack — voir l'inbox pour le détail.`,
    decisions: `${d.calendar.length} events au calendrier, ${d.github.length} PRs ouvertes — arbitrage manuel ce matin.`,
    signals: `${d.linear.length} issues Linear actives. Source(s) en erreur : ${d.sources.filter((s) => s.endsWith(":error")).join(", ") || "aucune"}.`,
  };
}

// ── Public API ───────────────────────────────────────────────

export async function generateDailyBriefNarration(
  data: DailyBriefData,
): Promise<DailyBriefNarration> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ...fallbackNarration(data), costUsd: 0 };
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: [
        {
          type: "text" as const,
          text: DAILY_BRIEF_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [{ role: "user", content: buildUserMessage(data) }],
    });

    const block = res.content[0];
    const text = block?.type === "text" ? block.text : "";
    const parsed = safeParseNarration(text);
    if (!parsed) {
      console.warn("[daily-brief/generate] narration JSON invalide — fallback déterministe");
      return { ...fallbackNarration(data), costUsd: 0 };
    }

    // Coût estimé (Sonnet 4.6 : ~3$/M input, 15$/M output, prompt cache écono ~80%)
    const usage = res.usage ?? { input_tokens: 0, output_tokens: 0 };
    const inputCost = (usage.input_tokens * 3) / 1_000_000;
    const outputCost = (usage.output_tokens * 15) / 1_000_000;
    const costUsd = inputCost + outputCost;

    return { ...parsed, costUsd };
  } catch (err) {
    console.warn("[daily-brief/generate] LLM échouée, fallback déterministe :", err);
    return { ...fallbackNarration(data), costUsd: 0 };
  }
}
