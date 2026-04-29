/**
 * Verrouille le contrat d'`isPlaceholderAssetId` — utilisé par
 * CockpitInbox + AssetStage pour ne pas naviguer vers un asset bidon.
 */

import { describe, it, expect } from "vitest";
import { isPlaceholderAssetId } from "@/lib/ui/asset-id";

describe("isPlaceholderAssetId", () => {
  it("retourne true pour null/undefined/string vide/whitespace", () => {
    expect(isPlaceholderAssetId(null)).toBe(true);
    expect(isPlaceholderAssetId(undefined)).toBe(true);
    expect(isPlaceholderAssetId("")).toBe(true);
    expect(isPlaceholderAssetId("   ")).toBe(true);
  });

  it("retourne true pour les UUIDs fixtures préfixés 00000000-0000-4000-8000-", () => {
    // SpecId catalogue (lib/reports/catalog/founder-cockpit.ts)
    expect(isPlaceholderAssetId("00000000-0000-4000-8000-100000000001")).toBe(true);
    // Asset id mock e2e (e2e/reports/suggestion-flow.spec.ts)
    expect(isPlaceholderAssetId("00000000-0000-4000-8000-200000000001")).toBe(true);
    // SpecId tests router-providers
    expect(isPlaceholderAssetId("00000000-0000-4000-8000-0000000000a1")).toBe(true);
  });

  it("retourne false pour un UUID v4 réel", () => {
    expect(isPlaceholderAssetId("b1a49f2e-cc59-4010-a5f4-27dd4dd35250")).toBe(false);
    expect(isPlaceholderAssetId("eed3cb00-26e6-481b-81f9-2e3de0dce1e5")).toBe(false);
    expect(isPlaceholderAssetId("f09712aa-e43d-4deb-9e70-ee7ce578db19")).toBe(false);
  });
});
