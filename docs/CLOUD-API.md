# Cloud sync and API for AI agents

This feature is optional. Nothing leaves the device until an admin opens **Iba pa → Backup → Cloud at API
para sa AI** and taps **Ikonekta sa cloud**.

## Pieces

| Piece | Where |
|---|---|
| Supabase project | `tindahan-pos` (ref `ihtwvsjtxpxzaoogfjpd`, region ap-south-1, free plan) |
| Database | `supabase/migrations/20261128000000_pos_cloud_init.sql` |
| Edge Function | `supabase/functions/pos/index.ts` (one function for sync, REST and MCP; `verify_jwt` is off because it does its own auth) |
| App client | `web/js/cloud.js` (the URL is the constant `URL_BASE`) |

## Tables

| Table | Columns |
|---|---|
| `stores` | `id uuid`, `name`, `device_token_hash` (SHA-256), `created_at`, `last_sync` |
| `api_keys` | `id`, `store_id` (cascade), `key_hash` (SHA-256), `prefix` (first 10 characters, for display), `label`, `created_at`, `last_used`, `revoked` |
| `docs` | `(store_id, kind, id)` primary key, plus `data jsonb`, `ts` (generated from `data.time`) and `updated_at`. `kind` is one of `store, products, sales, customers, payments, receivings, shifts`. |

RLS is on and there are **no policies**. `anon` and `authenticated` have no grants. Only the function,
using the service role, can read or write.

## Base URL

`https://ihtwvsjtxpxzaoogfjpd.supabase.co/functions/v1/pos`

## Device sync (the app)

All routes except `register` need `Authorization: Bearer <deviceToken>`.

| Route | What it does |
|---|---|
| `POST /sync/register {name}` | Returns `{storeId, deviceToken}`. Only the hash is stored. Limited to 30 new stores per hour overall. |
| `POST /sync/push {docs:[{kind,id,data}], deleted:[{kind,id}]}` | Upserts and deletes records. Limits: 1000 records per call, 256 KB per record, 6 MB per request. |
| `GET /sync/keys` | Lists API keys. |
| `POST /sync/keys {label}` | Creates an API key. The full key is returned **once**. |
| `DELETE /sync/keys/<id>` | Revokes a key. |
| `DELETE /sync/store` | Deletes the store and all its cloud data. The app's **Idiskonekta** uses this. |
| `GET /sync/status` | Shows the connection state. |

### How the app syncs (`cloud.js`)

1. The app hashes every record (FNV-1a over the JSON) and compares it with `meta.cloudHashes`.
2. Only new or changed records are sent, plus deletions, in chunks of 400. The hashes are saved after each chunk, so an interrupted sync resumes where it stopped.
3. A sync runs at these times:
   - about 4 seconds after any write to a synced store (`DB.put`, `del`, `saveSale`, `voidSale`, receiving and import are wrapped)
   - when the app starts
   - every 5 minutes
   - when the device comes back online
4. A `store` record is sent with the store's name, address, phone, currency, decimals and method labels. The logo is not sent.
5. **Staff and PINs are never sent.**

## Read-only REST (for agents and tools)

Pass the key as `Authorization: Bearer tpos_…`, or as `x-api-key`, or as `?key=`.

| Route | Returns |
|---|---|
| `GET /api/openapi.json` | The OpenAPI 3.1 spec. No key needed. |
| `GET /api/store` | Name, currency, decimals and last sync time |
| `GET /api/summary?from=&to=` | Totals, estimated profit, receipts, sales by payment method and by cashier, top products |
| `GET /api/products?q=&low=1` | Products, optionally filtered |
| `GET /api/sales?from=&to=&limit=` | Receipts, newest first (default 7 days, at most 500) |
| `GET /api/customers?debt=1` | Customers with their balances |
| `GET /api/shifts?limit=` | Shifts with expected vs counted cash |

Dates can be ISO strings, `YYYY-MM-DD` (the whole day is included) or epoch milliseconds.

## MCP server

`POST /mcp` speaks Streamable HTTP with JSON responses. It supports `initialize`, `ping`, `tools/list`
and `tools/call`, and batches of up to 20 requests.

The tools are `get_store`, `get_sales_summary`, `list_products`, `list_sales`, `list_customers` and `list_shifts`.

### Connecting an agent

| Agent | How to connect |
|---|---|
| Claude | Settings → Connectors → Add custom connector, using the URL `…/pos/mcp?key=tpos_…`. |
| ChatGPT | In Developer mode, add a connector with the MCP URL. Or in a Custom GPT, go to Actions → Import from URL, use `…/pos/api/openapi.json`, and set Auth to API key (Bearer). |
| Gemini CLI, xAI (Grok) API, other MCP clients | Use the MCP URL, or the REST routes with the Bearer header. |

## Changing the API

1. Edit `supabase/functions/pos/index.ts`. Keep every route **read-only** for API keys.
2. Test it locally. The function only uses `Deno.serve`, `crypto` and `supabase-js`, so it can run under Node 22 with `--experimental-strip-types` and a fake client.
3. Deploy it (see [RELEASE.md](RELEASE.md)), and update the `TOOLS` list and `openapi()` together.
