/**
 * Productivity Pack — Public API
 *
 * Architecture Finale: lib/connectors/packs/productivity-pack/
 * Provides: Notion, Trello, Asana connectors
 */

// Schemas
export * from "./schemas/notion";

// Mappers
export {
  mapNotionPageToUnified,
  mapNotionDatabaseToUnified,
  mapNotionBlockToContent,
  mapNotionBlockToTask,
  mapNotionPagesToUnified,
  mapNotionDatabasesToUnified,
} from "./mappers/notion";

// Services
export { NotionApiService, NotionApiError } from "./services/notion";

// Auth
export {
  generateNotionAuthUrl,
  exchangeNotionCode,
  isNotionTokenExpired,
  type NotionOAuthConfig,
  type NotionTokens,
} from "./auth/notion";
