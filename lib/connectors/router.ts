/**
 * Connector Router
 *
 * Route les requêtes vers:
 * - Connector Packs (nouveau) si disponible
 * - Nango (legacy) en fallback
 *
 * Pattern: Strangler Fig — migration progressive sans breaking changes
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPackLoader } from "./packs";
import { getNangoClient } from "./nango/client";
import type { ConnectorManifest } from "./packs/types";

export interface RouterContext {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
}

export interface RouterResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  source: "pack" | "nango" | "none";
  latencyMs: number;
}

/**
 * Route une requête connector
 */
export async function routeConnectorRequest<T>(
  connectorId: string,
  operation: string,
  params: unknown,
  context: RouterContext
): Promise<RouterResult<T>> {
  const start = Date.now();

  const packLoader = getPackLoader();
  const packConnector = packLoader.getConnector(connectorId);

  if (packConnector) {
    const result = await executePackOperation<T>(
      packConnector,
      operation,
      params,
      context
    );

    if (result.success) {
      return {
        ...result,
        source: "pack",
        latencyMs: Date.now() - start,
      };
    }

    console.warn(
      `[Router] Pack ${connectorId} failed, trying Nango fallback: ${result.error}`
    );
  }

  const nangoResult = await executeNangoOperation<T>(
    connectorId,
    operation,
    params,
    context
  );

  return {
    ...nangoResult,
    source: nangoResult.success ? "nango" : "none",
    latencyMs: Date.now() - start,
  };
}

