-- Cloud sync at API para sa POS. Lahat ng access ay dumadaan sa Edge Function (service role); walang direktang access ang anon.
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  device_token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_sync timestamptz
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  key_hash text not null unique,
  prefix text not null,
  label text not null default '',
  created_at timestamptz not null default now(),
  last_used timestamptz,
  revoked boolean not null default false
);
create index api_keys_store_idx on public.api_keys(store_id);

create table public.docs (
  store_id uuid not null references public.stores(id) on delete cascade,
  kind text not null check (kind in ('store','products','sales','customers','payments','receivings','shifts')),
  id text not null,
  data jsonb not null,
  ts bigint generated always as (case when jsonb_typeof(data->'time') = 'number' then (data->>'time')::numeric::bigint else null end) stored,
  updated_at timestamptz not null default now(),
  primary key (store_id, kind, id)
);
create index docs_kind_ts_idx on public.docs(store_id, kind, ts);

alter table public.stores enable row level security;
alter table public.api_keys enable row level security;
alter table public.docs enable row level security;
-- Walang policy: anon at authenticated ay walang access. Service role lang (Edge Function).
revoke all on public.stores, public.api_keys, public.docs from anon, authenticated;
