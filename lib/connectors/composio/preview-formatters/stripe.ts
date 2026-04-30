/**
 * Stripe preview formatters — actions sensibles (financières), preview
 * obligatoire avant exécution.
 */

import { footer, header, line, preview } from "./shared";

function formatAmount(amount: unknown, currency: unknown): string {
  if (amount === undefined || amount === null) return "—";
  const num = typeof amount === "number" ? amount : Number(amount);
  if (Number.isNaN(num)) return String(amount);
  // Stripe amounts are in cents
  const display = (num / 100).toFixed(2);
  const cur = currency ? String(currency).toUpperCase() : "USD";
  return `${display} ${cur}`;
}

export function formatStripeCreateInvoice(args: Record<string, unknown>): string {
  const customer = String(args.customer ?? args.customer_id ?? "—");
  const amount = formatAmount(args.amount, args.currency);
  const description = args.description ? preview(String(args.description), 200) : null;
  const collectionMethod = args.collection_method
    ? String(args.collection_method)
    : null;
  const dueDate = args.due_date ?? args.dueDate;

  const lines = [
    line("Client", customer),
    line("Montant", amount),
    description ? line("Description", description) : null,
    collectionMethod ? line("Méthode", collectionMethod) : null,
    dueDate ? line("Échéance", String(dueDate)) : null,
    "\nATTENTION : action financière. Vérifiez le client et le montant.",
  ].filter(Boolean) as string[];

  return [header("STRIPE", "Créer une facture"), ...lines, footer()].join("\n");
}

export function formatStripeRefund(args: Record<string, unknown>): string {
  const charge = String(args.charge ?? args.charge_id ?? args.payment_intent ?? "—");
  const amount = args.amount
    ? formatAmount(args.amount, args.currency ?? "usd")
    : "Montant total";
  const reason = args.reason ? String(args.reason) : null;

  const lines = [
    line("Charge / PaymentIntent", charge),
    line("Montant", amount),
    reason ? line("Motif", reason) : null,
    "\nATTENTION : remboursement irréversible.",
  ].filter(Boolean) as string[];

  return [header("STRIPE", "Rembourser"), ...lines, footer()].join("\n");
}