async function executePackOperation<T>(
  manifest: ConnectorManifest,
  operation: string,
  params: unknown,
  context: RouterContext
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const isEnabled = await checkConnectorEnabled(
      manifest.id,
      context.tenantId,
      context.userId,
      context.db
    );

    if (!isEnabled) {
      return {
        success: false,
        error: `Connector ${manifest.id} not enabled for this user`,
      };
    }

    const credentials = await getPackCredentials(
      manifest.id,
      context.tenantId,
      context.userId,
      context.db
    );

    if (!credentials) {
      return {
        success: false,
        error: `No credentials for ${manifest.id}. Please connect first.`,
      };
    }

    switch (manifest.id) {
      case "stripe":
        return await executeStripeOperation<T>(
          operation,
          params,
          credentials,
          context
        );
      case "hubspot":
        return await executeHubSpotOperation<T>(
          operation,
          params,
          credentials,
          context
        );
      case "notion":
        return await handleNotion<T>(
          operation,
          params,
          credentials
        );
      case "figma":
        return await handleFigma<T>(
          operation,
          params,
          credentials
        );
      case "github":
        return await executeGitHubOperation<T>(
          operation,
          params,
          credentials,
          context
        );
      default:
        return {
          success: false,
          error: `Pack connector ${manifest.id} not yet implemented`,
        };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function executeNangoOperation<T>(
  connectorId: string,
  operation: string,
  params: unknown,
  context: RouterContext
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const nango = getNangoClient();

    const response = await nango.proxy({
      providerConfigKey: connectorId,
      connectionId: `${context.tenantId}:${context.userId}`,
      method: getHttpMethod(operation),
      endpoint: getNangoEndpoint(connectorId, operation, params),
      data: operation !== "get" && operation !== "list" ? params : undefined,
    });

    return {
      success: true,
      data: response.data as T,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkConnectorEnabled(
  connectorId: string,
  tenantId: string,
  userId: string,
  db: SupabaseClient
): Promise<boolean> {
  const { data, error } = await db
    .from("connector_instances")
    .select("status")
    .eq("connector_id", connectorId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return data.status === "active";
}

async function getPackCredentials(
  connectorId: string,
  tenantId: string,
  userId: string,
  db: SupabaseClient
): Promise<Record<string, string> | null> {
  const { data, error } = await db
    .from("connector_instances")
    .select("config")
    .eq("connector_id", connectorId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.config) {
    return null;
  }

  return data.config as Record<string, string>;
}

async function executeStripeOperation<T>(
  operation: string,
  params: unknown,
  credentials: Record<string, string>,
  _context: RouterContext
): Promise<{ success: boolean; data?: T; error?: string }> {
  const { StripeApiService, mapStripeChargesToPayments } = await import(
    "./packs/finance-pack"
  );

  const stripe = new StripeApiService({
    apiKey: credentials.accessToken || credentials.apiKey || "",
  });

  try {
    switch (operation) {
      case "list": {
        const resource = (params as { resource?: string }).resource;

        if (resource === "payments" || resource === "charges") {
          const charges = await stripe.listCharges();
          return { success: true, data: mapStripeChargesToPayments(charges) as T };
        }

        if (resource === "invoices") {
          const invoices = await stripe.listInvoices();
          return { success: true, data: invoices as T };
        }

        if (resource === "subscriptions") {
          const subs = await stripe.listSubscriptions();
          return { success: true, data: subs as T };
        }

        if (resource === "customers") {
          const customers = await stripe.listCustomers();
          return { success: true, data: customers as T };
        }

        if (resource === "balance") {
          const balance = await stripe.getBalance();
          return { success: true, data: balance as T };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      case "get": {
        const { resource, id } = params as { resource: string; id?: string };

        if (resource === "charge" && id) {
          const charge = await stripe.getCharge(id);
          return { success: true, data: charge as T };
        }

        if (resource === "invoice" && id) {
          const invoice = await stripe.getInvoice(id);
          return { success: true, data: invoice as T };
        }

        if (resource === "subscription" && id) {
          const sub = await stripe.getSubscription(id);
          return { success: true, data: sub as T };
        }

        if (resource === "customer" && id) {
          const customer = await stripe.getCustomer(id);
          return { success: true, data: customer as T };
        }

        if (resource === "health") {
          const balance = await stripe.getBalance();
          return { success: true, data: { status: "ok", hasBalance: !!balance } as T };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      default:
        return { success: false, error: `Operation ${operation} not supported` };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function executeHubSpotOperation<T>(
  operation: string,
  params: unknown,
  credentials: Record<string, string>,
  _context: RouterContext
): Promise<{ success: boolean; data?: T; error?: string }> {
  const { HubSpotApiService, mapHubSpotContactsToUnified, mapHubSpotCompaniesToUnified, mapHubSpotDealsToUnified } = await import(
    "./packs/crm-pack"
  );

  const hubspot = new HubSpotApiService({
    accessToken: credentials.accessToken || "",
  });

  try {
    switch (operation) {
      case "list": {
        const resource = (params as { resource?: string }).resource;
        const limit = (params as { limit?: number }).limit ?? 100;

        if (resource === "contacts") {
          const result = await hubspot.listContacts({ limit });
          return { success: true, data: mapHubSpotContactsToUnified(result.results) as T };
        }

        if (resource === "companies") {
          const result = await hubspot.listCompanies({ limit });
          return { success: true, data: mapHubSpotCompaniesToUnified(result.results) as T };
        }

        if (resource === "deals") {
          const result = await hubspot.listDeals({ limit });
          return { success: true, data: mapHubSpotDealsToUnified(result.results) as T };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      case "get": {
        const { resource, id } = params as { resource: string; id: string };

        if (resource === "contact") {
          const contact = await hubspot.getContact(id);
          return { success: !!contact, data: contact as T, error: contact ? undefined : "Contact not found" };
        }

        if (resource === "company") {
          const company = await hubspot.getCompany(id);
          return { success: !!company, data: company as T, error: company ? undefined : "Company not found" };
        }

        if (resource === "deal") {
          const deal = await hubspot.getDeal(id);
          return { success: !!deal, data: deal as T, error: deal ? undefined : "Deal not found" };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      case "search": {
        const { query } = params as { query: string };
        const contacts = await hubspot.searchContacts(query);
        return { success: true, data: mapHubSpotContactsToUnified(contacts) as T };
      }

      default:
        return { success: false, error: `Operation ${operation} not supported` };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleNotion<T>(
  operation: string,
  params: unknown,
  credentials: Record<string, string>
): Promise<{ success: boolean; data?: T; error?: string }> {
  const { NotionApiService } = await import("./packs/productivity-pack");

  const notion = new NotionApiService({
    accessToken: credentials.accessToken || "",
  });

  try {
    switch (operation) {
      case "list": {
        const resource = (params as { resource?: string }).resource;

        if (resource === "pages") {
          const searchRes = await notion.search("", { pageSize: 100 });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pageList = searchRes.results.filter((r: any) => r.object === "page");
          return { success: true, data: pageList as T };
        }

        if (resource === "databases") {
          const searchRes = await notion.search("", { pageSize: 100 });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dbList = searchRes.results.filter((r: any) => r.object === "database");
          return { success: true, data: dbList as T };
        }

        if (resource === "users") {
          const userRes = await notion.listUsers({ pageSize: 100 });
          return { success: true, data: userRes.results as T };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      case "get": {
        const { resource, id } = params as { resource: string; id: string };

        if (resource === "page") {
          const page = await notion.getPage(id);
          return { success: !!page, data: page as T, error: page ? undefined : "Page not found" };
        }

        if (resource === "database") {
          const db = await notion.getDatabase(id);
          return { success: !!db, data: db as T, error: db ? undefined : "Database not found" };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      case "search": {
        const { query } = params as { query: string };
        const searchRes = await notion.search(query);
        return { success: true, data: searchRes.results as T };
      }

      case "query": {
        const { databaseId, filter } = params as { databaseId: string; filter?: Record<string, unknown> };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryRes = await notion.queryDatabase(databaseId, { filter } as any);
        return { success: true, data: queryRes.results as T };
      }

      default:
        return { success: false, error: `Operation ${operation} not supported` };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function executeGitHubOperation<T>(
  operation: string,
  params: unknown,
  credentials: Record<string, string>,
  _context: RouterContext
): Promise<{ success: boolean; data?: T; error?: string }> {
  const { GitHubApiService, mapGitHubReposToUnified, mapGitHubIssuesToUnified, mapGitHubPullRequestsToUnified, mapGitHubCommitsToUnified, mapGitHubCodeSearchItemsToUnified } = await import(
    "./packs/developer-pack"
  );

  const github = new GitHubApiService({
    accessToken: credentials.accessToken || "",
  });

  try {
    switch (operation) {
      case "list": {
        const resource = (params as { resource?: string }).resource;
        const limit = (params as { limit?: number }).limit ?? 30;

        if (resource === "repos") {
          const result = await github.listRepos({ per_page: limit });
          return { success: true, data: mapGitHubReposToUnified(result.results) as T };
        }

        const owner = (params as { owner?: string }).owner;
        const repo = (params as { repo?: string }).repo;

        if (resource === "issues" && owner && repo) {
          const result = await github.listIssues(owner, repo, { per_page: limit });
          return { success: true, data: mapGitHubIssuesToUnified(result.results) as T };
        }

        if (resource === "pull_requests" && owner && repo) {
          const result = await github.listPullRequests(owner, repo, { per_page: limit });
          return { success: true, data: mapGitHubPullRequestsToUnified(result.results) as T };
        }

        if (resource === "commits" && owner && repo) {
          const result = await github.listCommits(owner, repo, { per_page: limit });
          return { success: true, data: mapGitHubCommitsToUnified(result.results) as T };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      case "get": {
        const { resource, id } = params as { resource: string; id?: string | number };
        const owner = (params as { owner?: string }).owner;
        const repo = (params as { repo?: string }).repo;

        if (resource === "repo" && owner && repo) {
          const repository = await github.getRepo(owner, repo);
          return { success: !!repository, data: repository as T, error: repository ? undefined : "Repo not found" };
        }

        if (resource === "issue" && owner && repo && typeof id === "number") {
          const issue = await github.getIssue(owner, repo, id);
          return { success: !!issue, data: issue as T, error: issue ? undefined : "Issue not found" };
        }

        if (resource === "pull_request" && owner && repo && typeof id === "number") {
          const pr = await github.getPullRequest(owner, repo, id);
          return { success: !!pr, data: pr as T, error: pr ? undefined : "Pull request not found" };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      case "search": {
        const resource = (params as { resource?: string }).resource;
        const { query } = params as { query: string };

        if (resource === "code") {
          const result = await github.searchCode(query);
          return { success: true, data: { totalCount: result.totalCount, items: mapGitHubCodeSearchItemsToUnified(result.items) } as T };
        }

        if (resource === "issues") {
          const result = await github.searchIssues(query);
          return { success: true, data: { totalCount: result.totalCount, items: mapGitHubIssuesToUnified(result.items) } as T };
        }

        return { success: false, error: `Unknown search resource: ${resource}` };
      }

      default:
        return { success: false, error: `Operation ${operation} not supported` };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleFigma<T>(
  operation: string,
  params: unknown,
  credentials: Record<string, string>
): Promise<{ success: boolean; data?: T; error?: string }> {
  const { FigmaApiService } = await import("./packs/design-pack");

  const figma = new FigmaApiService({
    accessToken: credentials.accessToken || "",
  });

  try {
    switch (operation) {
      case "list": {
        const resource = (params as { resource?: string }).resource;

        if (resource === "files") {
          const user = await figma.getCurrentUser();
          return { success: true, data: [{ id: user.id, name: "User files" }] as T };
        }

        if (resource === "projects") {
          const teams = await figma.getUserTeams();
          const allProjects: unknown[] = [];
          for (const team of teams.teams.slice(0, 3)) {
            const projects = await figma.getTeamProjects(team.id);
            allProjects.push(...projects.projects);
          }
          return { success: true, data: allProjects as T };
        }

        if (resource === "components") {
          const { fileKey } = params as { fileKey: string };
          const compRes = await figma.getFileComponents(fileKey);
          return { success: true, data: Object.values(compRes.components) as T };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      case "get": {
        const { resource, id } = params as { resource: string; id: string };

        if (resource === "file") {
          const file = await figma.getFile(id);
          return { success: true, data: file as T };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      case "search": {
        // Figma API doesn't have a search endpoint
        // Return user teams as a proxy for discoverable content
        const teams = await figma.getUserTeams();
        return { success: true, data: teams.teams as T };
      }

      case "get_variables": {
        const { fileKey } = params as { fileKey: string };
        const varRes = await figma.getLocalVariables(fileKey);
        const varList = Object.values(varRes.meta.variables);
        return { success: true, data: varList as T };
      }

      case "get_comments": {
        const { fileKey } = params as { fileKey: string };
        const commentRes = await figma.getComments(fileKey);
        return { success: true, data: commentRes.comments as T };
      }

      default:
        return { success: false, error: `Operation ${operation} not supported` };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function getHttpMethod(operation: string): "GET" | "POST" | "PUT" | "DELETE" {
  switch (operation) {
    case "list":
    case "get":
    case "search":
      return "GET";
    case "create":
      return "POST";
    case "update":
    case "query":
      return "PUT";
    case "delete":
      return "DELETE";
    default:
      return "GET";
  }
}

function getNangoEndpoint(
  connectorId: string,
  operation: string,
  params: unknown
): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = params as Record<string, any>;

  switch (connectorId) {
    case "gmail":
      return operation === "list" ? "/threads" : `/messages/${p?.id ?? ""}`;
    case "slack":
      return operation === "list" ? "/conversations.list" : "/chat.postMessage";
    case "github": {
      if (operation === "list") return "/user/repos";
      const { owner, repo } = p ?? {};
      return `/repos/${owner ?? ""}/${repo ?? ""}`;
    }
    default:
      return "/";
  }
}

export function getRouterStats(): {
  availablePacks: number;
  legacyConnectors: number;
  routingTable: Array<{ id: string; source: "pack" | "nango" | "both" }>;
} {
  const packLoader = getPackLoader();
  const packs = packLoader.getAllConnectors();

  const legacyConnectors = [
    "gmail", "slack", "google-drive", "google-calendar", "github",
    "jira", "trello", "asana", "notion", "airtable", "hubspot", "salesforce",
  ];

  const routingTable: Array<{ id: string; source: "pack" | "nango" | "both" }> = [];

  for (const pack of packs) {
    const hasNango = legacyConnectors.includes(pack.id);
    routingTable.push({
      id: pack.id,
      source: hasNango ? "both" : "pack",
    });
  }

  for (const legacy of legacyConnectors) {
    if (!packs.find((p) => p.id === legacy)) {
      routingTable.push({ id: legacy, source: "nango" });
    }
  }

  return {
    availablePacks: packs.length,
    legacyConnectors: legacyConnectors.length,
    routingTable,
  };
}
