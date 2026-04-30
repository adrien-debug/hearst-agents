/**
 * Personas — types canoniques d'une variante de voix appliquée au LLM.
 *
 * Une persona décrit le ton, le vocabulaire préféré/évité, un style guide
 * markdown et un addon de system prompt. L'orchestrator injecte l'addon
 * dans la zone cacheable, ce qui rend deux personas stables compatibles
 * avec le prompt cache Anthropic (1 hit par persona, pas une perte par tour).
 */

export type PersonaTone =
  | "formal"
  | "casual"
  | "analytical"
  | "creative"
  | "direct";

export interface PersonaVocabulary {
  preferred?: string[];
  avoid?: string[];
}

export interface Persona {
  id: string;
  userId: string;
  tenantId: string;
  name: string;
  description?: string;
  tone?: PersonaTone | null;
  vocabulary?: PersonaVocabulary | null;
  styleGuide?: string | null;
  systemPromptAddon?: string | null;
  /**
   * Si défini, identifie une surface canonique (`chat`, `inbox`,
   * `simulation`, `voice`, `cockpit`) pour laquelle la persona est
   * automatiquement appliquée si aucun ID explicite n'est passé.
   */
  surface?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaInsert {
  userId: string;
  tenantId: string;
  name: string;
  description?: string;
  tone?: PersonaTone | null;
  vocabulary?: PersonaVocabulary | null;
  styleGuide?: string | null;
  systemPromptAddon?: string | null;
  surface?: string | null;
  isDefault?: boolean;
}

export interface PersonaUpdate {
  name?: string;
  description?: string;
  tone?: PersonaTone | null;
  vocabulary?: PersonaVocabulary | null;
  styleGuide?: string | null;
  systemPromptAddon?: string | null;
  surface?: string | null;
  isDefault?: boolean;
}

export const PERSONA_TONES: PersonaTone[] = [
  "formal",
  "casual",
  "analytical",
  "creative",
  "direct",
];
