/**
 * Test Nango + GitHub Integration
 * Usage: npx tsx scripts/test-nango-github.ts
 */

import { getNangoClient, isNangoEnabled } from "../lib/connectors/nango/client";

const USER_ID = "adrien@hearstcorporation.io";

async function testNangoGitHub() {
  console.log("🔍 Testing Nango + GitHub integration...\n");

  // Check if Nango is configured
  if (!isNangoEnabled()) {
    console.error("❌ NANGO_SECRET_KEY not configured");
    process.exit(1);
  }

  console.log("✅ Nango is enabled");

  try {
    const nango = getNangoClient();

    // List all connections for this user
    console.log("\n1️⃣  Listing Nango connections...");
    const result = await nango.listConnections();
    const connections = result.connections || [];
    console.log(`   Found ${connections.length} total connections`);

    // Find GitHub connection
    const githubConnection = connections.find(
      (c: { provider: string; connection_id: string }) => c.provider === "github"
    );

    if (!githubConnection) {
      console.log("\n⚠️  No GitHub connection found");
      console.log("   Go to /apps and connect GitHub first");
      return;
    }

    console.log(`\n✅ GitHub connection found:`);
    console.log(`   Connection ID: ${githubConnection.connection_id}`);
    console.log(`   Provider: ${githubConnection.provider}`);

    // Get connection details (with token)
    console.log("\n2️⃣  Getting GitHub connection details...");
    const connection = await nango.getConnection(
      githubConnection.connection_id,
      "github"
    );

    console.log(`   ✅ Connection active`);

    // Test GitHub API via Nango Proxy
    console.log("\n3️⃣  Testing GitHub API via Nango Proxy...");
    const repos = await nango.proxy({
      connectionId: githubConnection.connection_id,
      providerConfigKey: "github",
      endpoint: "/user/repos",
      method: "GET",
    });

    console.log(`   ✅ GitHub API working!`);
    console.log(`   Found ${repos.data.length} repositories`);

    if (repos.data.length > 0) {
      console.log(`\n   Sample repos:`);
      repos.data.slice(0, 3).forEach((r: { full_name: string; stargazers_count: number }) => {
        console.log(`     - ${r.full_name} (${r.stargazers_count}⭐)`);
      });
    }

    console.log("\n✅ Nango + GitHub integration fully working!");
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

testNangoGitHub();
