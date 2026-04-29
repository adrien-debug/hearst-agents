-- ============================================================
-- Hearst OS — Grand Cleanup : DROP des tables non utilisées
--
-- Contexte : la DB Supabase contenait 105 tables, dont 36+ orphelines
-- héritées d'autres projets ou expérimentations (hospitality_*, cursor_*,
-- scraper_*, clawd_*, e-commerce, misc). Audit grep récursif :
-- 0 référence dans lib/, app/, scripts/, e2e/, __tests__/ (hors
-- lib/database.types.ts auto-généré).
--
-- Conséquence avant cleanup : agents qui lisent le schéma se perdent
-- entre les tables Hearst et les tables d'autres projets ; lib/database.
-- types.ts pollué de types non utilisés (5509 lignes).
--
-- Cette migration DROP CASCADE — supprime aussi les FK qui pointent sur
-- ces tables. Tables vérifiées 0 référence applicative avant DROP.
--
-- Familles supprimées (40 tables ciblées, 36 effectivement droppées) :
--  - hospitality_* (19) : projet hospitality séparé
--  - cursor_* (4)       : Cursor IDE telemetry, ~720k rows
--  - scraper_* (3)      : projet scraper séparé
--  - clawd_* (3)        : ancien projet IA
--  - e-commerce (7)     : orders, products, invoices, customers, etc.
--  - misc (4)           : tenants, tenant_integrations, merge_connections,
--                         inventory_logs, demo_requests
--
-- Post-cleanup : 105 → 69 tables. Types regen 5509 → 3792 lignes (-31%).
-- ============================================================

BEGIN;

-- Hospitality (19 tables, projet séparé)
DROP TABLE IF EXISTS public.hospitality_campaigns CASCADE;
DROP TABLE IF EXISTS public.hospitality_cashflow CASCADE;
DROP TABLE IF EXISTS public.hospitality_contracts CASCADE;
DROP TABLE IF EXISTS public.hospitality_design_assets CASCADE;
DROP TABLE IF EXISTS public.hospitality_design_briefs CASCADE;
DROP TABLE IF EXISTS public.hospitality_ebitda CASCADE;
DROP TABLE IF EXISTS public.hospitality_employees CASCADE;
DROP TABLE IF EXISTS public.hospitality_forecast CASCADE;
DROP TABLE IF EXISTS public.hospitality_insurance CASCADE;
DROP TABLE IF EXISTS public.hospitality_legal_updates CASCADE;
DROP TABLE IF EXISTS public.hospitality_payroll CASCADE;
DROP TABLE IF EXISTS public.hospitality_purchase_orders CASCADE;
DROP TABLE IF EXISTS public.hospitality_rents CASCADE;
DROP TABLE IF EXISTS public.hospitality_revenue CASCADE;
DROP TABLE IF EXISTS public.hospitality_schedules CASCADE;
DROP TABLE IF EXISTS public.hospitality_stock_items CASCADE;
DROP TABLE IF EXISTS public.hospitality_stock_movements CASCADE;
DROP TABLE IF EXISTS public.hospitality_sync_log CASCADE;
DROP TABLE IF EXISTS public.hospitality_turnover CASCADE;

-- Cursor IDE telemetry (4 tables, ~720k rows)
DROP TABLE IF EXISTS public.cursor_conversations CASCADE;
DROP TABLE IF EXISTS public.cursor_daily_stats CASCADE;
DROP TABLE IF EXISTS public.cursor_model_usage CASCADE;
DROP TABLE IF EXISTS public.cursor_sync_status CASCADE;

-- Scraper (3 tables, projet séparé)
DROP TABLE IF EXISTS public.scraper_assets CASCADE;
DROP TABLE IF EXISTS public.scraper_configs CASCADE;
DROP TABLE IF EXISTS public.scraper_jobs CASCADE;

-- Clawd (3 tables, ancien projet IA)
DROP TABLE IF EXISTS public.clawd_memory CASCADE;
DROP TABLE IF EXISTS public.clawd_missions CASCADE;
DROP TABLE IF EXISTS public.clawd_secrets CASCADE;

-- E-commerce (7 tables, pas Hearst OS)
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.invoice_items CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.discount_codes CASCADE;

-- Misc orphelines (4 tables)
DROP TABLE IF EXISTS public.inventory_logs CASCADE;
DROP TABLE IF EXISTS public.demo_requests CASCADE;
DROP TABLE IF EXISTS public.merge_connections CASCADE;
DROP TABLE IF EXISTS public.tenant_integrations CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;

COMMIT;
