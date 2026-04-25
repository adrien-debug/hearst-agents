/**
 * HubSpot Connector — Zod Schemas
 *
 * Validation des types HubSpot API.
 * Path: lib/connectors/packs/crm-pack/schemas/hubspot.ts
 */

import { z } from "zod";

// HubSpot Contact
export const HubSpotContactSchema = z.object({
  id: z.string(),
  properties: z.object({
    email: z.string().email().optional(),
    firstname: z.string().optional(),
    lastname: z.string().optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
    jobtitle: z.string().optional(),
    createdate: z.string().optional(),
    lastmodifieddate: z.string().optional(),
  }).passthrough(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type HubSpotContact = z.infer<typeof HubSpotContactSchema>;

// HubSpot Company
export const HubSpotCompanySchema = z.object({
  id: z.string(),
  properties: z.object({
    name: z.string().optional(),
    domain: z.string().optional(),
    industry: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    createdate: z.string().optional(),
  }).passthrough(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type HubSpotCompany = z.infer<typeof HubSpotCompanySchema>;

// HubSpot Deal
export const HubSpotDealSchema = z.object({
  id: z.string(),
  properties: z.object({
    dealname: z.string().optional(),
    amount: z.string().optional(),
    dealstage: z.string().optional(),
    pipeline: z.string().optional(),
    closedate: z.string().optional(),
    createdate: z.string().optional(),
  }).passthrough(),
  associations: z.object({
    contacts: z.object({
      results: z.array(z.object({ id: z.string() })),
    }).optional(),
    companies: z.object({
      results: z.array(z.object({ id: z.string() })),
    }).optional(),
  }).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type HubSpotDeal = z.infer<typeof HubSpotDealSchema>;

// Unified CRM Types
export const UnifiedContactSchema = z.object({
  id: z.string(),
  provider: z.literal("hubspot"),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date().optional(),
  raw: z.unknown(),
});

export type UnifiedContact = z.infer<typeof UnifiedContactSchema>;

export const UnifiedCompanySchema = z.object({
  id: z.string(),
  provider: z.literal("hubspot"),
  name: z.string(),
  domain: z.string().optional(),
  industry: z.string().optional(),
  phone: z.string().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  createdAt: z.date(),
  updatedAt: z.date().optional(),
  raw: z.unknown(),
});

export type UnifiedCompany = z.infer<typeof UnifiedCompanySchema>;

export const UnifiedDealSchema = z.object({
  id: z.string(),
  provider: z.literal("hubspot"),
  name: z.string(),
  amount: z.number().optional(),
  stage: z.string().optional(),
  pipeline: z.string().optional(),
  closeDate: z.date().optional(),
  contactIds: z.array(z.string()),
  companyIds: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date().optional(),
  raw: z.unknown(),
});

export type UnifiedDeal = z.infer<typeof UnifiedDealSchema>;
