/**
 * GET /api/v2/agents/capabilities
 *
 * Returns the list of specialized agents and their capabilities,
 * including associated connector packs.
 */

import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

interface AgentCapability {
  id: string;
  name: string;
  description: string;
  operations: string[];
  connectorPack: string | null;
  connectors: string[];
}

const AGENTS: AgentCapability[] = [
  {
    id: "FinanceAgent",
    name: "Finance Agent",
    description: "Stripe payments, invoices, subscriptions, and revenue analytics",
    operations: [
      "get_payments",
      "get_invoices",
      "get_subscriptions",
      "get_revenue_metrics",
      "create_invoice",
      "refund_payment",
    ],
    connectorPack: "finance-pack",
    connectors: ["stripe"],
  },
  {
    id: "CRMAgent",
    name: "CRM Agent",
    description: "Contact management, deal tracking, and pipeline analytics via HubSpot",
    operations: [
      "list_contacts",
      "get_contact",
      "create_contact",
      "list_deals",
      "get_deal",
      "search_contacts",
    ],
    connectorPack: "crm-pack",
    connectors: ["hubspot"],
  },
  {
    id: "ProductivityAgent",
    name: "Productivity Agent",
    description: "Notion page management, database queries, and workspace search",
    operations: [
      "search_pages",
      "get_page",
      "create_page",
      "query_database",
      "list_databases",
    ],
    connectorPack: "productivity-pack",
    connectors: ["notion"],
  },
  {
    id: "DesignAgent",
    name: "Design Agent",
    description: "Figma file management, component inspection, and design system access",
    operations: [
      "list_files",
      "get_file",
      "get_components",
      "get_styles",
      "export_assets",
    ],
    connectorPack: "design-pack",
    connectors: ["figma"],
  },
  {
    id: "DeveloperAgent",
    name: "Developer Agent",
    description: "GitHub repos, issues, PRs, commits, and code search",
    operations: [
      "list_repos",
      "get_repo",
      "list_issues",
      "get_issue",
      "list_pull_requests",
      "get_pull_request",
      "list_commits",
      "search_code",
      "get_file_content",
    ],
    connectorPack: "developer-pack",
    connectors: ["github", "jira", "linear"],
  },
];

export async function GET() {
  const { error } = await requireScope({ context: "GET /api/v2/agents/capabilities" });
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const packsDir = path.join(process.cwd(), "lib/connectors/packs");
  const packs: Record<string, unknown>[] = [];

  try {
    const packDirs = fs.readdirSync(packsDir).filter((d) => d.endsWith("-pack"));
    for (const dir of packDirs) {
      const manifestPath = path.join(packsDir, dir, "manifest.json");
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        packs.push(manifest);
      }
    }
  } catch {
    // Packs dir may not exist in all environments
  }

  return NextResponse.json({
    agents: AGENTS,
    packs,
    total: AGENTS.length,
  });
}
