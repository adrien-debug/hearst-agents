/**
 * Database Schema Documentation — Architecture Finale
 *
 * Schema reference and documentation.
 * Path: lib/platform/db/schema.ts
 */

import type { Database } from "../../database.types";

/**
 * Core tables in the database
 */
export type Tables = Database["public"]["Tables"];

/**
 * Key tables:
 * - agents: Agent definitions
 * - runs: Execution runs
 * - conversations: Chat threads
 * - messages: Chat messages
 * - knowledge_bases: Knowledge sources
 * - integration_connections: Connected services
 */

export type AgentRow = Tables["agents"]["Row"];
export type RunRow = Tables["runs"]["Row"];
export type ConversationRow = Tables["conversations"]["Row"];
export type MessageRow = Tables["messages"]["Row"];
export type KnowledgeBaseRow = Tables["knowledge_bases"]["Row"];
export type IntegrationConnectionRow = Tables["integration_connections"]["Row"];
