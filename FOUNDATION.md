# Xobriq — Foundation & Architecture Decision Record

> **Day one.** This document is the source of truth for how the project is built. It exists so that every structural decision is explicit and reviewable *before* code, not discovered later. Nothing gets scaffolded until this is agreed. When a future decision conflicts with this doc, we change this doc first, deliberately.

**Status:** DRAFT for review · **Author:** principal architect · **Supersedes:** the previous `xobriq-kyc-mvp` implementation (good logic, scattered structure — we carry the logic, not the layout).

---

## 0. What we are building (and what we are not)

**Xobriq is the decisioning layer for African lenders.** It consumes identity/credit/graph signals and returns one explained verdict — `ALLOW · BLOCK · REVIEW · STEP_UP` — that a lender can act on and defend. It does **not** perform identity verification itself; it consumes providers behind an abstraction.

**V1 product = the manual-check portal.** A lender's staff log in, enter an applicant, and get an explained verdict — with **zero integration**. Value lands before any dev work. API integration and automated/shadow scoring are deliberate fast-follows, not V1.

**The core insight the whole product serves:** an identity can be perfectly valid and the action still be fraud. The fraud lives in the *combination* of signals. Every design choice serves making that combination legible and defensible.

### In scope for V1
Manual check (ID + amount → verdict) · explained result (verdict, reasons, evidence, signals) · check history + re-check + export · review queue to resolve `REVIEW` outcomes with a mandatory reason code · honest `initiated_by` provenance · hash-chained audit · single-tenant entity graph.

### Explicitly NOT in V1 (named so we don't drift)
Automated/shadow scoring · API-integration tooling & SDKs · buyer/compliance/engineer dashboards · cross-customer consortium propagation · trained ML models · the agentic layer · secondary verticals · multi-region. Each is real and sequenced in the roadmap — none is built now.

---

## 1. Repository structure — lightweight monorepo

**Decision:** one Git repo, **pnpm workspaces**, three packages. No Turborepo/Nx (overkill for this team size; add later non-breaking if build caching is ever needed).

**Why:** the previous build scattered `src` + `console` + `site` and hand-copied the decision-response shape between them, which drifts. A shared package makes the contract defined **once** and compiler-enforced across API and portal. This is the single biggest structural improvement over the last build, at near-zero tooling cost.

```
xobriq/
├─ package.json                # workspace root, scripts, pnpm config
├─ pnpm-workspace.yaml
├─ tsconfig.base.json          # shared strict TS config, extended by each package
├─ .env.example                # documents every env var; never real secrets
├─ FOUNDATION.md               # this document
├─ README.md
├─ docs/                       # decision records, runbooks
│
├─ packages/
│  └─ shared/                  # @xobriq/shared — the contract, imported by both
│     ├─ src/
│     │  ├─ decision.ts        # DecisionRequest, DecisionResponse, RiskReason, SignalUsage — THE contract
│     │  ├─ verdict.ts         # DecisionAction, RiskBand, verdict colour tokens
│     │  ├─ features.ts        # typed FeatureKey registry (fixes the stringly-typed bag)
│     │  └─ index.ts
│     └─ package.json
│
├─ apps/
│  ├─ api/                     # @xobriq/api — the decision engine (Fastify + TS, hexagonal)
│  │  ├─ src/
│  │  │  ├─ domain/            # pure core, no I/O — entities, value objects, services
│  │  │  ├─ application/       # use cases — the cascade orchestrator lives here, extracted
│  │  │  ├─ infrastructure/    # adapters — providers, persistence, config
│  │  │  ├─ interfaces/http/   # routes, middleware, schemas
│  │  │  └─ index.ts
│  │  ├─ migrations/           # REAL SQL, versioned, in the repo (see §6)
│  │  ├─ test/
│  │  └─ package.json
│  │
│  └─ portal/                  # @xobriq/portal — the manual-check portal (Next.js 14)
│     ├─ app/
│     ├─ components/
│     ├─ lib/
│     └─ package.json
│
└─ .github/workflows/          # CI: typecheck, test, build, all packages
```

**Rule:** dependencies point inward. `portal` and `api` depend on `shared`. `shared` depends on nothing. `api/domain` imports nothing from `api/infrastructure`.

---

## 2. The shared contract — one source of truth

The decision request/response is defined **once** in `@xobriq/shared` and imported everywhere. The API's response *is* this type; the portal renders *this* type. No hand-copied shapes.

This directly fixes two review findings: (a) contract drift between back and front end, and (b) the stringly-typed `Features` bag — feature keys become a typed registry so a typo is a compile error, not a silently-missed fraud signal.

