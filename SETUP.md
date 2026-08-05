# Xobriq — Setup & Verify Run-book

Everything here runs on **your** machine. This is the checklist to stand up what's been scaffolded and confirm it's green, before we build the rest.

## Prerequisites
- Node ≥ 20, pnpm ≥ 9 (`npm install -g pnpm`)
- A GitHub repo (`xobriq`, private) and a Supabase project (region chosen to match your Render region)
- Supabase CLI (`npm install -g supabase`) for migrations

## 1. Install
```bash
cd xobriq
pnpm install          # installs all workspace packages
```

## 2. Build the shared contract (everything imports it)
```bash
pnpm --filter @xobriq/shared build
```
Expected: a `packages/shared/dist/` appears, no errors.

## 3. Typecheck + run the domain tests
```bash
pnpm --filter @xobriq/api test
```
Expected: the tests in `apps/api/test/domain.test.ts` pass — the cascade planner, decision policy, confidence, hard rules, and the scorer config-guard. **This is your proof the pure decision logic is correct.** If these are green, the hardest-to-get-right part of the engine is sound.

> Note: these domain tests are pure (no DB). The full 7-persona acceptance suite comes once the provider + persistence layers are built — it needs Supabase.

## 4. Apply the database migrations to Supabase
```bash
# from apps/api, with your project linked:
supabase link --project-ref <your-project-ref>
supabase db push        # applies migrations/0001 and 0002
```
Or paste `migrations/0001_core_schema.sql` then `0002_functions.sql` into the Supabase SQL editor **in order**, once — but the CLI is the right long-term path (migrations are code, not dashboard actions).

Expected: 12 tables, 3 functions, RLS enabled on every table. Verify in the Supabase table editor.

> Do this against a **throwaway project first** to confirm the SQL applies clean, before your real project.

## 5. Environment
Copy `.env.example` to `.env` in `apps/api` and fill:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ENTITY_HASH_PEPPER` — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `PORT`, `SANDBOX_TEST_API_KEY`

## What exists right now (verified: typechecks clean under strict TS)
- `packages/shared` — the decision contract, verdict language, typed feature registry
- `apps/api/migrations` — full schema + hash-chain audit fn + graph RPCs (real SQL)
- `apps/api/src/domain` — scorer, confidence, hard rules, **cascade planner (pure)**, decision policy
- `apps/api/src/shared` — Result type, typed errors
- `apps/api/test/domain.test.ts` — unit tests for all of the above

## What's NOT built yet (next)
- Provider port + mock personas + Peleza/Creditinfo adapters
- Persistence adapters (decisions, audit, graph, idempotency, cases)
- The cascade orchestrator that wires planner → gatherer → sink
- HTTP layer (Fastify routes, auth, `initiated_by`)
- The 7-persona acceptance + degraded-path tests
- The portal (run-a-check → result → history → review queue)

## If something fails
- `pnpm install` errors → check Node ≥ 20 and pnpm ≥ 9.
- Shared import not found in api → confirm `pnpm install` linked the workspace (`@xobriq/shared` should resolve).
- Migration errors → apply `0001` before `0002`; `0002` depends on tables from `0001`.
