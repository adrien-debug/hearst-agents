-- Migration 0043 : Active Supabase Realtime sur assets
-- Requis pour que le store front-end (stores/reports.ts) reçoive les UPDATE
-- en temps réel quand une mission schedulée re-run un rapport.

alter publication supabase_realtime add table assets;
