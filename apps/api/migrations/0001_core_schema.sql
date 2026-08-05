-- ============================================================================
-- Migration 0001 — core schema
--
-- This file is the source of truth for the database. In the previous build
-- the schema, the audit-chain function, and the graph RPCs existed ONLY in
-- the Supabase project — invisible to code review, unversioned. That was the
-- single biggest gap the architecture review found. Here everything is in the
-- repo, applied via the Supabase CLI, reviewable in a pull request.
--
-- Apply with:  supabase db push   (or the migration is picked up by CI)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid, digest

-- ---------------------------------------------------------------------------
-- Customers (tenants)
-- ---------------------------------------------------------------------------
create table customers (
  id          text primary key,
  name        text not null,
  plan        text not null default 'trial',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- API keys — stored as SHA-256 hashes; the raw secret is returned once and
-- lives nowhere on the server.
-- ---------------------------------------------------------------------------
create table api_keys (
  id            text primary key,
  key_hash      text not null unique,
  key_prefix    text not null,            -- e.g. sk_test_ab12 — for dashboard display
  mode          text not null check (mode in ('test','live')),
  customer_id   text not null references customers(id) on delete cascade,
  customer_name text,
  scopes        text[] not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index api_keys_customer_idx on api_keys(customer_id);

-- ---------------------------------------------------------------------------
-- Dashboard/portal sessions — acctok_ tokens issued at login (hashed).
-- ---------------------------------------------------------------------------
create table account_sessions (
  id           text primary key,
  token_hash   text not null unique,
  customer_id  text not null references customers(id) on delete cascade,
  user_email   text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index account_sessions_customer_idx on account_sessions(customer_id);

-- ---------------------------------------------------------------------------
-- Entities — the graph nodes. Every identifier is HMAC-tokenised (key_hash)
-- BEFORE it reaches this table. Raw PII (national_id, phone, account numbers,
-- device fingerprints) never lands here.
-- ---------------------------------------------------------------------------
create table entities (
  id                     text primary key,
  entity_type            text not null check (entity_type in ('person','device','phone','bank_account','kra_pin')),
  key_hash               text not null,
  is_flagged             boolean not null default false,
  flagged_reason         text,
  flagged_by_customer_id text references customers(id),
  flagged_at             timestamptz,
  first_seen             timestamptz not null default now(),
  unique (entity_type, key_hash)
);
create index entities_flagged_idx on entities(id) where is_flagged;

-- ---------------------------------------------------------------------------
-- Entity links — the graph edges. A person used a device, disbursed to an
-- account, etc. Deduplicated by (from, to, relation).
-- ---------------------------------------------------------------------------
create table entity_links (
  from_entity_id  text not null references entities(id) on delete cascade,
  to_entity_id    text not null references entities(id) on delete cascade,
  relation        text not null,
  created_at      timestamptz not null default now(),
  primary key (from_entity_id, to_entity_id, relation)
);
create index entity_links_to_idx on entity_links(to_entity_id, relation);

-- ---------------------------------------------------------------------------
-- Decisions — one row per decision. initiated_by/initiated_by_user record
-- honest provenance: 'manual' for portal checks, 'api' for automated calls.
-- ---------------------------------------------------------------------------
create table decisions (
  id                text primary key,
  customer_id       text not null references customers(id) on delete cascade,
  event_type        text not null,
  reference_id      text,
  entity_id         text references entities(id),
  initiated_by      text not null default 'api' check (initiated_by in ('api','manual')),
  initiated_by_user text,
  recommended_action text not null,
  risk_score        int not null,
  risk_band         text not null,
  confidence_score  int not null,
  risk_reasons      jsonb not null,
  explanation       jsonb not null,
  signals_used      jsonb not null,
  model_version     text not null,
  latency_ms        int,
  created_at        timestamptz not null default now()
);
create index decisions_customer_created_idx on decisions(customer_id, created_at desc);
create index decisions_entity_idx on decisions(entity_id);
create index decisions_initiated_by_idx on decisions(customer_id, initiated_by, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit chain — tamper-evident. Each row's hash chains to the previous row's
-- hash. append_audit_log() (migration 0002) is the ONLY writer and locks
-- audit_chain_state FOR UPDATE so concurrent appends can't fork the chain.
-- ---------------------------------------------------------------------------
create table audit_chain_state (
  id        int primary key default 1,
  last_seq  bigint not null default 0,
  last_hash text not null default '',
  constraint audit_chain_singleton check (id = 1)
);
insert into audit_chain_state (id) values (1);

create table audit_log (
  id           text primary key,
  seq          bigint not null unique,
  decision_id  text not null,
  payload      jsonb not null,          -- PII-redacted by the caller
  prev_hash    text not null,
  hash         text not null,
  created_at   timestamptz not null default now()
);
create index audit_log_decision_idx on audit_log(decision_id, seq);

-- Durable outbox for audit writes that failed on the hot path — drained by a
-- timer. A decision that was acted on but never audited is a compliance gap,
-- so it is buffered here, never silently lost. (Review Priority 3.)
create table pending_audit (
  id          text primary key,
  decision_id text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  attempts    int not null default 0,
  last_error  text
);

-- ---------------------------------------------------------------------------
-- Idempotency — identical (customer, key, body) returns the stored response.
-- ---------------------------------------------------------------------------
create table idempotency_keys (
  customer_id      text not null references customers(id) on delete cascade,
  idempotency_key  text not null,
  request_hash     text not null,
  response_status  int not null,
  response_body    jsonb not null,
  created_at       timestamptz not null default now(),
  primary key (customer_id, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- Cases — a REVIEW verdict opens a case for an analyst to resolve. The
-- resolution's reason_code is the training label.
-- ---------------------------------------------------------------------------
create table cases (
  id           text primary key,
  customer_id  text not null references customers(id) on delete cascade,
  decision_id  text not null references decisions(id) on delete cascade,
  entity_id    text references entities(id),
  status       text not null default 'open' check (status in ('open','resolved')),
  risk_score   int not null,
  resolution   text,
  reason_code  text,
  resolved_by  text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index cases_customer_status_idx on cases(customer_id, status, risk_score desc);

-- ---------------------------------------------------------------------------
-- Feedback — reported outcomes. Training labels + consortium flag source.
-- ---------------------------------------------------------------------------
create table feedback (
  id                      text primary key,
  decision_id             text not null references decisions(id) on delete cascade,
  outcome                 text not null,
  fraud_type              text,
  loss_amount             numeric,
  reported_by_customer_id text not null references customers(id),
  created_at              timestamptz not null default now()
);
create index feedback_decision_idx on feedback(decision_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security — every tenant table has RLS ENABLED with NO policies,
-- i.e. deny-all for the anon/authenticated roles. The API connects with the
-- service-role key (which bypasses RLS) and is the only writer/reader. This
-- makes accidental cross-tenant access from a mis-scoped client impossible:
-- there is no policy that would ever permit it.
-- ---------------------------------------------------------------------------
alter table customers        enable row level security;
alter table api_keys         enable row level security;
alter table account_sessions enable row level security;
alter table entities         enable row level security;
alter table entity_links     enable row level security;
alter table decisions        enable row level security;
alter table audit_log        enable row level security;
alter table audit_chain_state enable row level security;
alter table pending_audit    enable row level security;
alter table idempotency_keys enable row level security;
alter table cases            enable row level security;
alter table feedback         enable row level security;
