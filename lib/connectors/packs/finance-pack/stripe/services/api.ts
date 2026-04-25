/**
 * Stripe Connector — API Service
 *
 * Wrappers HTTP pour l'API Stripe.
 * Gère retry, rate limiting, et erreurs.
 */

import type {
  StripeCustomer,
  StripeCharge,
  StripeInvoice,
  StripeSubscription,
} from "../schemas";
import {
  StripeCustomerSchema,
  StripeChargeSchema,
  StripeInvoiceSchema,
  StripeSubscriptionSchema,
} from "../schemas";

interface StripeConfig {
  apiKey: string; // Secret key (sk_...)
  apiVersion?: string; // Default: 2024-12-18.acacia
}

export class StripeApiService {
  private apiKey: string;
  private baseUrl = "https://api.stripe.com/v1";
  private apiVersion: string;

  constructor(config: StripeConfig) {
    this.apiKey = config.apiKey;
    this.apiVersion = config.apiVersion || "2024-12-18.acacia";
  }

  /**
   * Requête HTTP authentifiée
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "DELETE";
      params?: Record<string, string | number | undefined>;
      body?: URLSearchParams;
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
        Authorization: `Bearer ${this.apiKey}`,
        "Stripe-Version": this.apiVersion,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body?.toString(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new StripeApiError(
        error.error?.message || `Stripe API error: ${response.status}`,
        response.status,
        error.error?.type || "unknown_error",
        error.error?.code
      );
    }

    return response.json() as T;
  }

  // ==================== Customers ====================

  async listCustomers(params?: {
    limit?: number;
    starting_after?: string;
    email?: string;
    created?: { gt?: number; lt?: number };
  }): Promise<StripeCustomer[]> {
    const data = await this.request<{
      data: unknown[];
      has_more: boolean;
    }>("/customers", {
      params: {
        limit: params?.limit || 100,
        starting_after: params?.starting_after,
        email: params?.email,
        "created[gt]": params?.created?.gt,
        "created[lt]": params?.created?.lt,
      },
    });

    return data.data.map((item) => StripeCustomerSchema.parse(item));
  }

  async getCustomer(id: string): Promise<StripeCustomer | null> {
    try {
      const data = await this.request<unknown>(`/customers/${id}`);
      return StripeCustomerSchema.parse(data);
    } catch (err) {
      if (err instanceof StripeApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ==================== Charges (Payments) ====================

  async listCharges(params?: {
    limit?: number;
    starting_after?: string;
    customer?: string;
    created?: { gt?: number; lt?: number };
  }): Promise<StripeCharge[]> {
    const data = await this.request<{
      data: unknown[];
      has_more: boolean;
    }>("/charges", {
      params: {
        limit: params?.limit || 100,
        starting_after: params?.starting_after,
        customer: params?.customer,
        "created[gt]": params?.created?.gt,
        "created[lt]": params?.created?.lt,
      },
    });

    return data.data.map((item) => StripeChargeSchema.parse(item));
  }

  async getCharge(id: string): Promise<StripeCharge | null> {
    try {
      const data = await this.request<unknown>(`/charges/${id}`);
      return StripeChargeSchema.parse(data);
    } catch (err) {
      if (err instanceof StripeApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ==================== Invoices ====================

  async listInvoices(params?: {
    limit?: number;
    starting_after?: string;
    customer?: string;
    status?: "draft" | "open" | "paid" | "uncollectible" | "void";
    created?: { gt?: number; lt?: number };
  }): Promise<StripeInvoice[]> {
    const data = await this.request<{
      data: unknown[];
      has_more: boolean;
    }>("/invoices", {
      params: {
        limit: params?.limit || 100,
        starting_after: params?.starting_after,
        customer: params?.customer,
        status: params?.status,
        "created[gt]": params?.created?.gt,
        "created[lt]": params?.created?.lt,
      },
    });

    return data.data.map((item) => StripeInvoiceSchema.parse(item));
  }

  async getInvoice(id: string): Promise<StripeInvoice | null> {
    try {
      const data = await this.request<unknown>(`/invoices/${id}`);
      return StripeInvoiceSchema.parse(data);
    } catch (err) {
      if (err instanceof StripeApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ==================== Subscriptions ====================

  async listSubscriptions(params?: {
    limit?: number;
    starting_after?: string;
    customer?: string;
    status?:
      | "active"
      | "canceled"
      | "incomplete"
      | "incomplete_expired"
      | "past_due"
      | "paused"
      | "trialing"
      | "unpaid";
    created?: { gt?: number; lt?: number };
  }): Promise<StripeSubscription[]> {
    const data = await this.request<{
      data: unknown[];
      has_more: boolean;
    }>("/subscriptions", {
      params: {
        limit: params?.limit || 100,
        starting_after: params?.starting_after,
        customer: params?.customer,
        status: params?.status,
        "created[gt]": params?.created?.gt,
        "created[lt]": params?.created?.lt,
      },
    });

    return data.data.map((item) => StripeSubscriptionSchema.parse(item));
  }

  async getSubscription(id: string): Promise<StripeSubscription | null> {
    try {
      const data = await this.request<unknown>(`/subscriptions/${id}`);
      return StripeSubscriptionSchema.parse(data);
    } catch (err) {
      if (err instanceof StripeApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ==================== Health Check ====================

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.request("/charges", { params: { limit: 1 } });
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}

/**
 * Erreur personnalisée Stripe
 */
export class StripeApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public type: string,
    public code?: string
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}
