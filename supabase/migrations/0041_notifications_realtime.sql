-- Migration 0041 : Active Supabase Realtime sur in_app_notifications
-- Requis pour que le store front-end reçoive les INSERT en temps réel
-- sans polling.

alter publication supabase_realtime add table in_app_notifications;
