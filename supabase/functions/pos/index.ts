// POS cloud: sync mula sa app, REST API at MCP server para sa AI agents (Claude, ChatGPT, Gemini, Grok).
//
//  /pos/sync/register   POST  {name}                    -> {storeId, deviceToken}   (bagong tindahan)
//  /pos/sync/push       POST  Bearer <deviceToken>      {docs:[{kind,id,data}], deleted:[{kind,id}]}
//  /pos/sync/keys       GET|POST|DELETE  Bearer <deviceToken>   (gumawa / tingnan / bawiin ang API key)
//  /pos/sync/store      DELETE Bearer <deviceToken>     (burahin ang tindahan at lahat ng data nito sa cloud)
//  /pos/api/...         GET   Bearer <apiKey>           (read-only REST; tingnan ang /pos/api/openapi.json)
//  /pos/mcp             POST  Bearer <apiKey> o ?key=   (MCP Streamable HTTP, JSON-RPC)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const KINDS = ["store", "products", "sales", "customers", "payments", "receivings", "shifts"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-api-key, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS, ...extra } });
}
const fail = (status: number, error: string) => json({ error }, status);

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(prefix: string, bytes = 24) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return prefix + btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bearer(req: Request, url: URL) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return (m ? m[1] : req.headers.get("x-api-key") || url.searchParams.get("key") || "").trim();
}

async function storeByDevice(token: string) {
  if (!token) return null;
  const { data } = await db.from("stores").select("*").eq("device_token_hash", await sha256(token)).maybeSingle();
  return data;
}
async function storeByApiKey(key: string) {
  if (!key || !key.startsWith("tpos_")) return null;
  const { data } = await db.from("api_keys").select("id, store_id, revoked").eq("key_hash", await sha256(key)).maybeSingle();
  if (!data || data.revoked) return null;
  db.from("api_keys").update({ last_used: new Date().toISOString() }).eq("id", data.id).then(() => {});
  const { data: store } = await db.from("stores").select("*").eq("id", data.store_id).maybeSingle();
  return store;
}

// ---------------- SYNC ----------------
async function handleSync(req: Request, url: URL, path: string[]) {
  const action = path[0];
  if (action === "register" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const token = randomToken("dev_", 32);
    const { data, error } = await db.from("stores").insert({ name: String(body.name || "").slice(0, 120), device_token_hash: await sha256(token) }).select("id").single();
    if (error) return fail(500, error.message);
    return json({ storeId: data.id, deviceToken: token });
  }
  const store = await storeByDevice(bearer(req, url));
  if (!store) return fail(401, "Invalid device token");

  if (action === "push" && req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body) return fail(400, "Invalid JSON");
    const docs = (Array.isArray(body.docs) ? body.docs : []).filter((d: any) => d && KINDS.includes(d.kind) && d.id != null && d.data);
    const deleted = (Array.isArray(body.deleted) ? body.deleted : []).filter((d: any) => d && KINDS.includes(d.kind) && d.id != null);
    if (docs.length > 1000 || deleted.length > 1000) return fail(413, "Max 1000 per push");
    if (docs.length) {
      const rows = docs.map((d: any) => ({ store_id: store.id, kind: d.kind, id: String(d.id), data: d.data, updated_at: new Date().toISOString() }));
      const { error } = await db.from("docs").upsert(rows, { onConflict: "store_id,kind,id" });
      if (error) return fail(500, error.message);
    }
    for (const d of deleted) await db.from("docs").delete().match({ store_id: store.id, kind: d.kind, id: String(d.id) });
    const name = docs.find((d: any) => d.kind === "store")?.data?.name;
    await db.from("stores").update({ last_sync: new Date().toISOString(), ...(name ? { name: String(name).slice(0, 120) } : {}) }).eq("id", store.id);
    return json({ ok: true, upserted: docs.length, deleted: deleted.length });
  }

  if (action === "keys") {
    if (req.method === "GET") {
      const { data } = await db.from("api_keys").select("id, prefix, label, created_at, last_used, revoked").eq("store_id", store.id).order("created_at", { ascending: false });
      return json({ keys: data || [] });
    }
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const key = randomToken("tpos_", 24);
      const { data, error } = await db.from("api_keys").insert({ store_id: store.id, key_hash: await sha256(key), prefix: key.slice(0, 10), label: String(body.label || "AI agent").slice(0, 60) }).select("id, prefix, label, created_at").single();
      if (error) return fail(500, error.message);
      return json({ key, ...data });
    }
    if (req.method === "DELETE" && path[1]) {
      await db.from("api_keys").update({ revoked: true }).match({ id: path[1], store_id: store.id });
      return json({ ok: true });
    }
  }
  if (action === "store" && req.method === "DELETE") {
    await db.from("docs").delete().eq("store_id", store.id);
    await db.from("api_keys").delete().eq("store_id", store.id);
    await db.from("stores").delete().eq("id", store.id);
    return json({ ok: true });
  }
  if (action === "status") return json({ storeId: store.id, name: store.name, lastSync: store.last_sync });
  return fail(404, "Not found");
}

