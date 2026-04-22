# Nango Setup Guide — HEARST OS

Guide pour configurer les 6 premiers connecteurs dans le dashboard Nango.

## Étape 1 — Dashboard Nango

URL: https://app.nango.dev

## Étape 2 — Configurer les 6 connecteurs initiaux

Dans le dashboard → **Integrations** → **Add Integration**

### 1. HubSpot
- **Integration ID**: `hubspot`
- **Provider**: HubSpot
- **Scopes**: `crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write`
- **OAuth Redirect URL**: `https://api.nango.dev/oauth/callback`

### 2. Stripe
- **Integration ID**: `stripe`
- **Provider**: Stripe
- **Scopes**: `read_only` ou `read_write`
- **OAuth Redirect URL**: `https://api.nango.dev/oauth/callback`

### 3. Jira
- **Integration ID**: `jira`
- **Provider**: Jira
- **Scopes**: `read:jira-work write:jira-work read:project:jira`
- **OAuth Redirect URL**: `https://api.nango.dev/oauth/callback`

### 4. Airtable
- **Integration ID**: `airtable`
- **Provider**: Airtable
- **Scopes**: `data.records:read data.records:write schema.bases:read`
- **OAuth Redirect URL**: `https://api.nango.dev/oauth/callback`

### 5. Figma
- **Integration ID**: `figma`
- **Provider**: Figma
- **Scopes**: `files:read files:write`
- **OAuth Redirect URL**: `https://api.nango.dev/oauth/callback`

### 6. Zapier
- **Integration ID**: `zapier`
- **Provider**: Zapier
- **Scopes**: `zaps:read zaps:write`
- **OAuth Redirect URL**: `https://api.nango.dev/oauth/callback`

## Étape 3 — Webhook Configuration

Dans **Environment Settings** → **Webhooks**:

- **Webhook URL**: `https://hearst-os.vercel.app/api/webhooks/nango`
- **Events**: Enable all connection events

## Étape 4 — Tester

```bash
# Health check
curl http://localhost:9000/api/nango/health

# Résultat attendu:
# {
#   "status": "healthy",
#   "configured": 6,
#   "readyToEnable": 6,
#   "providers": [...]
# }
```

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    HEARST OS                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│   lib/connectors/nango/                                    │
│   ├── client.ts        ← SDK @nangohq/node                 │
│   ├── proxy.ts         ← API calls via Nango               │
│   └── webhooks.ts      ← OAuth lifecycle                   │
│                                                            │
│   app/api/nango/                                           │
│   ├── health/route.ts  ← GET /api/nango/health             │
│   ├── connect/route.ts ← POST /api/nango/connect           │
│   └── proxy/route.ts   ← POST /api/nango/proxy             │
│                                                            │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                    NANGO CLOUD                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │   OAuth     │  │   Proxy     │  │  Webhooks   │           │
│  │   Server    │  │   Server    │  │   Server    │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
└────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │ HubSpot  │    │  Stripe  │    │   Jira   │
     └──────────┘    └──────────┘    └──────────┘
```

## Référence API

### Se connecter à un provider

```typescript
// Frontend: open Nango OAuth
const response = await fetch('/api/nango/connect', {
  method: 'POST',
  body: JSON.stringify({ provider: 'hubspot' })
});
const { config } = await response.json();

// Use @nangohq/frontend to open OAuth popup
const nango = new Nango({ publicKey: '...' });
await nango.auth(config.provider, config.connectionId);
```

### Appeler une API via proxy

```typescript
const response = await fetch('/api/nango/proxy', {
  method: 'POST',
  body: JSON.stringify({
    provider: 'hubspot',
    endpoint: '/crm/v3/objects/contacts',
    method: 'GET'
  })
});
```

## 200+ Connecteurs Supplémentaires

Une fois les 6 connecteurs de base testés, activer les autres via le dashboard Nango :
- Salesforce, Mailchimp, Intercom, Linear
- Asana, Trello, Monday, QuickBooks
- Xero, Shopify, Zendesk, Freshdesk
- Pipedrive, Zoho, Snowflake, BigQuery
- Et 180+ autres...

## Documentation Nango

- https://docs.nango.dev
- https://docs.nango.dev/integrations/overview (liste complète)
