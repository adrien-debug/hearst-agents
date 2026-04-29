/**
 * Voice Tool Definitions — Client-safe. Pas de deps server (crypto, fs,
 * providers). Importable depuis le browser pour afficher labels/counts
 * dans le ContextRail.
 *
 * Le dispatcher d'exécution vit dans `./tools.ts` (server-only).
 */

export interface VoiceToolDef {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const voiceToolDefs: VoiceToolDef[] = [
  {
    type: "function",
    name: "start_meeting_bot",
    description:
      "Lance un bot Recall.ai sur un meeting Zoom/Meet/Teams en cours. Le bot rejoint le call, transcrit en temps réel et détecte les action items. Use this when the user dit 'rejoins ce meeting' avec une URL.",
    parameters: {
      type: "object",
      required: ["meeting_url"],
      properties: {
        meeting_url: {
          type: "string",
          description: "URL complète du meeting (Zoom, Google Meet, Teams).",
        },
        bot_name: {
          type: "string",
          description: "Nom affiché du bot dans le meeting (optionnel).",
        },
      },
    },
  },
  {
    type: "function",
    name: "start_simulation",
    description:
      "Ouvre la Chambre de Simulation pour explorer un scénario business via DeepSeek (3-5 scénarios chiffrés avec probabilités). Use this when the user veut explorer des alternatives, modéliser une décision, ou évaluer des options stratégiques.",
    parameters: {
      type: "object",
      required: ["scenario"],
      properties: {
        scenario: {
          type: "string",
          description: "Description du scénario business à simuler.",
        },
      },
    },
  },
  {
    type: "function",
    name: "generate_image",
    description:
      "Génère une image à partir d'un prompt texte via fal.ai. Crée un asset persisté + variant image, lance le job en background. L'utilisateur est téléporté sur l'AssetStage avec le tab image actif (l'image apparaît au polling, 5-15s).",
    parameters: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: {
          type: "string",
          description: "Description textuelle de l'image à générer.",
        },
        style: {
          type: "string",
          description: "Style artistique (ex: photorealistic, watercolor, cinematic).",
        },
      },
    },
  },
];

/** Label compact affichable dans le ContextRail. */
export const VOICE_TOOL_LABELS: Record<string, string> = {
  start_meeting_bot: "Meeting",
  start_simulation: "Simulation",
  generate_image: "Image",
};
