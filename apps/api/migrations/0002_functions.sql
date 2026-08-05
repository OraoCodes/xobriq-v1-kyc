-- ============================================================================
-- Migration 0002 — functions (the correctness-critical logic)
--
-- These functions hold the guarantees that matter most in the system:
--   1. append_audit_log — the tamper-evident hash chain, serialised by a row
--      lock so concurrent appends cannot fork it.
--   2. graph_linked_entity_count / graph_entity_flagged — the consortium
--      graph traversal used to detect shared devices, mule accounts, and
--      fraud-linked entities.
-- In the previous build these lived only in the Supabase project and were
-- unreviewable. Keeping them here, versioned, is the whole point.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- append_audit_log — append one hash-chained row.
--
-- Concurrency: locks the single audit_chain_state row FOR UPDATE, so two
-- concurrent decisions serialise here and the chain is strictly ordered.
-- The hash binds this row to the previous one; any tampering breaks the chain.
-- ---------------------------------------------------------------------------
create or replace function append_audit_log(
  p_id          text,
  p_decision_id text,
  p_payload     jsonb
)
returns table (id text, seq bigint, prev_hash text, hash text)
language plpgsql
as $$
-- `returns table (id ...)` puts `id` in scope as an OUT parameter for the
-- whole function body, so every reference to audit_chain_state.id below
-- must be table-qualified or Postgres raises "column reference is ambiguous".
declare
  v_prev_hash text;
  v_seq       bigint;
  v_hash      text;
begin
  -- Serialise all appends on the singleton chain-state row.
  select last_hash, last_seq
    into v_prev_hash, v_seq
    from audit_chain_state
   where audit_chain_state.id = 1
     for update;

  v_seq := v_seq + 1;

  -- hash = sha256(prev_hash || seq || decision_id || payload)
  v_hash := encode(
    digest(v_prev_hash || v_seq::text || p_decision_id || p_payload::text, 'sha256'),
    'hex'
  );

  insert into audit_log (id, seq, decision_id, payload, prev_hash, hash)
  values (p_id, v_seq, p_decision_id, p_payload, v_prev_hash, v_hash);

  update audit_chain_state
     set last_seq = v_seq, last_hash = v_hash
   where audit_chain_state.id = 1;

  return query select p_id, v_seq, v_prev_hash, v_hash;
end;
$$;

-- ---------------------------------------------------------------------------
-- graph_linked_entity_count — count DISTINCT OTHER entities linked to a given
-- entity via a relation within a time window, excluding the current request's
-- own person entity.
--
-- This is the mule / device-sharing signal: "how many *other* identities
-- share this device / disbursement account?" Excluding the caller's own
-- entity is essential — a returning customer reusing their own device is
-- normal, not fraud.
-- ---------------------------------------------------------------------------
create or replace function graph_linked_entity_count(
  p_entity_id         text,
  p_relation          text,
  p_window_days       int,
  p_exclude_entity_id text
)
returns int
language sql
stable
as $$
  select count(distinct l.from_entity_id)::int
    from entity_links l
   where l.to_entity_id = p_entity_id
     and l.relation = p_relation
     and l.from_entity_id <> p_exclude_entity_id
     and l.created_at >= now() - make_interval(days => p_window_days);
$$;

-- ---------------------------------------------------------------------------
-- graph_entity_flagged — true if any of the given entities, or anything
-- within 2 hops of them, has been flagged as confirmed fraud by ANY customer.
-- This is the consortium signal (signal-level only — it never exposes another
-- customer's applicant data, just the fact of a flag).
--
-- 2-hop traversal: flagging a person propagates to future requests that share
-- their device or bank account.
-- ---------------------------------------------------------------------------
create or replace function graph_entity_flagged(
  p_entity_ids text[]
)
returns boolean
language sql
stable
as $$
  with seed as (
    select unnest(p_entity_ids) as id
  ),
  hop1 as (
    select to_entity_id as id from entity_links where from_entity_id in (select id from seed)
    union
    select from_entity_id as id from entity_links where to_entity_id in (select id from seed)
    union
    select id from seed
  ),
  hop2 as (
    select to_entity_id as id from entity_links where from_entity_id in (select id from hop1)
    union
    select from_entity_id as id from entity_links where to_entity_id in (select id from hop1)
    union
    select id from hop1
  )
  select exists (
    select 1 from entities e
     join hop2 h on h.id = e.id
    where e.is_flagged
  );
$$;
