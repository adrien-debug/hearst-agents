/**
 * Axiom client — logs structurés.
 * Sur Vercel, le log drain natif suffit (zéro code requis).
 * Ce module sert pour des logs custom hors du flux Vercel.
 */

import { Axiom } from "@axiomhq/js";

let _client: Axiom | null = null;

function getClient(): Axiom | null {
  if (_client) return _client;
  const token = process.env.AXIOM_TOKEN;
  if (!token) return null;
  _client = new Axiom({ token });
  return _client;
}

export const isAxiomEnabled = (): boolean => Boolean(process.env.AXIOM_TOKEN);

export async function logEvent(
  data: Record<string, unknown>,
  dataset = process.env.AXIOM_DATASET ?? "hearst-vercel",
): Promise<void> {
  const client = getClient();
  if (!client) return;
  client.ingest(dataset, [{ _time: new Date().toISOString(), ...data }]);
  await client.flush();
}
