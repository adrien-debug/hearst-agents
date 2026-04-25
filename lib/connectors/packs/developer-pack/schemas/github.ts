/**
 * GitHub Connector — Zod Schemas
 *
 * Validation des types GitHub API.
 * Path: lib/connectors/packs/developer-pack/schemas/github.ts
 */

import { z } from "zod";

// GitHub Repository
export const GitHubRepoSchema = z.object({
  id: z.number(),
  node_id: z.string(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  owner: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string().optional(),
    html_url: z.string().optional(),
    type: z.string(),
  }),
  html_url: z.string(),
  description: z.string().nullable(),
  fork: z.boolean(),
  url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string(),
  homepage: z.string().nullable().optional(),
  size: z.number(),
  stargazers_count: z.number(),
  watchers_count: z.number(),
  language: z.string().nullable(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  default_branch: z.string(),
});

export type GitHubRepo = z.infer<typeof GitHubRepoSchema>;

// GitHub Issue
export const GitHubIssueSchema = z.object({
  id: z.number(),
  node_id: z.string(),
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  locked: z.boolean(),
  user: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string().optional(),
    html_url: z.string().optional(),
    type: z.string(),
  }),
  labels: z.array(z.object({
    id: z.number(),
    node_id: z.string(),
    name: z.string(),
    color: z.string(),
    description: z.string().nullable().optional(),
  })),
  assignees: z.array(z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string().optional(),
    html_url: z.string().optional(),
    type: z.string(),
  })),
  comments: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  body: z.string().nullable(),
  html_url: z.string(),
});

export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

// GitHub Pull Request
export const GitHubPullRequestSchema = z.object({
  id: z.number(),
  node_id: z.string(),
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  locked: z.boolean(),
  user: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string().optional(),
    html_url: z.string().optional(),
    type: z.string(),
  }),
  body: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  merged_at: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
  assignees: z.array(z.object({
    login: z.string(),
    id: z.number(),
  })),
  requested_reviewers: z.array(z.object({
    login: z.string(),
    id: z.number(),
  })),
  labels: z.array(z.object({
    name: z.string(),
    color: z.string(),
  })),
  draft: z.boolean(),
  html_url: z.string(),
});

export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;

// GitHub Commit
export const GitHubCommitSchema = z.object({
  sha: z.string(),
  node_id: z.string(),
  commit: z.object({
    author: z.object({
      name: z.string(),
      email: z.string(),
      date: z.string(),
    }),
    committer: z.object({
      name: z.string(),
      email: z.string(),
      date: z.string(),
    }),
    message: z.string(),
  }),
  author: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string().optional(),
  }).nullable(),
  committer: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string().optional(),
  }).nullable(),
  html_url: z.string(),
});

export type GitHubCommit = z.infer<typeof GitHubCommitSchema>;

// GitHub Search Code Result
export const GitHubCodeSearchItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  url: z.string(),
  git_url: z.string(),
  html_url: z.string(),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    html_url: z.string(),
  }),
});

export type GitHubCodeSearchItem = z.infer<typeof GitHubCodeSearchItemSchema>;

// GitHub Search Response
export const GitHubSearchResponseSchema = z.object({
  total_count: z.number(),
  incomplete_results: z.boolean(),
  items: z.array(z.unknown()),
});

export type GitHubSearchResponse = z.infer<typeof GitHubSearchResponseSchema>;

// Unified Developer Types
export const UnifiedRepoSchema = z.object({
  id: z.string(),
  provider: z.literal("github"),
  name: z.string(),
  fullName: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  isPrivate: z.boolean(),
  language: z.string().nullable(),
  stars: z.number(),
  forks: z.number(),
  openIssues: z.number(),
  defaultBranch: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  raw: z.unknown(),
});

export type UnifiedRepo = z.infer<typeof UnifiedRepoSchema>;

export const UnifiedIssueSchema = z.object({
  id: z.string(),
  provider: z.literal("github"),
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  body: z.string().nullable(),
  url: z.string(),
  author: z.object({
    login: z.string(),
    avatarUrl: z.string().optional(),
  }),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  comments: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  closedAt: z.date().nullable(),
  raw: z.unknown(),
});

export type UnifiedIssue = z.infer<typeof UnifiedIssueSchema>;

export const UnifiedPullRequestSchema = z.object({
  id: z.string(),
  provider: z.literal("github"),
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  body: z.string().nullable(),
  url: z.string(),
  author: z.object({
    login: z.string(),
    avatarUrl: z.string().optional(),
  }),
  draft: z.boolean(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  reviewers: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
  closedAt: z.date().nullable(),
  mergedAt: z.date().nullable(),
  raw: z.unknown(),
});

export type UnifiedPullRequest = z.infer<typeof UnifiedPullRequestSchema>;

export const UnifiedCommitSchema = z.object({
  sha: z.string(),
  provider: z.literal("github"),
  message: z.string(),
  url: z.string(),
  author: z.object({
    name: z.string(),
    email: z.string(),
    login: z.string().nullable(),
    avatarUrl: z.string().optional(),
  }),
  date: z.date(),
  raw: z.unknown(),
});

export type UnifiedCommit = z.infer<typeof UnifiedCommitSchema>;

export const UnifiedCodeSearchItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  url: z.string(),
  repository: z.object({
    name: z.string(),
    fullName: z.string(),
    url: z.string(),
  }),
  provider: z.literal("github"),
  raw: z.unknown(),
});

export type UnifiedCodeSearchItem = z.infer<typeof UnifiedCodeSearchItemSchema>;
