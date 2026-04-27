/**
 * Write-intent detector — keeps "send/create/delete" requests out of
 * the synthetic retrieval short-circuit and routes them through the
 * AI pipeline (where Composio tools live).
 */

import { describe, it, expect } from "vitest";
import { isWriteIntent } from "@/lib/engine/orchestrator/write-intent";

describe("isWriteIntent — French", () => {
  it.each([
    "Envoie un message Slack à Olivier",
    "Envoie un email à marie@example.com",
    "Réponds à ce mail",
    "Crée une page Notion sur la roadmap",
    "Supprime ce mail",
    "Modifie l'événement de demain",
    "Édite la dernière page",
    "Publie ce brouillon",
    "Archive ces threads",
    "Déplace ce ticket dans Done",
    "Ajoute Olivier au channel #dev",
    "Planifie une réunion vendredi",
    "Annule mon meeting de 14h",
    "Transfère ce mail à mon manager",
    "Renvoie cet email à toute l'équipe",
    "Poste un message dans #général",
  ])("write intent: %s", (msg) => {
    expect(isWriteIntent(msg)).toBe(true);
  });
});

describe("isWriteIntent — English", () => {
  it.each([
    "Send a Slack message to Bob",
    "Reply to that email",
    "Forward this thread to my manager",
    "Create a Notion page",
    "Delete this draft",
    "Update the event tomorrow",
    "Post a message in #general",
    "Archive these emails",
    "Schedule a call on Friday",
    "Cancel my 3pm",
    "Add Olivia to the channel",
  ])("write intent: %s", (msg) => {
    expect(isWriteIntent(msg)).toBe(true);
  });
});

describe("isWriteIntent — read intents", () => {
  it.each([
    "Résume mes emails non lus",
    "Liste mes documents Drive",
    "Trouve le dernier mail d'Olivier",
    "Montre-moi mes prochaines réunions",
    "Combien d'emails non lus j'ai ?",
    "Qui m'a envoyé un mail aujourd'hui ?",
    "Ai-je reçu une réponse de Bob ?",
    "Show me my unread inbox",
    "How many emails are pending",
    "Who sent the latest report",
    "Find the meeting notes from yesterday",
  ])("read intent: %s", (msg) => {
    expect(isWriteIntent(msg)).toBe(false);
  });
});

describe("isWriteIntent — read hedge wins over write verb", () => {
  it("'résume les mails que j'ai envoyés hier' → read", () => {
    // Contains 'envoyé' but starts with a read hedge — must NOT trigger write.
    expect(isWriteIntent("Résume les mails que j'ai envoyés hier")).toBe(false);
  });

  it("'liste les messages que j'ai envoyés cette semaine' → read", () => {
    expect(isWriteIntent("Liste les messages que j'ai envoyés cette semaine")).toBe(false);
  });

  it("'qui m'a envoyé le rapport ?' → read", () => {
    expect(isWriteIntent("Qui m'a envoyé le rapport ?")).toBe(false);
  });
});

describe("isWriteIntent — chit-chat / neutral", () => {
  it.each([
    "Bonjour",
    "Merci",
    "Comment ça va ?",
    "Quelle heure est-il ?",
    "Que peux-tu faire ?",
    "Hello",
    "What can you do",
  ])("neutral: %s", (msg) => {
    expect(isWriteIntent(msg)).toBe(false);
  });
});

describe("isWriteIntent — word boundary safety", () => {
  it("'sender' inside a word does NOT match 'send'", () => {
    expect(isWriteIntent("the sender of the email is Bob")).toBe(false);
  });

  it("'created' as past participle in a description does match (intent unclear, but acceptable)", () => {
    // 'created' is in WRITE_VERBS_EN — past tense statements get flagged.
    // This is acceptable: if the user types "I have created X", they're
    // probably about to ask the agent to act on it.
    expect(isWriteIntent("I created a new doc, send it to Bob")).toBe(true);
  });

  it("empty string → false", () => {
    expect(isWriteIntent("")).toBe(false);
  });

  it("whitespace-only → false", () => {
    expect(isWriteIntent("   \n  ")).toBe(false);
  });
});
