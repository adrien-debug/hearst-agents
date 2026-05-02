/**
 * Schemas Zod pour SimulationStage outputs.
 *
 * Le worker DeepSeek retourne un JSON qui doit matcher SimulationOutputSchema,
 * sinon le run passe failed avec error_message contenant le raw output pour
 * debug.
 */

import { z } from "zod";

export const simulationScenarioSchema = z.object({
  name: z.string().min(1).max(120),
  narrative: z.string().min(10).max(2000),
  metrics: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  risks: z.array(z.string().min(1).max(200)).max(10).default([]),
  probability: z.number().min(0).max(1),
});

export type SimulationScenario = z.infer<typeof simulationScenarioSchema>;

export const simulationOutputSchema = z.object({
  scenarios: z.array(simulationScenarioSchema).min(1).max(10),
  /** Resumé optionnel global. */
  summary: z.string().max(800).optional(),
});

export type SimulationOutput = z.infer<typeof simulationOutputSchema>;

/**
 * Status canoniques d'un simulation_run.
 */
export const simulationStatuses = ["pending", "streaming", "completed", "failed"] as const;
export type SimulationStatus = (typeof simulationStatuses)[number];
