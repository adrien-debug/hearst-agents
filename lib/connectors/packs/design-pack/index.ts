/**
 * Design Pack — Public API
 *
 * Architecture Finale: lib/connectors/packs/design-pack/
 * Provides: Figma, Adobe, Canva connectors
 */

// Schemas
export * from "./schemas/figma";

// Mappers
export {
  mapFigmaFileToUnified,
  mapFigmaComponentToUnified,
  mapFigmaVariableToUnified,
  mapFigmaStyleToUnified,
  mapFigmaCommentToText,
  mapFigmaFilesToUnified,
  mapFigmaVariablesToUnified,
} from "./mappers/figma";

// Services
export { FigmaApiService, FigmaApiError } from "./services/figma";

// Auth
export {
  generateFigmaAuthUrl,
  exchangeFigmaCode,
  refreshFigmaToken,
  isFigmaTokenExpired,
  type FigmaOAuthConfig,
  type FigmaTokens,
} from "./auth/figma";
