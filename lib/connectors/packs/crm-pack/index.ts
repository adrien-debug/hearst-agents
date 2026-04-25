/**
 * CRM Pack — Public API
 *
 * Architecture Finale: lib/connectors/packs/crm-pack/
 * Provides: HubSpot, Salesforce connectors
 */

// Schemas
export * from "./schemas/hubspot";

// Mappers
export {
  mapHubSpotContactToUnified,
  mapHubSpotCompanyToUnified,
  mapHubSpotDealToUnified,
  mapHubSpotContactsToUnified,
  mapHubSpotCompaniesToUnified,
  mapHubSpotDealsToUnified,
} from "./mappers/hubspot";

// Services
export { HubSpotApiService, HubSpotApiError } from "./services/hubspot";

// Auth
export {
  generateHubSpotAuthUrl,
  exchangeHubSpotCode,
  refreshHubSpotToken,
  isTokenExpired,
  type HubSpotOAuthConfig,
  type HubSpotTokens,
} from "./auth/hubspot";
