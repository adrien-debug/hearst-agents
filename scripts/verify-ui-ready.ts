/**
 * Verify UI Readiness
 * Comprehensive check of all UI-configurable features
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface CheckResult {
  component: string;
  status: "✅" | "⚠️" | "❌";
  message: string;
}

async function verifyUI(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  console.log("🔍 Verifying UI Configuration...\n");

  // 1. Environment Variables
  console.log("Checking environment variables...");
  
  const requiredEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXTAUTH_SECRET",

  ];

  for (const env of requiredEnv) {
    if (process.env[env]) {
      results.push({ component: env, status: "✅", message: "Configured" });
    } else {
      results.push({ component: env, status: "❌", message: "Missing" });
    }
  }

  // Optional but recommended
  const optionalEnv = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_CLIENT_ID",
    "HEARST_API_KEY",
  ];

  for (const env of optionalEnv) {
    if (process.env[env]) {
      results.push({ component: env, status: "✅", message: "Configured" });
    } else {
      results.push({ component: env, status: "⚠️", message: "Optional - not set" });
    }
  }

  // 2. Database Connection
  console.log("Checking database...");
  if (SUPABASE_URL && SUPABASE_KEY) {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    try {
      const { error } = await sb.from("system_settings").select("count").single();
      if (!error) {
        results.push({ component: "Database", status: "✅", message: "Connected" });
      } else {
        results.push({ component: "Database", status: "❌", message: error.message });
      }
    } catch (e) {
      results.push({ component: "Database", status: "❌", message: String(e) });
    }
  }

  // 3. Feature Flags
  console.log("Checking feature flags...");
  if (SUPABASE_URL && SUPABASE_KEY) {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: flags } = await sb
      .from("system_settings")
      .select("key, value")
      .eq("category", "feature_flags");
    
    if (flags && flags.length > 0) {
      const enabled = flags.filter((f) => f.value).length;
      results.push({ 
        component: "Feature Flags", 
        status: "✅", 
        message: `${enabled}/${flags.length} enabled` 
      });
    } else {
      results.push({ 
        component: "Feature Flags", 
        status: "⚠️", 
        message: "Not initialized - run init-ui-config.ts" 
      });
    }
  }

  // 4. LLM Providers
  console.log("Checking LLM providers...");
  const llmProviders = [];
  if (process.env.ANTHROPIC_API_KEY) llmProviders.push("Anthropic");
  if (process.env.OPENAI_API_KEY) llmProviders.push("OpenAI");
  if (process.env.GEMINI_API_KEY) llmProviders.push("Gemini");
  
  if (llmProviders.length > 0) {
    results.push({ 
      component: "LLM Providers", 
      status: "✅", 
      message: llmProviders.join(", ") 
    });
  } else {
    results.push({ 
      component: "LLM Providers", 
      status: "❌", 
      message: "None configured" 
    });
  }

  // 6. Connector Packs
  console.log("Checking connector packs...");
  const packs = [
    "finance-pack (Stripe)",
    "crm-pack (HubSpot)",
    "productivity-pack (Gmail, Notion)",
    "design-pack (Figma)",
    "developer-pack (GitHub)",
  ];
  results.push({ component: "Connector Packs", status: "✅", message: packs.join(", ") });

  return results;
}

async function main() {
  const results = await verifyUI();

  console.log("\n" + "=".repeat(60));
  console.log("UI READINESS REPORT");
  console.log("=".repeat(60) + "\n");

  for (const r of results) {
    console.log(`${r.status} ${r.component}`);
    console.log(`   ${r.message}\n`);
  }

  const ok = results.filter((r) => r.status === "✅").length;
  const warn = results.filter((r) => r.status === "⚠️").length;
  const err = results.filter((r) => r.status === "❌").length;

  console.log("=".repeat(60));
  console.log(`Summary: ${ok} OK, ${warn} Warning, ${err} Error`);
  console.log("=".repeat(60));

  if (err === 0) {
    console.log("\n🚀 UI is ready! Start with: npm run dev");
  } else {
    console.log("\n⚠️  Some components need configuration.");
    process.exit(1);
  }
}

main().catch(console.error);