// ---------------- DATA (para sa REST at MCP) ----------------
async function getDocs(storeId: string, kind: string, from?: number, to?: number, limit = 5000) {
  let q = db.from("docs").select("data").eq("store_id", storeId).eq("kind", kind);
  if (from != null) q = q.gte("ts", from);
  if (to != null) q = q.lt("ts", to);
  if (from != null || to != null) q = q.order("ts", { ascending: false });
  const { data, error } = await q.limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => r.data);
}

function parseRange(fromS?: string | null, toS?: string | null, days = 1) {
  const p = (s?: string | null) => (s ? (/^\d+$/.test(s) ? Number(s) : Date.parse(s)) : NaN);
  let to = p(toS), from = p(fromS);
  if (isNaN(to)) to = Date.now();
  if (isNaN(from)) from = to - days * 86400000;
  if (toS && /^\d{4}-\d{2}-\d{2}$/.test(toS)) to += 86400000; // kasama ang buong araw
  return { from, to };
}

const n = (v: any) => (isFinite(Number(v)) ? Number(v) : 0);
const r = (v: number) => Math.round(v * 1000) / 1000;

async function storeInfo(store: any) {
  const [info] = await getDocs(store.id, "store");
  return { id: store.id, name: info?.name || store.name, currency: (info?.currency || "").trim(), decimals: info?.decimals ?? null, lastSync: store.last_sync };
}

async function summary(store: any, from: number, to: number) {
  const sales = (await getDocs(store.id, "sales", from, to)).filter((s: any) => !s.voided);
  let total = 0, profit = 0, credit = 0, discount = 0;
  const byMethod: Record<string, number> = {}, byCashier: Record<string, number> = {}, items: Record<string, any> = {};
  for (const s of sales) {
    total += n(s.total); discount += n(s.discount); credit += n(s.credit);
    let cost = 0;
    for (const it of s.items || []) {
      cost += (it.cost === "" || it.cost == null ? n(it.price) : n(it.cost)) * n(it.qty);
      const k = it.name;
      items[k] = items[k] || { name: k, qty: 0, amount: 0 };
      items[k].qty += n(it.qty); items[k].amount += n(it.price) * n(it.qty);
    }
    profit += n(s.total) - cost;
    const m = s.methodLabel || s.method || "cash";
    byMethod[m] = r((byMethod[m] || 0) + n(s.total));
    const c = s.cashier || "-";
    byCashier[c] = r((byCashier[c] || 0) + n(s.total));
  }
  const top = Object.values(items).sort((a: any, b: any) => b.amount - a.amount).slice(0, 10).map((x: any) => ({ ...x, qty: r(x.qty), amount: r(x.amount) }));
  return {
    from: new Date(from).toISOString(), to: new Date(to).toISOString(),
    receipts: sales.length, totalSales: r(total), estimatedProfit: r(profit), discounts: r(discount), creditSales: r(credit),
    averageReceipt: sales.length ? r(total / sales.length) : 0, byPaymentMethod: byMethod, byCashier, topProducts: top,
  };
}

async function products(store: any, q?: string | null, low?: boolean) {
  let list = await getDocs(store.id, "products");
  if (q) { const s = q.toLowerCase(); list = list.filter((p: any) => (p.name + " " + (p.barcode || "") + " " + (p.category || "")).toLowerCase().includes(s)); }
  if (low) list = list.filter((p: any) => n(p.stock) <= n(p.reorder));
  return list.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name))).map((p: any) => ({
    id: p.id, name: p.name, barcode: p.barcode || "", price: n(p.price), cost: p.cost === "" ? null : n(p.cost), unit: p.unit || "",
    stock: n(p.stock), reorderLevel: n(p.reorder), category: p.category || "", lowStock: n(p.stock) <= n(p.reorder),
  }));
}

async function salesList(store: any, from: number, to: number, limit: number) {
  const list = (await getDocs(store.id, "sales", from, to, Math.min(limit, 500)));
  return list.map((s: any) => ({
    id: s.id, receiptNo: s.no, time: new Date(s.time).toISOString(), total: n(s.total), discount: n(s.discount),
    method: s.methodLabel || s.method || "cash", credit: n(s.credit), customer: s.customerName || null, cashier: s.cashier || null,
    note: s.note || null, voided: !!s.voided, items: (s.items || []).map((i: any) => ({ name: i.name, qty: n(i.qty), price: n(i.price), unit: i.unit || "" })),
  }));
}

