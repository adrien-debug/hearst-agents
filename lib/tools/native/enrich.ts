/**
 * Enrich tools — exposés à la pipeline IA pour B2B intel.
 *
 * Branche les routes orphelines `/api/v2/enrich/{company,contact}` à
 * l'agent : l'utilisateur dit "enrichis hearstcorp.com" en chat naturel,
 * Claude appelle le tool, le résultat structuré est retourné dans la
 * conversation. Pas d'UI dédiée — l'orchestrateur gère la téléportation
 * vers AssetStage si besoin futur.
 *
 * Sprint suivant (post-Phase C, plan tu-prepare-le-plan-logical-meteor) :
 * remplit la promesse "B2B intel" de la vision. Voice-emotion (Hume) reste
 * orphelin pour l'instant (nécessite capture audio de la session voix +
 * upload — plumbing non trivial).
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";
import {
  enrichCompany,
  PdlUnavailableError,
  type PdlCompany,
} from "@/lib/capabilities/providers/pdl";
import {
  enrichPerson,
  ApolloUnavailableError,
  type ApolloPerson,
} from "@/lib/capabilities/providers/apollo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiToolMap = Record<string, Tool<any, any>>;

interface EnrichCompanyArgs {
  domain: string;
}

interface EnrichContactArgs {
  email: string;
}

/**
 * Formatte un PdlCompany en texte lisible pour le model. On évite de lui
 * balancer le `raw` blob — il prendrait des tokens pour rien.
 */
function formatCompany(c: PdlCompany): string {
  const lines: string[] = [];
  lines.push(`Entreprise : ${c.name ?? c.domain}`);
  if (c.industry) lines.push(`Secteur : ${c.industry}`);
  if (c.size) lines.push(`Taille : ${c.size}`);
  if (c.headcount !== null) lines.push(`Employés : ${c.headcount}`);
  if (c.founded !== null) lines.push(`Fondée : ${c.founded}`);
  if (c.fundingStage) lines.push(`Stade de levée : ${c.fundingStage}`);
  if (c.funding !== null) lines.push(`Levée totale : $${c.funding.toLocaleString("en-US")}`);
  if (c.hq.city || c.hq.country) lines.push(`HQ : ${[c.hq.city, c.hq.country].filter(Boolean).join(", ")}`);
  if (c.linkedin) lines.push(`LinkedIn : ${c.linkedin}`);
  return lines.join("\n");
}

function formatContact(p: ApolloPerson): string {
  const lines: string[] = [];
  lines.push(`Contact : ${p.name ?? p.email ?? "?"}`);
  if (p.title) lines.push(`Titre : ${p.title}`);
  if (p.company) lines.push(`Entreprise : ${p.company}${p.companyDomain ? ` (${p.companyDomain})` : ""}`);
  if (p.city || p.country) lines.push(`Localisation : ${[p.city, p.country].filter(Boolean).join(", ")}`);
  if (p.linkedin) lines.push(`LinkedIn : ${p.linkedin}`);
  return lines.join("\n");
}

export function buildEnrichTools(): AiToolMap {
  const enrichCompanyTool: Tool<EnrichCompanyArgs, string> = {
    description:
      "Enrichit une entreprise (PDL) à partir de son domaine principal. Use this when the user asks for company info, B2B intel, or 'enrichis cette entreprise'. Retourne secteur, taille, levée, HQ, LinkedIn quand disponibles.",
    inputSchema: jsonSchema<EnrichCompanyArgs>({
      type: "object",
      required: ["domain"],
      properties: {
        domain: {
          type: "string",
          description: "Domaine principal de l'entreprise (ex: 'stripe.com', 'hearstcorp.com'). Sans http(s).",
        },
      },
    }),
    execute: async (args) => {
      try {
        const company = await enrichCompany({ domain: args.domain });
        return formatCompany(company);
      } catch (err) {
        if (err instanceof PdlUnavailableError) {
          return "Service d'enrichissement entreprise indisponible (PDL non configuré).";
        }
        const msg = err instanceof Error ? err.message : String(err);
        return `Échec d'enrichissement pour ${args.domain} : ${msg}`;
      }
    },
  };

  const enrichContactTool: Tool<EnrichContactArgs, string> = {
    description:
      "Enrichit un contact professionnel (Apollo) à partir de son email. Use this when the user asks for info on a person, prospect intel, or 'qui est X@société.com'. Retourne titre, entreprise, localisation, LinkedIn.",
    inputSchema: jsonSchema<EnrichContactArgs>({
      type: "object",
      required: ["email"],
      properties: {
        email: {
          type: "string",
          description: "Email professionnel du contact à enrichir (ex: 'patrick@stripe.com').",
        },
      },
    }),
    execute: async (args) => {
      try {
        const person = await enrichPerson({ email: args.email });
        return formatContact(person);
      } catch (err) {
        if (err instanceof ApolloUnavailableError) {
          return "Service d'enrichissement contact indisponible (Apollo non configuré).";
        }
        const msg = err instanceof Error ? err.message : String(err);
        return `Échec d'enrichissement pour ${args.email} : ${msg}`;
      }
    },
  };

  return {
    enrich_company: enrichCompanyTool,
    enrich_contact: enrichContactTool,
  };
}
