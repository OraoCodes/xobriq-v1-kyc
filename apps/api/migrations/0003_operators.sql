-- ============================================================================
-- Migration 0003 — operators (the minimal account layer)
--
-- account_sessions (migration 0001) already models "a session exists, for
-- this customer, initiated by this email" — but there was nowhere to check
-- a password against. This table is exactly that: one operator identity per
-- email, scoped to one customer, with a hashed password. Additive only — no
-- existing table is altered.
--
-- Onboarding is deliberate and manual (see scripts/provision-org.ts): a row
-- here is created by hand for each partner, never through a public form.
-- ============================================================================

create table operators (
  id            text primary key,
  customer_id   text not null references customers(id) on delete cascade,
  email         text not null unique,
  password_hash text not null,
  role          text not null default 'admin' check (role in ('admin', 'operator')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index operators_customer_idx on operators(customer_id);

-- Row-Level Security — same posture as every other table: deny-all for
-- anon/authenticated, service-role is the only reader/writer.
alter table operators enable row level security;
