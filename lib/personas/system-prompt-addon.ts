/**
 * Build le bloc `<persona>...</persona>` injecté dans le system prompt.
 *
 * Placé en zone cacheable (avant `<retrieved_memory>`) → si la persona
 * reste stable entre tours, le prompt cache Anthropic ephemeral garde le
 * tag persona dans le hit.
 *
 * Cap strict 1500 chars pour éviter qu'une style guide longue éclate
 * le budget de cache.
 */

import type { Persona } from "./types";

const ADDON_MAX_CHARS = 1500;

function joinList(values: string[] | undefined): string | null {
  if (!values || values.length === 0) return null;
  return values.slice(0, 12).join(", ");
}

export function buildPersonaAddon(persona: Persona): string {
  const lines: string[] = [];
  lines.push(`Persona active : ${persona.name}.`);
  if (persona.description && persona.description.trim()) {
    lines.push(persona.description.trim());
  }
  if (persona.tone) {
    lines.push(`Ton : ${persona.tone}.`);
  }
  const preferred = joinList(persona.vocabulary?.preferred);
  if (preferred) {
    lines.push(`Vocabulaire préféré : ${preferred}.`);
  }
  const avoid = joinList(persona.vocabulary?.avoid);
  if (avoid) {
    lines.push(`À éviter : ${avoid}.`);
  }
  if (persona.styleGuide && persona.styleGuide.trim()) {
    lines.push(`Style guide : ${persona.styleGuide.trim()}`);
  }
  if (persona.systemPromptAddon && persona.systemPromptAddon.trim()) {
    lines.push(persona.systemPromptAddon.trim());
  }

  const body = lines.join("\n").slice(0, ADDON_MAX_CHARS);
  return `<persona>\n${body}\n</persona>`;
}

/**
 * Variante : retourne `null` si la persona est strictement vide
 * (rien à injecter → on évite d'ajouter un bloc vide au prompt).
 */
export function buildPersonaAddonOrNull(persona: Persona | null | undefined): string | null {
  if (!persona) return null;
  const hasContent =
    Boolean(persona.tone) ||
    Boolean(persona.styleGuide?.trim()) ||
    Boolean(persona.systemPromptAddon?.trim()) ||
    Boolean(persona.vocabulary?.preferred?.length) ||
    Boolean(persona.vocabulary?.avoid?.length) ||
    Boolean(persona.description?.trim());
  if (!hasContent) return null;
  return buildPersonaAddon(persona);
}