```ts
// packages/shared/src/verdict.ts
export type DecisionAction = "ALLOW" | "BLOCK" | "REVIEW" | "STEP_UP";
export type RiskBand = "low" | "moderate" | "elevated" | "critical";
export type InitiatedBy = "api" | "manual";

// packages/shared/src/decision.ts
export interface DecisionRequest {
  event_type: "loan_application";
  reference_id?: string;
  subject: { national_id: string; phone?: string };
  event_data?: {
    amount?: number;
    currency?: string;
    disbursement_account?: { account_name?: string; account_number?: string };
  };
  initiated_by: InitiatedBy;          // NEW — honest provenance, default "api"
  initiated_by_user?: string;         // set for manual checks (operator id/email)
  device?: { fingerprint?: string; session_token?: string };
}

export interface RiskReason {
  code: string;
  category: string;
  weight: number;                     // signed: + raises risk, − lowers it
  direction: "increases_risk" | "decreases_risk";
  severity: "info" | "low" | "medium" | "high" | "critical";
  evidence: Record<string, unknown>;
}

export interface SignalUsage {
  source: string;
  status: "success" | "not_found" | "timeout" | "error" | "skipped";
  latency_ms: number | null;
  cost_tier: 0 | 1 | 2;
  reason?: string;
}

export interface DecisionResponse {
  id: string;
  object: "decision";
  created_at: string;
  event_type: string;
  reference_id: string | null;
  initiated_by: InitiatedBy;          // echoed back, persisted, audited
  recommended_action: DecisionAction;
  risk_score: number;                 // 0–1000
  risk_band: RiskBand;
  confidence_score: number;           // 0–100
  risk_reasons: RiskReason[];         // sorted by |weight| desc
  explanation: {
    human: string;
    machine: { primary_driver: string | null; risk_categories: Record<string, number>; model_version: string };
  };
  step_up_options: { method: string; expected_confidence_gain: number }[];
  signals_used: SignalUsage[];
  entity: { id: string; is_new: boolean; lifetime_decisions: number };
  audit_id: string;
  latency_ms: number;
}
```

---

## 3. The decision engine — clean this time (review fixes baked in)

We carry over the *logic* my review praised (additive scorer, confidence-as-coverage, hard-rules-first, graph-count-before-link, degraded-path handling) but fix the *structure* it flagged. Three changes from last time:

### 3.1 The cascade is extracted from the god-method
Last time `decide()` was 256 lines doing eight jobs. This time the flow is three seams:

- **`CascadePlanner`** — a *pure function*: given what we know so far (which tiers ran, current confidence) and the thresholds, return the next step (`fetch tier` or `decide`). No I/O. Fully table-testable across every confidence/threshold combination.
- **`SignalGatherer`** — owns provider + graph I/O behind one interface. The only place that touches the outside world during a decision.
- **`DecisionSink`** — owns persist + audit + case-creation *after* the decision is computed, in one place, with the degraded-path handling (a failed audit is logged, alerted, and buffered — never a lost record; see §6.3).

```ts
// pure — the whole cascade policy, testable with zero mocks
type CascadeStep =
  | { kind: "fetch"; tier: "2a" | "2b"; signals: FeatureKey[] }
  | { kind: "decide" };

function planNextStep(state: CascadeState, thresholds: Thresholds): CascadeStep { /* ... */ }
```

### 3.2 Config is loaded once, consistently, hot-reloadable on purpose
Last time weights were frozen at boot while thresholds were re-read from disk *every request* — inconsistent, and a file read on the hot path. This time: one config module, cached in memory, with an explicit `refreshConfig()` (triggered by an admin action/SIGHUP). Neither scorer nor engine touches the filesystem on the request path. When config later moves to a DB table, this is the seam.

### 3.3 The provider port stays — it was right
`IdentityProvider` wraps all feeds; `MockProvider` (deterministic personas) and `PelezaProvider` (real shapes) implement it; the core never names a vendor. Unchanged — it was the best part of the last build. Adding a future vendor is a new adapter, zero core change.

---

## 4. The portal — manual-check-first

Build priority (this is the whole V1 UI):

1. **Run a check** (hero) — national ID + amount required; phone, account name optional. → `POST /v1/decisions` with `initiated_by:"manual"`.
2. **Check result** — verdict stamp · counterfactual line (the signature) · evidence pack · diverging signed-reason bars · signals-consulted chips · next-step guidance · save/export.
3. **Check history** — list, open, re-check, filter, export.
4. **Review queue** (secondary) — resolves `REVIEW` cases with a mandatory reason code (the training label). Kept so REVIEW outcomes aren't dead ends.

Verdict colour system (green/amber/violet/red = allow/step-up/review/block), used only as signal, never colour-alone. Defined once in `@xobriq/shared`, consumed by the portal's Tailwind theme. Full UI spec lives in the portal build prompt; this doc pins the contract and scope.

---

## 5. Technology decisions (with the reasoning)

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces | shared contract, minimal tooling |
| Language | TypeScript everywhere, strict | one language; shared types; team fluency |
| API framework | **Fastify** | faster + first-class schema validation vs Express; the previous Express app works but Fastify is the cleaner default for a fresh start |
| DB | **Supabase (Postgres + RLS)** | DB + auth + row-security in one managed service; RLS is the tenant-isolation primitive |
| API hosting | Render (always-on) | no cold starts on a fraud call; **region-pinned to Supabase** |
| Portal hosting | Vercel | native Next.js home |
| Validation | Zod at the HTTP edge | typed, coerced input; core only sees valid data |
| Explanation | template (always on) + optional constrained LLM | narration can never contradict the score |
| Testing | Vitest + the 7-persona acceptance suite | personas are the definition of "done"; **plus** degraded-path tests this time |
| Migrations | **SQL in the repo** (see §6) | the review's biggest gap — critical logic must be reviewable & versioned |

