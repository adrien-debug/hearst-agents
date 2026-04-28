/**
 * Shim de typage pour les 3 tables `report_*_cache`.
 *
 * Tant que `lib/database.types.ts` n'est pas régénéré (cf. mcp_supabase
 * generate_typescript_types), on déclare ici localement le shape exact
 * appliqué par la migration 0025_report_cache.sql.
 *
 * À supprimer dès que les types Supabase incluent ces 3 tables.
 */

export interface ReportSourceCacheRow {
  hash: string;
  payload: unknown;
  expires_at: string; // ISO timestamp
  created_at: string;
}

export interface ReportTransformCacheRow {
  hash: string;
  payload: unknown;
  expires_at: string;
  created_at: string;
}

export interface ReportRenderCacheRow {
  spec_id: string;
  version: number;
  payload_hash: string;
  payload_json: unknown;
  narration: string | null;
  expires_at: string;
  created_at: string;
}
