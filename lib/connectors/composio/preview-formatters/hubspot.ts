/**
 * HubSpot preview formatters.
 */

import { footer, header, line, preview } from "./shared";

export function formatHubspotCreateContact(args: Record<string, unknown>): string {
  const props = (args.properties ?? args) as Record<string, unknown>;
  const email = String(props.email ?? "—");
  const firstName = String(props.firstname ?? props.first_name ?? "");
  const lastName = String(props.lastname ?? props.last_name ?? "");
  const company = props.company ? String(props.company) : null;
  const phone = props.phone ? String(props.phone) : null;

  const fullName = `${firstName} ${lastName}`.trim() || "(sans nom)";

  const lines = [
    line("Nom", fullName),
    line("Email", email),
    company ? line("Entreprise", company) : null,
    phone ? line("Téléphone", phone) : null,
  ].filter(Boolean) as string[];

  return [header("HUBSPOT", "Créer un contact"), ...lines, footer()].join("\n");
}

export function formatHubspotUpdateDeal(args: Record<string, unknown>): string {
  const dealId = String(args.deal_id ?? args.dealId ?? args.object_id ?? "—");
  const props = (args.properties ?? {}) as Record<string, unknown>;
  const stage = props.dealstage ?? props.stage;
  const amount = props.amount;
  const closeDate = props.closedate ?? props.close_date;

  const updates = Object.entries(props)
    .slice(0, 6)
    .map(([k, v]) => `${k}=${preview(String(v), 60)}`)
    .join(", ");

  const lines = [
    line("Deal ID", dealId),
    stage ? line("Étape", String(stage)) : null,
    amount ? line("Montant", String(amount)) : null,
    closeDate ? line("Date close", String(closeDate)) : null,
    updates ? line("Modifications", updates) : null,
  ].filter(Boolean) as string[];

  return [header("HUBSPOT", "Modifier un deal"), ...lines, footer()].join("\n");
}
