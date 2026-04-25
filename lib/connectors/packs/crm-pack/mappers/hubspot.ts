/**
 * HubSpot Connector — Mappers
 *
 * Transformations HubSpot API → Unified CRM types.
 * Path: lib/connectors/packs/crm-pack/mappers/hubspot.ts
 */

import type {
  HubSpotContact,
  HubSpotCompany,
  HubSpotDeal,
  UnifiedContact,
  UnifiedCompany,
  UnifiedDeal,
} from "../schemas/hubspot";

/**
 * Map HubSpot Contact → Unified Contact
 */
export function mapHubSpotContactToUnified(
  contact: HubSpotContact
): UnifiedContact {
  const props = contact.properties;

  return {
    id: contact.id,
    provider: "hubspot",
    email: props.email,
    firstName: props.firstname,
    lastName: props.lastname,
    phone: props.phone,
    company: props.company,
    title: props.jobtitle,
    createdAt: props.createdate
      ? new Date(props.createdate)
      : new Date(contact.createdAt || Date.now()),
    updatedAt: props.lastmodifieddate
      ? new Date(props.lastmodifieddate)
      : undefined,
    raw: contact,
  };
}

/**
 * Map HubSpot Company → Unified Company
 */
export function mapHubSpotCompanyToUnified(
  company: HubSpotCompany
): UnifiedCompany {
  const props = company.properties;

  return {
    id: company.id,
    provider: "hubspot",
    name: props.name || "Unknown",
    domain: props.domain,
    industry: props.industry,
    phone: props.phone,
    address: {
      street: props.address,
      city: props.city,
      country: props.country,
    },
    createdAt: props.createdate
      ? new Date(props.createdate)
      : new Date(company.createdAt || Date.now()),
    updatedAt: company.updatedAt ? new Date(company.updatedAt) : undefined,
    raw: company,
  };
}

/**
 * Map HubSpot Deal → Unified Deal
 */
export function mapHubSpotDealToUnified(
  deal: HubSpotDeal
): UnifiedDeal {
  const props = deal.properties;

  // Extract associated contact/company IDs
  const contactIds =
    deal.associations?.contacts?.results?.map((r) => r.id) || [];
  const companyIds =
    deal.associations?.companies?.results?.map((r) => r.id) || [];

  return {
    id: deal.id,
    provider: "hubspot",
    name: props.dealname || "Untitled Deal",
    amount: props.amount ? parseFloat(props.amount) : undefined,
    stage: props.dealstage,
    pipeline: props.pipeline,
    closeDate: props.closedate ? new Date(props.closedate) : undefined,
    contactIds,
    companyIds,
    createdAt: props.createdate
      ? new Date(props.createdate)
      : new Date(deal.createdAt || Date.now()),
    updatedAt: deal.updatedAt ? new Date(deal.updatedAt) : undefined,
    raw: deal,
  };
}

/**
 * Map multiple items
 */
export function mapHubSpotContactsToUnified(
  contacts: HubSpotContact[]
): UnifiedContact[] {
  return contacts.map(mapHubSpotContactToUnified);
}

export function mapHubSpotCompaniesToUnified(
  companies: HubSpotCompany[]
): UnifiedCompany[] {
  return companies.map(mapHubSpotCompanyToUnified);
}

export function mapHubSpotDealsToUnified(
  deals: HubSpotDeal[]
): UnifiedDeal[] {
  return deals.map(mapHubSpotDealToUnified);
}
