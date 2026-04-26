/**
 * Test GitHub OAuth Token
 * Usage: npx tsx scripts/test-github-token.ts
 */

import { GitHubApiService } from "../lib/connectors/packs/developer-pack/services/github";

const TOKEN = "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";

async function testGitHub() {
  console.log("🔍 Testing GitHub connection...\n");

  const github = new GitHubApiService({
    accessToken: TOKEN,
  });

  try {
    // Test 1: Get user repos
    console.log("1️⃣  Fetching your repositories...");
    const reposData = await github.listRepos({ per_page: 5 });
    const repos = reposData.results;
    console.log(`✅ Found ${repos.length} repos:`);
    repos.forEach((r) => console.log(`   - ${r.full_name} (${r.stargazers_count}⭐)`));

    if (repos.length > 0) {
      const repo = repos[0];

      // Test 2: Get repo issues
      console.log("\n2️⃣  Fetching issues from first repo...");
      const issuesData = await github.listIssues(
        repo.owner.login,
        repo.name,
        { state: "open", per_page: 3 }
      );
      const issues = issuesData.results;
      console.log(`✅ Found ${issues.length} issues`);

      // Test 3: Get recent commits
      console.log("\n3️⃣  Fetching recent commits...");
      const commitsData = await github.listCommits(
        repo.owner.login,
        repo.name,
        { per_page: 3 }
      );
      const commits = commitsData.results;
      console.log(`✅ Found ${commits.length} commits`);
    }

    // Test 4: Search code
    console.log("\n4️⃣  Searching code (example: 'react hooks')...");
    const searchData = await github.searchCode("react hooks language:typescript");
    console.log(`✅ Found ${searchData.totalCount} code results`);
    if (searchData.items.length > 0) {
      console.log(`   Sample: ${searchData.items[0].repository.full_name}`);
    }

    console.log("\n✅ All tests passed! GitHub token is working.");
  } catch (error) {
    console.error("\n❌ GitHub API error:", error);
    process.exit(1);
  }
}

testGitHub();
