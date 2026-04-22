#!/usr/bin/env node
/**
 * Nango Connector Setup Helper
 *
 * Generates curl commands to create integrations via Nango Management API.
 * Run this, then execute the commands with your NANGO_SECRET_KEY.
 */

const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY || 'a40ccbb8-3821-4493-a63c-67a6255b58f3';
const NANGO_HOST = 'https://api.nango.dev';

const CONNECTORS = [
  {
    provider: 'hubspot',
    name: 'HubSpot CRM',
    scopes: 'crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write',
    auth_mode: 'OAUTH2',
    docs: 'https://developers.hubspot.com/docs/api/working-with-oauth'
  },
  {
    provider: 'stripe',
    name: 'Stripe',
    scopes: 'read_only',
    auth_mode: 'OAUTH2',
    docs: 'https://stripe.com/docs/api/authentication'
  },
  {
    provider: 'jira',
    name: 'Jira',
    scopes: 'read:jira-work write:jira-work read:project:jira',
    auth_mode: 'OAUTH2',
    docs: 'https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/'
  },
  {
    provider: 'airtable',
    name: 'Airtable',
    scopes: 'data.records:read data.records:write schema.bases:read',
    auth_mode: 'OAUTH2',
    docs: 'https://airtable.com/developers/web/api/oauth',
    note: 'Déjà configuré dans ton dashboard'
  },
  {
    provider: 'figma',
    name: 'Figma',
    scopes: 'files:read files:write',
    auth_mode: 'OAUTH2',
    docs: 'https://www.figma.com/developers/api#oauth2'
  },
  {
    provider: 'zapier',
    name: 'Zapier',
    scopes: 'zaps:read zaps:write',
    auth_mode: 'OAUTH2',
    docs: 'https://platform.zapier.com/docs/oauth'
  }
];

console.log(`
╔══════════════════════════════════════════════════════════════╗
║         NANGO CONNECTOR SETUP — HEARST OS                     ║
╚══════════════════════════════════════════════════════════════╝

Secret Key: ${NANGO_SECRET_KEY.slice(0, 8)}...${NANGO_SECRET_KEY.slice(-4)}

Pour configurer les 6 connecteurs, exécute ces commandes curl
OU utilise le dashboard web: https://app.nango.dev/integrations

`);

CONNECTORS.forEach((conn, i) => {
  console.log(`\n--- ${i + 1}. ${conn.name} (${conn.provider}) ---`);
  console.log(`Documentation: ${conn.docs}`);
  if (conn.note) console.log(`⚠️  ${conn.note}`);
  
  // Template curl command (requires manual OAuth app creation first)
  console.log(`
# Step 1: Create OAuth app at ${conn.docs}
# Step 2: Get Client ID and Secret from the provider
# Step 3: Create integration in Nango:

curl -X POST ${NANGO_HOST}/config \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer ${NANGO_SECRET_KEY}' \
  -d '{
    "provider": "${conn.provider}",
    "unique_key": "${conn.provider}",
    "oauth_client_id": "YOUR_${conn.provider.toUpperCase()}_CLIENT_ID",
    "oauth_client_secret": "YOUR_${conn.provider.toUpperCase()}_CLIENT_SECRET",
    "oauth_scopes": "${conn.scopes}",
    "auth_mode": "${conn.auth_mode}"
  }'
`);
});

console.log(`
═══════════════════════════════════════════════════════════════

ALTERNATIVE: Configuration via Dashboard Web (plus rapide)

1. Va sur https://app.nango.dev/integrations
2. Clique "Add Integration" 5 fois (HubSpot, Stripe, Jira, Figma, Zapier)
3. Pour chaque:
   - Provider: [sélectionne le service]
   - Unique Key: [nom du service en minuscule]
   - OAuth Client ID: [crée une app OAuth chez le provider]
   - OAuth Client Secret: [même chose]
   - Scopes: [voir ci-dessus]
4. Save

═══════════════════════════════════════════════════════════════

Vérification après configuration:
curl http://localhost:9000/api/nango/health

`);
