/**
 * Platform Settings — Tests
 *
 * Validation du module settings dynamiques avec tenant override.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getSetting,
  setSetting,
  getAllSettings,
  invalidateSettingsCache,
} from "@/lib/platform/settings";
import type { SystemSetting } from "@/lib/platform/settings";

// Mock Supabase
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIs = vi.fn();
const mockMaybeSingle = vi.fn();
const mockInsert = vi.fn();
const mockUpsert = vi.fn();
const mockSingle = vi.fn();

const mockDb = {
  from: vi.fn(() => ({
    select: mockSelect.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    is: mockIs.mockReturnThis(),
    maybeSingle: mockMaybeSingle,
    insert: mockInsert.mockReturnThis(),
    upsert: mockUpsert.mockReturnThis(),
    single: mockSingle,
  })),
} as unknown as import("@supabase/supabase-js").SupabaseClient;

// Console error spy
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("Platform Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSettingsCache();
    consoleErrorSpy.mockClear();
  });

  describe("getSetting", () => {
    it("returns global setting when tenantId is null", async () => {
      const mockSetting = {
        id: "global-1",
        key: "analytics.enabled",
        value: "true",
        category: "feature_flags",
        is_encrypted: false,
        tenant_id: null,
        updated_at: "2026-04-25T10:00:00Z",
      };

      mockMaybeSingle.mockResolvedValueOnce({ data: mockSetting, error: null });

      const result = await getSetting(mockDb, "analytics.enabled", null);

      expect(result).not.toBeNull();
      expect(result?.key).toBe("analytics.enabled");
      expect(result?.value).toBe(true); // JSON parsed
      expect(result?.tenantId).toBeNull();
      expect(mockDb.from).toHaveBeenCalledWith("system_settings");
    });

    it("returns tenant-specific setting when it exists", async () => {
      const tenantId = "tenant-123";
      const mockTenantSetting = {
        id: "tenant-setting-1",
        key: "analytics.enabled",
        value: "false",
        category: "feature_flags",
        is_encrypted: false,
        tenant_id: tenantId,
        updated_at: "2026-04-25T10:00:00Z",
      };

      // First call (tenant-specific) returns the setting
      mockMaybeSingle
        .mockResolvedValueOnce({ data: mockTenantSetting, error: null });

      const result = await getSetting(mockDb, "analytics.enabled", tenantId);

      expect(result).not.toBeNull();
      expect(result?.value).toBe(false);
      expect(result?.tenantId).toBe(tenantId);
    });

    it("falls back to global when tenant-specific does not exist", async () => {
      const tenantId = "tenant-456";
      const mockGlobalSetting = {
        id: "global-1",
        key: "analytics.enabled",
        value: "true",
        category: "feature_flags",
        is_encrypted: false,
        tenant_id: null,
        updated_at: "2026-04-25T10:00:00Z",
      };

      // First call (tenant-specific) returns null
      mockMaybeSingle
        .mockResolvedValueOnce({ data: null, error: null })
        // Second call (global) returns the setting
        .mockResolvedValueOnce({ data: mockGlobalSetting, error: null });

      const result = await getSetting(mockDb, "analytics.enabled", tenantId);

      expect(result).not.toBeNull();
      expect(result?.value).toBe(true);
      expect(result?.tenantId).toBeNull();
    });

    it("returns null when setting does not exist", async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await getSetting(mockDb, "unknown.setting", null);

      expect(result).toBeNull();
    });

    it("logs error when database query fails", async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: { message: "Connection timeout" },
      });

      const result = await getSetting(mockDb, "analytics.enabled", null);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Settings] Error fetching global setting analytics.enabled:",
        "Connection timeout"
      );
    });
  });

  describe("setSetting", () => {
    it("creates a new setting successfully", async () => {
      const mockCreated = {
        id: "new-1",
        key: "new.feature",
        value: "\"enabled\"",
        category: "feature_flags",
        is_encrypted: false,
        tenant_id: null,
        updated_at: "2026-04-25T10:00:00Z",
      };

      mockSingle.mockResolvedValueOnce({ data: mockCreated, error: null });

      const result = await setSetting(
        mockDb,
        "new.feature",
        "enabled",
        "feature_flags",
        null,
        { description: "Test feature" }
      );

      expect(result).not.toBeNull();
      expect(result.key).toBe("new.feature");
      expect(result.value).toBe("enabled");
    });

    it("creates tenant-specific setting", async () => {
      const tenantId = "tenant-789";
      const mockTenantSetting = {
        id: "tenant-new-1",
        key: "custom.threshold",
        value: "100",
        category: "thresholds",
        is_encrypted: false,
        tenant_id: tenantId,
        updated_at: "2026-04-25T10:00:00Z",
      };

      mockSingle.mockResolvedValueOnce({ data: mockTenantSetting, error: null });

      const result = await setSetting(
        mockDb,
        "custom.threshold",
        100,
        "thresholds",
        tenantId,
        { description: "Custom threshold for tenant" }
      );

      expect(result.tenantId).toBe(tenantId);
      expect(result.value).toBe(100);
    });

    it("throws error when database upsert fails", async () => {
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: "Unique constraint violation" },
      });

      await expect(
        setSetting(mockDb, "duplicate.key", "value", "ui", null)
      ).rejects.toThrow("[Settings] Failed to set duplicate.key: Unique constraint violation");
    });
  });

  describe("getAllSettings", () => {
    it("returns all settings for a category", async () => {
      const mockData = [
        {
          id: "1",
          key: "analytics.enabled",
          value: "true",
          category: "feature_flags",
          is_encrypted: false,
          tenant_id: null,
          updated_at: "2026-04-25T10:00:00Z",
        },
        {
          id: "2",
          key: "toasts.enabled",
          value: "true",
          category: "feature_flags",
          is_encrypted: false,
          tenant_id: null,
          updated_at: "2026-04-25T10:00:00Z",
        },
      ];

      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ data: mockData, error: null }),
      });

      const result = await getAllSettings(mockDb, "feature_flags");

      expect(result).toHaveLength(2);
      expect(result[0].category).toBe("feature_flags");
    });

    it("filters by tenantId when provided", async () => {
      const tenantId = "tenant-abc";
      const mockData = [
        {
          id: "1",
          key: "custom.setting",
          value: "\"tenant-value\"",
          category: "ui",
          is_encrypted: false,
          tenant_id: tenantId,
          updated_at: "2026-04-25T10:00:00Z",
        },
      ];

      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ data: mockData, error: null }),
      });

      const result = await getAllSettings(mockDb, undefined, tenantId);

      expect(result).toHaveLength(1);
      expect(result[0].tenantId).toBe(tenantId);
    });

    it("returns empty array and logs error on database failure", async () => {
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ data: null, error: { message: "DB error" } }),
      });

      const result = await getAllSettings(mockDb, "feature_flags");

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Settings] Error fetching settings:",
        "DB error"
      );
    });
  });

  describe("Value parsing", () => {
    it("correctly parses JSON values", async () => {
      const mockSetting = {
        id: "1",
        key: "complex.setting",
        value: JSON.stringify({ nested: { value: 123 }, array: [1, 2, 3] }),
        category: "feature_flags",
        is_encrypted: false,
        tenant_id: null,
        updated_at: "2026-04-25T10:00:00Z",
      };

      mockMaybeSingle.mockResolvedValueOnce({ data: mockSetting, error: null });

      const result = await getSetting(mockDb, "complex.setting", null);

      expect(result?.value).toEqual({ nested: { value: 123 }, array: [1, 2, 3] });
    });

    it("returns raw string for invalid JSON", async () => {
      const mockSetting = {
        id: "1",
        key: "invalid.json",
        value: "not valid json",
        category: "ui",
        is_encrypted: false,
        tenant_id: null,
        updated_at: "2026-04-25T10:00:00Z",
      };

      mockMaybeSingle.mockResolvedValueOnce({ data: mockSetting, error: null });

      const result = await getSetting(mockDb, "invalid.json", null);

      expect(result?.value).toBe("not valid json");
    });
  });
});