async function customers(store: any, withDebt?: boolean) {
  const [cs, sales, pays] = await Promise.all([getDocs(store.id, "customers"), getDocs(store.id, "sales"), getDocs(store.id, "payments")]);
  const bal: Record<string, { balance: number; spent: number; last: number }> = {};
  cs.forEach((c: any) => { bal[c.id] = { balance: 0, spent: 0, last: 0 }; });
  sales.forEach((s: any) => { const b = s.customerId && bal[s.customerId]; if (!b || s.voided) return; b.balance += n(s.credit); b.spent += n(s.total); b.last = Math.max(b.last, n(s.time)); });
  pays.forEach((p: any) => { const b = bal[p.customerId]; if (!b || p.voided) return; b.balance -= n(p.amount); });
  let list = cs.map((c: any) => ({ id: c.id, name: c.name, phone: c.phone || "", email: c.email || "", balance: r(bal[c.id].balance), totalPurchases: r(bal[c.id].spent), lastPurchase: bal[c.id].last ? new Date(bal[c.id].last).toISOString() : null, creditLimit: c.limit === "" || c.limit == null ? null : n(c.limit) }));
  if (withDebt) list = list.filter((c: any) => c.balance > 0).sort((a: any, b: any) => b.balance - a.balance);
  return list;
}

async function shifts(store: any, limit: number) {
  const list = (await getDocs(store.id, "shifts")).sort((a: any, b: any) => n(b.openedAt) - n(a.openedAt)).slice(0, limit);
  return list.map((s: any) => ({
    id: s.id, no: s.no, openedAt: new Date(s.openedAt).toISOString(), openedBy: s.openedBy || null, openingCash: n(s.openingCash),
    closedAt: s.closedAt ? new Date(s.closedAt).toISOString() : null, closedBy: s.closedBy || null,
    expectedCash: s.expected ?? null, countedCash: s.counted ?? null, difference: s.closedAt ? r(n(s.counted) - n(s.expected)) : null,
    cashMoves: (s.moves || []).map((m: any) => ({ type: m.type, amount: n(m.amount), note: m.note || "" })),
  }));
}

// ---------------- REST ----------------
function openapi(base: string) {
  const range = [
    { name: "from", in: "query", schema: { type: "string" }, description: "ISO date/time or YYYY-MM-DD (default: 24 hours ago)" },
    { name: "to", in: "query", schema: { type: "string" }, description: "ISO date/time or YYYY-MM-DD (inclusive day)" },
  ];
  const ok = { "200": { description: "OK", content: { "application/json": { schema: { type: "object" } } } } };
  return {
    openapi: "3.1.0",
    info: { title: "Store POS API", version: "1.0.0", description: "Read-only access to one store's POS data: sales summary, products and stock, receipts, customers with credit balance, and cash drawer shifts. Amounts are in the store currency (see /store)." },
    servers: [{ url: base }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    security: [{ bearer: [] }],
    paths: {
      "/store": { get: { operationId: "getStore", summary: "Store name, currency and last sync time", responses: ok } },
      "/summary": { get: { operationId: "getSalesSummary", summary: "Sales totals, profit, payment methods, cashiers and top products for a period", parameters: range, responses: ok } },
      "/products": { get: { operationId: "listProducts", summary: "Products with price, cost and stock", parameters: [{ name: "q", in: "query", schema: { type: "string" } }, { name: "low", in: "query", schema: { type: "boolean" }, description: "Only low or out of stock" }], responses: ok } },
      "/sales": { get: { operationId: "listSales", summary: "Receipts in a period, newest first", parameters: [...range, { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 500 } }], responses: ok } },
      "/customers": { get: { operationId: "listCustomers", summary: "Customers with credit balance and purchase totals", parameters: [{ name: "debt", in: "query", schema: { type: "boolean" }, description: "Only customers who owe money" }], responses: ok } },
      "/shifts": { get: { operationId: "listShifts", summary: "Cash drawer shifts with opening, expected and counted cash", parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 20 } }], responses: ok } },
    },
  };
}

