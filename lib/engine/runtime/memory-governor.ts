import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type DB = SupabaseClient<Database>;

interface MemoryPolicy {
  max_entries: number;
  ttl_seconds: number | null;
  min_importance: number;
  auto_expire: boolean;
  dedup_strategy: string;
}

export async function enforceMemoryPolicy(
  sb: DB,
  agentId: string,
  policyId: string | null,
): Promise<{ expired: number; deduped: number; trimmed: number }> {
  let expired = 0;
  let deduped = 0;
  let trimmed = 0;

  let policy: MemoryPolicy | null = null;
  if (policyId) {
    const { data } = await sb
      .from("memory_policies")
      .select("max_entries, ttl_seconds, min_importance, auto_expire, dedup_strategy")
      .eq("id", policyId)
      .single();
    policy = data;
  }

  if (!policy) {
    policy = {
      max_entries: 1000,
      ttl_seconds: null,
      min_importance: 0,
      auto_expire: true,
      dedup_strategy: "latest",
    };
  }

  // 1. Expire by TTL
  if (policy.auto_expire && policy.ttl_seconds) {
    const cutoff = new Date(Date.now() - policy.ttl_seconds * 1000).toISOString();
    const { data: expiredRows } = await sb
      .from("agent_memory")
      .delete()
      .eq("agent_id", agentId)
      .lt("last_accessed_at", cutoff)
      .select("id");
    expired = expiredRows?.length ?? 0;
  }

  // 2. Expire by expires_at
  if (policy.auto_expire) {
    const now = new Date().toISOString();
    const { data: expiredByDate } = await sb
      .from("agent_memory")
      .delete()
      .eq("agent_id", agentId)
      .lt("expires_at", now)
      .not("expires_at", "is", null)
      .select("id");
    expired += expiredByDate?.length ?? 0;
  }

  // 3. Remove below min importance
  if (policy.min_importance > 0) {
    const { data: lowImportance } = await sb
      .from("agent_memory")
      .delete()
      .eq("agent_id", agentId)
      .lt("importance", policy.min_importance)
      .select("id");
    trimmed += lowImportance?.length ?? 0;
  }

  // 4. Dedup by key
  const { data: allMemories } = await sb
    .from("agent_memory")
    .select("id, key, importance, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (allMemories) {
    const seen = new Map<string, string>();
    const toDelete: string[] = [];

    for (const mem of allMemories) {
      if (seen.has(mem.key)) {
        if (policy.dedup_strategy === "highest_importance") {
          const existingId = seen.get(mem.key)!;
          const existing = allMemories.find((m) => m.id === existingId);
          if (existing && mem.importance > existing.importance) {
            toDelete.push(existingId);
            seen.set(mem.key, mem.id);
          } else {
            toDelete.push(mem.id);
          }
        } else {
          // "latest" — keep first seen (already sorted by created_at desc)
          toDelete.push(mem.id);
        }
      } else {
        seen.set(mem.key, mem.id);
      }
    }

    if (toDelete.length > 0) {
      await sb.from("agent_memory").delete().in("id", toDelete);
      deduped = toDelete.length;
    }
  }

  // 5. Trim to max_entries (keep highest importance)
  const { count } = await sb
    .from("agent_memory")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId);

  if (count && count > policy.max_entries) {
    const overflow = count - policy.max_entries;
    const { data: toTrim } = await sb
      .from("agent_memory")
      .select("id")
      .eq("agent_id", agentId)
      .order("importance", { ascending: true })
      .order("last_accessed_at", { ascending: true })
      .limit(overflow);

    if (toTrim && toTrim.length > 0) {
      await sb.from("agent_memory").delete().in("id", toTrim.map((r) => r.id));
      trimmed += toTrim.length;
    }
  }

  return { expired, deduped, trimmed };
}
