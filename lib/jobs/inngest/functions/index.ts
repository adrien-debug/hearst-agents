/**
 * Registre des fonctions Inngest — exporté pour le handler /api/inngest.
 *
 * Importe chaque fonction et la regroupe dans `inngestFunctions[]`. Ce
 * fichier est isolé de `lib/jobs/inngest/client.ts` pour éviter une
 * dépendance circulaire (les fonctions importent `inngest` depuis
 * client.ts).
 */

import { dailyBriefFunction } from "./daily-brief";

export const inngestFunctions = [dailyBriefFunction];
