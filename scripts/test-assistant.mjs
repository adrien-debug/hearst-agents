/**
 * Script de test pour OpenAI Assistants Backend
 *
 * Usage: node scripts/test-assistant.mjs
 */

import { testAssistantBackend } from "../lib/agents/backend-v2/openai-assistant.ts";

async function main() {
  console.log("🔍 Testing OpenAI Assistant Backend...\n");

  const startTime = Date.now();
  const result = await testAssistantBackend();
  const duration = Date.now() - startTime;

  console.log("\n📊 Result:");
  console.log(JSON.stringify(result, null, 2));
  console.log(`\n⏱️ Duration: ${duration}ms`);

  if (result.ok) {
    console.log("\n✅ Test PASSED");
    process.exit(0);
  } else {
    console.log("\n❌ Test FAILED");
    process.exit(1);
  }
}

main();