**The one hard infra rule:** Render and Supabase in the **same region**. The decision path makes multiple DB round-trips; a region mismatch adds ~200ms per call and breaks the latency budget. Confirm before any production data.

---

## 6. Database — schema and migrations live IN THE REPO

This is the review's biggest fix. Last time the schema, the audit-chain locking function, and the graph traversal RPCs existed only in the Supabase project — invisible to code review, unversioned. This time every table, function, policy, and index is a numbered SQL migration in `apps/api/migrations/`, applied via the Supabase CLI, reviewable in a PR.

### 6.1 Core tables (first migration)
`customers` · `api_keys` (hashed) · `account_sessions` · `decisions` (incl. `initiated_by`, `initiated_by_user`) · `audit_log` (hash-chained) · `audit_chain_state` (the locked row) · `entities` (tokenised key_hash) · `entity_links` · `idempotency_keys` · `cases` · `feedback`.

### 6.2 Functions & policies (versioned SQL, not hidden)
- `append_audit_log(...)` — the hash-chain append with `SELECT ... FOR UPDATE` on `audit_chain_state`. **This is the most important correctness guarantee in the system; it must be in the repo.**
- `graph_linked_entity_count(...)` and `graph_entity_flagged(...)` — the graph traversal RPCs.
- RLS: enabled on all tenant tables, deny-all for anon/authenticated (the service-role API is the only writer). Policies written as SQL, reviewed.

### 6.3 The audit backstop (review Priority 3)
A failed audit write is never silently lost. On failure: log loudly, increment an alertable metric, and write to a durable `pending_audit` outbox drained on a timer. A decision that was acted on but never recorded is the one gap a compliance product cannot have.

### 6.4 PII discipline
Raw PII (national_id, phone, account numbers, device fingerprints) is HMAC-tokenised with a pepper before entering `entities`. Audit evidence is redacted. Repos ship **synthetic fixtures only** — real provider payloads never committed, logged, or sent to an LLM. Non-negotiable.

---

## 7. Environments & setup (do these in parallel with the build)

**GitHub:** one new private repo `xobriq`. Branch protection on `main` (PR + green CI). CI runs typecheck + test + build across all packages.

**Supabase:** one new project, region chosen to match the Render region. Apply migrations via the Supabase CLI from `apps/api/migrations/` (not the dashboard SQL editor — migrations are code). Service-role key in the API's server env only; never in the portal, never committed.

**Secrets (documented in `.env.example`, real values never committed):**
`SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `ENTITY_HASH_PEPPER` (rotating it orphans entity hashes — treat as a credential) · `PORT` · `SANDBOX_TEST_API_KEY` · optional `ENABLE_LLM_NARRATION` + `ANTHROPIC_API_KEY`.

---

## 8. Definition of done for the foundation (before feature work)

1. Monorepo scaffolds and builds green (`pnpm install && pnpm build`) with the three packages.
2. `@xobriq/shared` exports the decision contract; API and portal both import it; no duplicated shapes.
3. First SQL migration applies cleanly to a fresh Supabase project and creates every table/function/policy in §6.
4. The 7-persona acceptance suite passes against the rebuilt engine, **plus** a degraded-path test (forced audit failure → decision still returns + gap signalled).
5. `initiated_by` flows end to end: a manual check is recorded as `"manual"`, an API call defaults to `"api"`.
6. `.env.example` documents every var; no secret is committed; region co-location confirmed.

---

## 9. Sequence from here (day-by-day, once this doc is agreed)

1. **This doc reviewed & agreed** ← we are here. Nothing scaffolds until you sign off.
2. Scaffold the monorepo + `@xobriq/shared` contract + `tsconfig.base` + CI skeleton.
3. First SQL migration (schema + functions + RLS) — reviewable, applied to the new Supabase project.
4. Rebuild the engine clean: domain → planner/gatherer/sink → provider port → persona suite + degraded tests.
5. Wire the HTTP layer + `initiated_by`.
6. Build the portal: run-a-check → result → history → review queue.
7. Manual end-to-end against the sandbox personas; then a real Peleza/Creditinfo adapter; then a design partner.

---

### Open questions for you before I scaffold
- **Region:** which Render/Supabase region? (Your last project was `eu-north-1`. For Kenya latency, consider whether an EU region is acceptable for the trial or if you want the closest available — this is a real latency + data-residency call worth making consciously.)
- **Repo name & visibility:** `xobriq`? private (yes, given PII handling)?
- **Anything in this foundation you'd change** before I turn it into code — because after §9 step 2, changing §1–§6 gets progressively more expensive.
