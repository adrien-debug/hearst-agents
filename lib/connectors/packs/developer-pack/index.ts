/**
 * Developer Pack — Public API
 *
 * Architecture Finale: lib/connectors/packs/developer-pack/
 * Provides: GitHub, Jira, Linear connectors
 */

// Schemas
export * from "./schemas/github";

// Mappers
export {
  mapGitHubRepoToUnified,
  mapGitHubIssueToUnified,
  mapGitHubPullRequestToUnified,
  mapGitHubCommitToUnified,
  mapGitHubCodeSearchItemToUnified,
  mapGitHubReposToUnified,
  mapGitHubIssuesToUnified,
  mapGitHubPullRequestsToUnified,
  mapGitHubCommitsToUnified,
  mapGitHubCodeSearchItemsToUnified,
} from "./mappers/github";

// Services
export { GitHubApiService, GitHubApiError } from "./services/github";

// Auth
export {
  generateGitHubAuthUrl,
  exchangeGitHubCode,
  isTokenExpired,
  type GitHubOAuthConfig,
  type GitHubTokens,
} from "./auth/github";
