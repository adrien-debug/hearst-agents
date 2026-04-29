-- ============================================================
-- Hearst OS — Aligne agent_versions.version + agent_skills.version
-- en integer (cohérent avec agents.version int et l'intention de
-- la migration 0002).
--
-- Contexte :
--  Le drift hors-repo (cf. 0031) avait converti `version int → text`
--  sur ces 2 tables. Conséquence : le code applicatif fait
--  `current.version + 1` (number arithmetic depuis agents.version int)
--  et tente d'INSERT cette valeur dans agent_versions.version text →
--  TS error TS2769 "Type 'number' is not assignable to type 'string'"
--  qui bloque `npm run build` même après 0031.
--
-- Tables vérifiées à 0 rows → ALTER COLUMN trivial via cast.
--
-- La FK composite `agent_skills_agent_id_version_fkey` sur
-- (agent_id, version) bloque l'ALTER simultané (types must match
-- entre les 2 tables côté FK). On DROP la FK avant les ALTER puis
-- on la recrée avec les colonnes int.
--
-- TODO post-sprint (cf. 0031 audit drift global) : aligner aussi
-- agent_skills.agent_id, agent_skills.skill_id, agent_versions.agent_id
-- de text → uuid pour restaurer les FK supprimées par le drift.
-- Pas dans cette migration : impact plus large (FK, types Database
-- multi-table), à traiter dans la PR audit drift dédiée.
-- ============================================================

BEGIN;

-- DROP la FK composite qui empêche l'ALTER COLUMN simultané.
ALTER TABLE public.agent_skills
  DROP CONSTRAINT IF EXISTS agent_skills_agent_id_version_fkey;

-- ALTER les 2 colonnes vers integer (tables vides, cast trivial).
ALTER TABLE public.agent_versions
  ALTER COLUMN version TYPE integer USING version::integer;

ALTER TABLE public.agent_skills
  ALTER COLUMN version TYPE integer USING version::integer;

-- RECREATE la FK composite avec les types alignés.
ALTER TABLE public.agent_skills
  ADD CONSTRAINT agent_skills_agent_id_version_fkey
    FOREIGN KEY (agent_id, version)
    REFERENCES public.agent_versions(agent_id, version)
    ON DELETE CASCADE;

COMMIT;
