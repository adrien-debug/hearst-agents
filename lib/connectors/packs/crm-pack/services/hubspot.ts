/**
 * HubSpot Connector — API Service
 *
 * HubSpot CRM API wrapper.
 * Path: lib/connectors/packs/crm-pack/services/hubspot.ts
 */

import {
  HubSpotContactSchema,
  HubSpotCompanySchema,
  HubSpotDealSchema,
  type HubSpotContact,
  type HubSpotCompany,
  type HubSpotDeal,
} from "../schemas/hubspot";

interface HubSpotConfig {
  accessToken: string;
  baseUrl?: string;
}

export class HubSpotApiService {
  private accessToken: string;
  private baseUrl: string;

  constructor(config: HubSpotConfig) {
    this.accessToken = config.accessToken;
    this.baseUrl = config.baseUrl || "https://api.hubapi.com";
  }

  /**
   * Make authenticated request to HubSpot API
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      params?: Record<string, string | number | undefined>;
      body?: unknown;
    } = {}
  ): Promise<T> {
    const { method = "GET", params, body } = options;

    // Build URL with query params
    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new HubSpotApiError(
        errorData.message || `HubSpot API error: ${response.status}`,
        response.status,
        errorData.category || "UNKNOWN"
      );
    }

    return response.json() as T;
  }

  // ==================== Contacts ====================

  /**
   * List contacts with pagination
   */
  async listContacts(params?: {
    limit?: number;
    after?: string;
    properties?: string[];
  }): Promise<{ results: HubSpotContact[]; paging?: { next?: { after: string } } }> {
    const data = await this.request<{
      results: unknown[];
      paging?: { next?: { after: string } };
    }>("/crm/v3/objects/contacts", {
      params: {
        limit: params?.limit || 100,
        after: params?.after,
        properties: params?.properties?.join(",") || "email,firstname,lastname,phone,company",
      },
    });

    return {
      results: data.results.map((r) => HubSpotContactSchema.parse(r)),
      paging: data.paging,
    };
  }

  /**
   * Get a single contact
   */
  async getContact(
    contactId: string,
    properties?: string[]
  ): Promise<HubSpotContact | null> {
    try {
      const data = await this.request<unknown>(
        `/crm/v3/objects/contacts/${contactId}`,
        {
          params: {
            properties: properties?.join(",") || "email,firstname,lastname,phone,company",
          },
        }
      );
      return HubSpotContactSchema.parse(data);
    } catch (err) {
      if (err instanceof HubSpotApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Search contacts by email or name
   */
  async searchContacts(query: string): Promise<HubSpotContact[]> {
    const data = await this.request<{
      results: unknown[];
    }>("/crm/v3/objects/contacts/search", {
      method: "POST",
      body: {
        query,
        properties: ["email", "firstname", "lastname", "phone", "company"],
        limit: 100,
      },
    });

    return data.results.map((r) => HubSpotContactSchema.parse(r));
  }

  // ==================== Companies ====================

  /**
   * List companies
   */
  async listCompanies(params?: {
    limit?: number;
    after?: string;
  }): Promise<{ results: HubSpotCompany[]; paging?: { next?: { after: string } } }> {
    const data = await this.request<{
      results: unknown[];
      paging?: { next?: { after: string } };
    }>("/crm/v3/objects/companies", {
      params: {
        limit: params?.limit || 100,
        after: params?.after,
        properties: "name,domain,industry,phone,address,city,country",
      },
    });

    return {
      results: data.results.map((r) => HubSpotCompanySchema.parse(r)),
      paging: data.paging,
    };
  }

  /**
   * Get a single company
   */
  async getCompany(companyId: string): Promise<HubSpotCompany | null> {
    try {
      const data = await this.request<unknown>(
        `/crm/v3/objects/companies/${companyId}`,
        {
          params: {
            properties: "name,domain,industry,phone,address,city,country",
          },
        }
      );
      return HubSpotCompanySchema.parse(data);
    } catch (err) {
      if (err instanceof HubSpotApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ==================== Deals ====================

  /**
   * List deals
   */
  async listDeals(params?: {
    limit?: number;
    after?: string;
    includeAssociations?: boolean;
  }): Promise<{ results: HubSpotDeal[]; paging?: { next?: { after: string } } }> {
    const data = await this.request<{
      results: unknown[];
      paging?: { next?: { after: string } };
    }>("/crm/v3/objects/deals", {
      params: {
        limit: params?.limit || 100,
        after: params?.after,
        properties: "dealname,amount,dealstage,pipeline,closedate",
        associations: params?.includeAssociations ? "contacts,companies" : undefined,
      },
    });

    return {
      results: data.results.map((r) => HubSpotDealSchema.parse(r)),
      paging: data.paging,
    };
  }

  /**
   * Get a single deal
   */
  async getDeal(
    dealId: string,
    includeAssociations = false
  ): Promise<HubSpotDeal | null> {
    try {
      const data = await this.request<unknown>(
        `/crm/v3/objects/deals/${dealId}`,
        {
          params: {
            properties: "dealname,amount,dealstage,pipeline,closedate",
            associations: includeAssociations ? "contacts,companies" : undefined,
          },
        }
      );
      return HubSpotDealSchema.parse(data);
    } catch (err) {
      if (err instanceof HubSpotApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ==================== Health Check ====================

  /**
   * Check API connectivity
   */
  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.request<{ status: string }>("/integrations/v1/me");
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}

/**
 * HubSpot API Error
 */
export class HubSpotApiError extends Error {
  status: number;
  category: string;

  constructor(message: string, status: number, category: string) {
    super(message);
    this.name = "HubSpotApiError";
    this.status = status;
    this.category = category;
  }
}