async function handleApi(req: Request, url: URL, path: string[], base: string) {
  if (path[0] === "openapi.json") return json(openapi(base + "/api"));
  const store = await storeByApiKey(bearer(req, url));
  if (!store) return fail(401, "Invalid or missing API key");
  const q = url.searchParams;
  const { from, to } = parseRange(q.get("from"), q.get("to"), path[0] === "sales" ? 7 : 1);
  switch (path[0]) {
    case "store": return json(await storeInfo(store));
    case "summary": return json({ store: await storeInfo(store), ...(await summary(store, from, to)) });
    case "products": return json({ products: await products(store, q.get("q"), q.get("low") === "true" || q.get("low") === "1") });
    case "sales": return json({ sales: await salesList(store, from, to, Number(q.get("limit") || 100)) });
    case "customers": return json({ customers: await customers(store, q.get("debt") === "true" || q.get("debt") === "1") });
    case "shifts": return json({ shifts: await shifts(store, Number(q.get("limit") || 20)) });
  }
  return fail(404, "Not found");
}

// ---------------- MCP ----------------
const rangeProps = {
  from: { type: "string", description: "Start date/time (ISO 8601 or YYYY-MM-DD). Default: 24 hours ago." },
  to: { type: "string", description: "End date (ISO 8601 or YYYY-MM-DD, inclusive). Default: now." },
};
const TOOLS = [
  { name: "get_store", description: "Get the store's name, currency and when it last synced.", inputSchema: { type: "object", properties: {} } },
  { name: "get_sales_summary", description: "Sales total, estimated profit, number of receipts, payment methods, sales per cashier and top products for a period.", inputSchema: { type: "object", properties: rangeProps } },
  { name: "list_products", description: "List products with price, cost, unit and stock. Use low_stock_only to see what needs reordering.", inputSchema: { type: "object", properties: { query: { type: "string" }, low_stock_only: { type: "boolean" } } } },
  { name: "list_sales", description: "List receipts (newest first) with items, payment method, customer, cashier and order note.", inputSchema: { type: "object", properties: { ...rangeProps, limit: { type: "integer", maximum: 500 } } } },
  { name: "list_customers", description: "List customers with phone, email, credit balance (utang) and total purchases.", inputSchema: { type: "object", properties: { with_balance_only: { type: "boolean" } } } },
  { name: "list_shifts", description: "Cash drawer shifts: opening cash, cash in/out, expected vs counted cash (short/over).", inputSchema: { type: "object", properties: { limit: { type: "integer" } } } },
];

async function callTool(store: any, name: string, a: any) {
  const { from, to } = parseRange(a?.from, a?.to, name === "list_sales" ? 7 : 1);
  switch (name) {
    case "get_store": return storeInfo(store);
    case "get_sales_summary": return { store: await storeInfo(store), ...(await summary(store, from, to)) };
    case "list_products": return { products: await products(store, a?.query, !!a?.low_stock_only) };
    case "list_sales": return { sales: await salesList(store, from, to, Number(a?.limit || 100)) };
    case "list_customers": return { customers: await customers(store, !!a?.with_balance_only) };
    case "list_shifts": return { shifts: await shifts(store, Number(a?.limit || 20)) };
  }
  throw new Error("Unknown tool: " + name);
}

async function handleMcp(req: Request, url: URL) {
  if (req.method === "GET") return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "POST" } });
  if (req.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
  const store = await storeByApiKey(bearer(req, url));
  if (!store) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid or missing API key" } }, 401);
  const body = await req.json().catch(() => null);
  if (!body) return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  const one = async (m: any) => {
    if (m.id === undefined || m.id === null) return null; // notification
    try {
      switch (m.method) {
        case "initialize":
          return { jsonrpc: "2.0", id: m.id, result: {
            protocolVersion: m.params?.protocolVersion || "2025-06-18",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "store-pos", version: "1.0.0" },
            instructions: "Read-only data from a small store's POS. Amounts use the store currency from get_store.",
          } };
        case "ping": return { jsonrpc: "2.0", id: m.id, result: {} };
        case "tools/list": return { jsonrpc: "2.0", id: m.id, result: { tools: TOOLS } };
        case "tools/call": {
          const out = await callTool(store, m.params?.name, m.params?.arguments || {});
          return { jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out } };
        }
        default: return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found: " + m.method } };
      }
    } catch (e) {
      return { jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: String((e as Error).message || e) }] } };
    }
  };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(one))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await one(body);
  return out ? json(out) : new Response(null, { status: 202, headers: CORS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("pos");
  const path = i >= 0 ? parts.slice(i + 1) : parts;
  const base = (Deno.env.get("SUPABASE_URL") || url.origin) + "/functions/v1/pos";
  try {
    if (path[0] === "sync") return await handleSync(req, url, path.slice(1));
    if (path[0] === "api") return await handleApi(req, url, path.slice(1), base);
    if (path[0] === "mcp") return await handleMcp(req, url);
    return json({ name: "Store POS cloud", openapi: base + "/api/openapi.json", mcp: base + "/mcp" });
  } catch (e) {
    return fail(500, String((e as Error).message || e));
  }
});
