-- ============================================================
-- Hearst OS — Mission Memory (vague 9)
--
-- Stocke les messages user/assistant attachés à une mission, pour
-- transformer une mission fire-and-forget en compagnon long-terme.
-- L'utilisateur peut revenir 3 jours plus tard, écrire « où en
-- est-on ? », et l'agent re-charge le contexte mission complet
-- (last summary + 10 derniers messages) avant le run suivant.
--
-- Le `context_summary` lui-même n'a pas besoin de colonne dédiée :
-- il est stocké dans le champ JSONB existant `missions.actions`
-- sous la clé `contextSummary` (cf. pattern actions.lastRunAt déjà
-- utilisé en lib/engine/runtime/state/adapter.ts).
--
-- Scope : user_id + mission_id. tenant_id optionnel (text) pour
-- cohérence avec les autres tables multi-tenant.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mission_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  tenant_id   text,
  role        text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     text NOT NULL,
  run_id      uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_mission_messages_mission_created
  ON public.mission_messages (mission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mission_messages_user_mission
  ON public.mission_messages (user_id, mission_id);

ALTER TABLE public.mission_messages ENABLE ROW LEVEL SECURITY;

-- Service role bypass — cohérent avec le pattern embeddings/missions.
-- L'isolation user est appliquée côté application (tous les accès
-- passent par le service role et filtrent user_id explicitement).
DROP POLICY IF EXISTS mission_messages_service_all ON public.mission_messages;
CREATE POLICY mission_messages_service_all ON public.mission_messages
  FOR ALL USING (true) WITH CHECK (true);
