-- Hearst OS — D3 : trigger SQL rating recalc (source de vérité)
--
-- Le trigger `marketplace_ratings_recalc` a été introduit dans la migration
-- 0054. Cette migration le ré-applique de manière idempotente pour garantir
-- que la fonction et le trigger sont toujours en place — utile quand
-- l'environnement cible a été créé avant 0054 ou si le trigger a été dropped
-- manuellement (debug).
--
-- Rationale : le recalc applicatif (lib/marketplace/store.ts:rateTemplate)
-- subsiste comme fallback en dev mais la PROD doit s'appuyer sur ce trigger
-- pour éviter les races (lecture-écriture concurrente sur rating_avg).

CREATE OR REPLACE FUNCTION marketplace_recalc_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.template_id;
  ELSE
    target_id := NEW.template_id;
  END IF;

  UPDATE marketplace_templates
  SET
    rating_avg = COALESCE(
      (SELECT AVG(rating)::numeric(4,2) FROM marketplace_ratings WHERE template_id = target_id),
      0
    ),
    rating_count = (
      SELECT COUNT(*) FROM marketplace_ratings WHERE template_id = target_id
    ),
    updated_at = now()
  WHERE id = target_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS marketplace_ratings_recalc ON marketplace_ratings;
CREATE TRIGGER marketplace_ratings_recalc
AFTER INSERT OR UPDATE OR DELETE ON marketplace_ratings
FOR EACH ROW EXECUTE FUNCTION marketplace_recalc_rating();
