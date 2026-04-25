/**
 * Database — Architecture Finale
 *
 * Central database exports.
 * Path: lib/platform/db/index.ts
 */

export {
  getServerSupabase,
  requireServerSupabase,
  type SupabaseClient,
  type Database,
} from "./supabase";

export type {
  Tables,
  AgentRow,
  RunRow,
  ConversationRow,
  MessageRow,
  KnowledgeBaseRow,
  IntegrationConnectionRow,
} from "./schema";
