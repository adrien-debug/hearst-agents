/**
 * GitHub Connector — Mappers
 *
 * Transformations GitHub API → Unified Developer types.
 * Path: lib/connectors/packs/developer-pack/mappers/github.ts
 */

import type {
  GitHubRepo,
  GitHubIssue,
  GitHubPullRequest,
  GitHubCommit,
  GitHubCodeSearchItem,
  UnifiedRepo,
  UnifiedIssue,
  UnifiedPullRequest,
  UnifiedCommit,
  UnifiedCodeSearchItem,
} from "../schemas/github";

/**
 * Map GitHub Repo → Unified Repo
 */
export function mapGitHubRepoToUnified(
  repo: GitHubRepo
): UnifiedRepo {
  return {
    id: repo.id.toString(),
    provider: "github",
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    url: repo.html_url,
    isPrivate: repo.private,
    language: repo.language,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    defaultBranch: repo.default_branch,
    createdAt: new Date(repo.created_at),
    updatedAt: new Date(repo.updated_at),
    raw: repo,
  };
}

/**
 * Map GitHub Issue → Unified Issue
 */
export function mapGitHubIssueToUnified(
  issue: GitHubIssue
): UnifiedIssue {
  return {
    id: issue.id.toString(),
    provider: "github",
    number: issue.number,
    title: issue.title,
    state: issue.state,
    body: issue.body,
    url: issue.html_url,
    author: {
      login: issue.user.login,
      avatarUrl: issue.user.avatar_url,
    },
    labels: issue.labels.map((l) => l.name),
    assignees: issue.assignees.map((a) => a.login),
    comments: issue.comments,
    createdAt: new Date(issue.created_at),
    updatedAt: new Date(issue.updated_at),
    closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
    raw: issue,
  };
}

/**
 * Map GitHub Pull Request → Unified Pull Request
 */
export function mapGitHubPullRequestToUnified(
  pr: GitHubPullRequest
): UnifiedPullRequest {
  return {
    id: pr.id.toString(),
    provider: "github",
    number: pr.number,
    title: pr.title,
    state: pr.state,
    body: pr.body,
    url: pr.html_url,
    author: {
      login: pr.user.login,
      avatarUrl: pr.user.avatar_url,
    },
    draft: pr.draft,
    labels: pr.labels.map((l) => l.name),
    assignees: pr.assignees.map((a) => a.login),
    reviewers: pr.requested_reviewers.map((r) => r.login),
    createdAt: new Date(pr.created_at),
    updatedAt: new Date(pr.updated_at),
    closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
    raw: pr,
  };
}

/**
 * Map GitHub Commit → Unified Commit
 */
export function mapGitHubCommitToUnified(
  commit: GitHubCommit
): UnifiedCommit {
  return {
    sha: commit.sha,
    provider: "github",
    message: commit.commit.message,
    url: commit.html_url,
    author: {
      name: commit.commit.author.name,
      email: commit.commit.author.email,
      login: commit.author?.login ?? null,
      avatarUrl: commit.author?.avatar_url,
    },
    date: new Date(commit.commit.author.date),
    raw: commit,
  };
}

/**
 * Map GitHub Code Search Item → Unified Code Search Item
 */
export function mapGitHubCodeSearchItemToUnified(
  item: GitHubCodeSearchItem
): UnifiedCodeSearchItem {
  return {
    name: item.name,
    path: item.path,
    url: item.html_url,
    repository: {
      name: item.repository.name,
      fullName: item.repository.full_name,
      url: item.repository.html_url,
    },
    provider: "github",
    raw: item,
  };
}

/**
 * Map multiple items
 */
export function mapGitHubReposToUnified(
  repos: GitHubRepo[]
): UnifiedRepo[] {
  return repos.map(mapGitHubRepoToUnified);
}

export function mapGitHubIssuesToUnified(
  issues: GitHubIssue[]
): UnifiedIssue[] {
  return issues.map(mapGitHubIssueToUnified);
}

export function mapGitHubPullRequestsToUnified(
  prs: GitHubPullRequest[]
): UnifiedPullRequest[] {
  return prs.map(mapGitHubPullRequestToUnified);
}

export function mapGitHubCommitsToUnified(
  commits: GitHubCommit[]
): UnifiedCommit[] {
  return commits.map(mapGitHubCommitToUnified);
}

export function mapGitHubCodeSearchItemsToUnified(
  items: GitHubCodeSearchItem[]
): UnifiedCodeSearchItem[] {
  return items.map(mapGitHubCodeSearchItemToUnified);
}
