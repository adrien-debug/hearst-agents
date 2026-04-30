-- ============================================================
-- Hearst OS — Voice Transcripts (B2 Voice Agentic)
--
-- Persiste le transcript complet d'une session voix (WebRTC OpenAI
-- Realtime) avec ses tool_call / tool_result. Avant cette migration le
-- transcript ne vivait que dans le store Zustand et disparaissait au
-- teardown.
--
-- Modèle :
--   id          : uuid PK
--   user_id     : auth.uid() de l'owner — RLS scope
--   tenant_id   : tenant text aligné sur assets/shares
--   thread_id   : nullable ; lié si l'user clique "Lier au thread"
--   session_id  : id de la session OpenAI Realtime (corrèle avec
--                 useVoiceStore.sessionId côté client)
--   started_at  : timestamptz
--   ended_at    : timestamptz nullable
--   entries     : jsonb append-only (array de
--                 { id, role, text, timestamp, callId?, toolName?,
--                   args?, output?, status?, providerId? })
-- ============================================================

CREATE TABLE IF NOT EXISTS public.voice_transcripts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  tenant_id   text        NOT NULL,
  thread_id   text,
  session_id  text        NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  entries     jsonb       NOT NULL DEFAULT '[]'::jsonb,

  UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_transcripts_user
  ON public.voice_transcripts (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_transcripts_thread
  ON public.voice_transcripts (thread_id)
  WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_voice_transcripts_tenant
  ON public.voice_transcripts (tenant_id);

-- RLS : un user authentifié ne voit / écrit que ses propres transcripts.
-- service_role bypass pour les workers et pour les routes serveur qui
-- agissent au nom de l'user après requireScope.
ALTER TABLE public.voice_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY voice_transcripts_select_user ON public.voice_transcripts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

CREATE POLICY voice_transcripts_insert_user ON public.voice_transcripts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY voice_transcripts_update_user ON public.voice_transcripts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY voice_transcripts_service_all ON public.voice_transcripts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.voice_transcripts IS
  'B2 Voice Agentic — transcripts persistants par session WebRTC OpenAI Realtime.';
COMMENT ON COLUMN public.voice_transcripts.entries IS
  'Array jsonb d''entries { id, role, text, timestamp, callId?, toolName?, args?, output?, status?, providerId? }.';
