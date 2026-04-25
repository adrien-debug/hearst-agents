/**
 * Stripe Connector — Zod Schemas
 *
 * Validation des types Stripe avec Zod.
 */

import { z } from "zod";

// Stripe Customer
export const StripeCustomerSchema = z.object({
  id: z.string(),
  object: z.literal("customer"),
  email: z.string().email().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  created: z.number(),
  currency: z.string().optional(),
  balance: z.number().default(0),
  delinquent: z.boolean().default(false),
  metadata: z.record(z.string(), z.string()).default({}),
});

export type StripeCustomer = z.infer<typeof StripeCustomerSchema>;

// Stripe Charge
export const StripeChargeSchema = z.object({
  id: z.string(),
  object: z.literal("charge"),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(["succeeded", "pending", "failed"]),
  customer: z.string().optional(),
  description: z.string().optional(),
  receipt_url: z.string().url().optional(),
  created: z.number(),
  metadata: z.record(z.string(), z.string()).default({}),
});

export type StripeCharge = z.infer<typeof StripeChargeSchema>;

// Stripe Invoice
export const StripeInvoiceSchema = z.object({
  id: z.string(),
  object: z.literal("invoice"),
  customer: z.string(),
  status: z.enum(["draft", "open", "paid", "uncollectible", "void"]),
  total: z.number(),
  currency: z.string(),
  hosted_invoice_url: z.string().url().optional(),
  invoice_pdf: z.string().url().optional(),
  created: z.number(),
  due_date: z.number().optional(),
  metadata: z.record(z.string(), z.string()).default({}),
});

export type StripeInvoice = z.infer<typeof StripeInvoiceSchema>;

// Stripe Subscription
export const StripeSubscriptionSchema = z.object({
  id: z.string(),
  object: z.literal("subscription"),
  customer: z.string(),
  status: z.enum([
    "active",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "past_due",
    "paused",
    "trialing",
    "unpaid",
  ]),
  current_period_start: z.number(),
  current_period_end: z.number(),
  cancel_at_period_end: z.boolean().default(false),
  canceled_at: z.number().optional(),
  items: z.object({
    data: z.array(
      z.object({
        id: z.string(),
        price: z.object({
          id: z.string(),
          product: z.string(),
          unit_amount: z.number(),
          currency: z.string(),
        }),
        quantity: z.number(),
      })
    ),
  }),
  metadata: z.record(z.string(), z.string()).default({}),
});

export type StripeSubscription = z.infer<typeof StripeSubscriptionSchema>;

// Stripe Event (Webhook)
export const StripeEventSchema = z.object({
  id: z.string(),
  object: z.literal("event"),
  type: z.string(),
  created: z.number(),
  data: z.object({
    object: z.unknown(),
    previous_attributes: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type StripeEvent = z.infer<typeof StripeEventSchema>;

// Unified types (normalized)
export const UnifiedPaymentSchema = z.object({
  id: z.string(),
  provider: z.literal("stripe"),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(["succeeded", "pending", "failed", "refunded"]),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
  description: z.string().optional(),
  receiptUrl: z.string().url().optional(),
  createdAt: z.date(),
  metadata: z.record(z.string(), z.string()),
});

export type UnifiedPayment = z.infer<typeof UnifiedPaymentSchema>;

export const UnifiedInvoiceSchema = z.object({
  id: z.string(),
  provider: z.literal("stripe"),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
  status: z.enum(["draft", "open", "paid", "uncollectible", "void"]),
  total: z.number(),
  currency: z.string(),
  pdfUrl: z.string().url().optional(),
  hostedUrl: z.string().url().optional(),
  dueDate: z.date().optional(),
  createdAt: z.date(),
  metadata: z.record(z.string(), z.string()),
});

export type UnifiedInvoice = z.infer<typeof UnifiedInvoiceSchema>;

export const UnifiedSubscriptionSchema = z.object({
  id: z.string(),
  provider: z.literal("stripe"),
  customerEmail: z.string().email().optional(),
  status: z.enum([
    "active",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "past_due",
    "paused",
    "trialing",
    "unpaid",
  ]),
  planName: z.string(),
  planAmount: z.number(),
  currency: z.string(),
  currentPeriodStart: z.date(),
  currentPeriodEnd: z.date(),
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: z.date().optional(),
  metadata: z.record(z.string(), z.string()),
});

export type UnifiedSubscription = z.infer<typeof UnifiedSubscriptionSchema>;
