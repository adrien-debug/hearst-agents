import { NextResponse } from "next/server";
import { loadArchitectureMap, invalidateCache } from "@/lib/architecture-map/load";
import { getArchitectureGraph, getReverseDependencies, getDownstreamDependencies } from "@/lib/architecture-map/graph";
import { requireScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error: authError } = await requireScope({ context: "GET /api/v2/architecture" });
  if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });

  try {
    invalidateCache();
    const map = loadArchitectureMap();
    const { nodes, edges } = getArchitectureGraph(map);

    const nodesWithImpact = nodes.map((n) => ({
      ...n,
      upstream: getReverseDependencies(n.id, map),
      downstream: getDownstreamDependencies(n.id, map),
    }));

    return NextResponse.json({
      meta: map.meta,
      nodes: nodesWithImpact,
      edges,
      flows: map.flows,
      agents: map.agents,
      raw: map,
    });
  } catch (e) {
    console.error("GET /api/v2/architecture:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load architecture map" },
      { status: 500 },
    );
  }
}
