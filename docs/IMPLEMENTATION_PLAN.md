# Implementation Plan

## Working agreement
This plan describes future work only. Review the four planning documents before implementation. Follow AGENTS.md, read PRD.md before each feature, complete one task at a time, explain the next change before editing code, and keep diffs reviewable. No commit, push, deployment, or application implementation is authorized by this documentation task. T01–T14 cover the single-user localhost-only MVP; P01–P03 are a separate conditional post-MVP phase requiring approval.

Paths below are proposed. Each implementation task requires its acceptance criteria, applicable tests, documentation updates, no known critical defects, and a reviewable diff to meet its definition of done (DoD). Record exact commands/results; never claim unrun tests passed. Install only required dependencies during an authorized implementation task. Never delete existing user data without approval.

## T01 — Establish local project foundations
- Implementation status: foundations implemented; see docs/VERIFICATION.md for exact checks and limitations.
- Depends on: document review.
- Objective: create the frontend/backend TypeScript projects and predictable local commands.
- Expected files: root/package manifests and lockfile, `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig*`, `frontend/src/main.tsx`, `backend/package.json`, `backend/tsconfig.json`, `backend/src/app.ts`, `backend/src/server.ts`, `.gitignore`, `.env.example`, `README.md`.
- Acceptance: documented supported Node version; React/Vite/Tailwind, Express with strict backend TypeScript, SQLite driver, Recharts, Vitest/Supertest configured; dev proxy works; typed app construction separated from listener for tests; no secrets or database files tracked; both frontend and backend bind exclusively to loopback, with no public tunnel or LAN exposure. GET /api/health initially reports process readiness; add the final database readiness behavior in T03.
- Tests: minimal process health smoke test, frontend/backend typechecks, frontend build, backend compile/start check, local listener binding smoke check.
- DoD: common DoD plus exact setup/test commands and environment requirements documented.

## T02a — Validate money and identifiers
- Implementation status: implemented and verified. Pure validators use documented TypeError/RangeError exceptions; see README.md for input policies and docs/VERIFICATION.md for actual results. T02a behavior is unchanged by T02b.
- Depends on: T01.
- Objective: establish exact USD conversion and primitive integer validation without a database.
- Expected files: `backend/src/validation/money.ts`, `backend/src/validation/ids.ts`, their `.test.ts` files, `frontend/src/lib/money.ts`, related tests.
- Acceptance: cents are JSON numbers, safe integers in 1..100000000; IDs are positive safe integers; numeric path/query strings parse strictly; frontend decimal input converts exactly without rounding or floating-point multiplication. This validates individual values; aggregate overflow protection remains in T04/T06.
- Tests: minimum/maximum, zero, negatives, fractions, unsafe integers, wrong types, numeric-string bodies, malformed IDs, whitespace policy, exact `12.34` conversion, and excessive decimal places.
- DoD: common DoD plus isolated unit tests and documented parser behavior.

## T02b — Validate calendar values
- Implementation status: implemented and verified. Includes date/month/range validation and inclusive month boundaries, with 156 calendar tests passing under UTC, America/Chicago, and Pacific/Kiritimati. See docs/VERIFICATION.md. T02b behavior is unchanged by T02c.
- Depends on: T01.
- Objective: make date/month and inclusive range rules independently testable.
- Expected files: `backend/src/validation/calendar.ts`, `backend/src/validation/calendar.test.ts`.
- Acceptance: exact YYYY-MM-DD and YYYY-MM, real calendar dates, years 1900–9999, future dates allowed, and startDate <= endDate; month boundaries follow calendar dates rather than UTC timestamps.
- Tests: leap/non-leap February, impossible dates, malformed formats, reversed ranges, December transitions, and final supported December 9999 without requiring a year-10000 date.
- DoD: common DoD plus deterministic tests independent of machine timezone.

## T02c — Compose request schemas
- Implementation status: implemented and verified. Pure transaction/budget/query validators plus a shared request-object guard add 247 passing tests. See README.md for contracts and docs/VERIFICATION.md for results. Pure validators are unchanged by T02d.
- Depends on: T02a, T02b.
- Objective: validate complete transaction/budget inputs and list filters before database access.
- Expected files: `backend/src/validation/{transactions,budgets,queries}.ts`, corresponding `.test.ts` files.
- Acceptance: enum types, trimmed optional notes <=500 characters, q <=100, blank q semantics, full PUT fields, budget amounts/months, pagination defaults/range, scalar-only values, and rejection of unknown body/query fields match the API contract. Existence/category-type checks remain database-backed responsibilities in T04/T05/T08.
- Tests: valid create/replace/budget/filter shapes, missing required fields, omitted note, excessive note/search lengths, unknown keys, arrays/null/wrong JSON types, strict query parsing, and pageSize 1..100.
- DoD: common DoD plus schema tests runnable without an application server or database.

## T02d — Standardize HTTP validation errors
- Implementation status: implemented and verified. JSON parser, explicit validation adapter, safe error responses/logging, and not-found handling have 29 passing tests; see docs/VERIFICATION.md. T03 test harnesses now inject isolated databases for readiness.
- Depends on: T02c.
- Objective: integrate validators with a consistent safe HTTP boundary.
- Expected files: `backend/src/middleware/errors.ts`, `backend/src/app.ts`, `backend/src/middleware/errors.test.ts`.
- Acceptance: validation/malformed JSON returns 400, absent resources/routes 404, bodies above 16 KiB 413, unexpected failures 500; error envelope and field messages match architecture; no SQL, stack traces, notes, or full request bodies exposed/logged by default.
- Tests: Supertest against a minimal in-memory Express harness for malformed JSON, oversized bodies, invalid requests, missing paths, and unexpected failures; no SQLite fixture required.
- DoD: common DoD plus exact status/envelope checks. T02 is complete only after T02a–T02d; all existing safety requirements remain mandatory.

## T03 — Create durable schema and category catalog
- Implementation status: implemented and verified; awaiting review. Schema, atomic migrations/catalog seed, guarded test paths, persistent initialization command, and database readiness are covered by 75 new tests. See README.md and docs/VERIFICATION.md. T04 has not started.
- Depends on: T02a–T02d.
- Objective: establish constrained SQLite storage and safe initialization.
- Expected files: `backend/src/db/connection.ts`, `backend/src/db/migrate.ts`, `backend/src/db/seed.ts`, `backend/src/db/migrations/*`, DB tests, `.env.example`, `README.md`.
- Acceptance: entities, foreign keys, unique budgets, checks, and indexes match architecture; ordered TypeScript migrations and repeated seeds are safe; development/test paths cannot collide; initializer does not reset existing data; GET /api/health now checks database readiness without leaking database details.
- Tests: fresh/repeated initialization, invalid constraints and category/type relationships, atomic migration failure, close/reopen persistence, test-path guard, healthy/unavailable database readiness.
- DoD: common DoD plus documented database location and initialization command.

## T04 — Expose categories and transaction creation/detail
- Depends on: T03.
- Objective: deliver the first end-to-end ledger write/read API.
- Expected files: `backend/src/repositories/{categories,transactions}.ts`, `backend/src/services/transactions.ts`, `backend/src/routes/{categories,transactions}.ts`, `backend/src/app.ts`, API tests.
- Acceptance: category listing and transaction POST/detail GET match contracts; category/type validation, timestamps, Location header, safe-aggregate guard and parameterized SQL are implemented; invalid writes are atomic.
- Tests: valid income/expense, exact cents, optional notes, invalid/unknown inputs, missing IDs, mismatched categories, aggregate overflow rollback, database restart persistence.
- DoD: common DoD plus US-02 and relevant US-10 API criteria verified.

## T05 — Add ledger search and pagination
- Depends on: T04.
- Objective: retrieve a deterministic, filterable transaction list.
- Expected files: transaction repository/routes, list validators, integration tests.
- Acceptance: AND filters, literal note search, inclusive dates, stable sort, metadata and pagination match contract; invalid filters fail consistently; incompatible existing categories produce empty results. Resolve the ASCII-versus-Unicode case-folding decision in ARCHITECTURE.md section 8 before declaring FR-04/US-06 fully accepted.
- Tests: combined filters, ASCII and non-ASCII case behavior under the approved search decision, `%`/`_` literals, parameterized-query injection input, same-date ordering, date boundaries, empty/out-of-range pages, page limits, invalid category/date range. Until a narrower scope is approved, acceptance must satisfy the existing general case-insensitive requirement.
- DoD: common DoD plus US-03/US-06 backend criteria verified.

## T06 — Add transaction replacement and deletion
- Depends on: T04.
- Objective: complete mutable ledger APIs.
- Expected files: transaction repository/service/routes and integration tests.
- Acceptance: PUT replaces editable fields, preserves identity/createdAt, updates updatedAt, and applies create validation; DELETE returns 204; missing records return 404; failures preserve data.
- Tests: type/category/month changes, invalid edit rollback, aggregate guard rollback, delete and repeated delete, unchanged creation metadata.
- DoD: common DoD plus US-04/US-05 API criteria verified.

## T07 — Add monthly summary and analytics API
- Depends on: T05, T06.
- Objective: provide authoritative monthly totals and chart data.
- Expected files: `backend/src/repositories/summary.ts`, `backend/src/services/summary.ts`, `backend/src/routes/summary.ts`, unit/integration tests.
- Acceptance: income, expenses, balance, category distribution, and zero-filled daily series agree; month required; totals independent of list filters; consistent database snapshot.
- Tests: empty month, mixed types, negative balance, edits/deletes moving totals, leap February, December/year boundary, chart sum equality, safe integer outputs.
- DoD: common DoD plus US-01/US-08 calculation criteria verified.

## T08 — Add monthly budget API
- Depends on: T07.
- Objective: manage monthly category limits against actual spending.
- Expected files: budget repository/service/routes, budget validation, unit/integration tests.
- Acceptance: atomic upsert, deletion, all-category listing, null absent limits, remaining/utilization/status, and expense-only enforcement match contracts; deletion never removes transactions.
- Tests: repeated upsert uniqueness, under/at/over limit, no budget, zero spending, month isolation, invalid amounts/category/month, missing delete, spending changes after transaction mutations, foreign key enforcement.
- DoD: common DoD plus US-07 backend criteria verified.

## T09 — Build responsive shell and monthly dashboard
- Depends on: T07.
- Objective: establish UI navigation, shared month state, and summary cards.
- Expected files: `frontend/src/App.tsx`, `frontend/src/components/*`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/lib/api.ts`, `frontend/src/hooks/*`, stylesheet, component tests where appropriate.
- Acceptance: dashboard shows formatted totals; month selection updates monthly data; loading/empty/error/retry states, visible focus, responsive navigation, and stale-request protection work.
- Tests: money formatting and month-change/request-race behavior; manual 360/768/1440 layouts and keyboard walkthrough; typecheck/build.
- DoD: common DoD plus US-01 UI criteria and shared state behavior verified.

## T10 — Build transaction browsing and entry
- Depends on: T09, T05.
- Objective: let users record and find transactions from the UI.
- Expected files: `frontend/src/pages/Transactions.tsx`, transaction list/form/filter/pagination components, transaction hooks and tests.
- Acceptance: creation, category/type selection, note search, combined filters, reset, paging, and detail display work; failed saves retain fields; duplicate clicks disabled; successful saves refresh dependent views.
- Tests: exact cents submission, validation display, filter page reset and combined query building, pending/retry handling; manual create/search/reload persistence flow.
- DoD: common DoD plus US-02/US-03/US-06 UI criteria verified.

## T11 — Build transaction correction and removal
- Depends on: T10, T06.
- Objective: expose safe edit/delete flows.
- Expected files: transaction form/dialog/actions, transaction hooks, targeted tests.
- Acceptance: prefilled editing, matching categories on type changes, cancel, confirmation, focus restoration, missing record handling, and valid page adjustment work; all dependent views refresh; a refresh failure after successful save is reported distinctly.
- Tests: edit payload preservation, cancel/no request, confirm/delete, failed mutation retains row, save-success/refresh-failure avoids resubmission; manual month/category change and last-row deletion.
- DoD: common DoD plus US-04/US-05 and mutation feedback criteria verified.

## T12 — Build budget management UI
- Depends on: T11, T08.
- Objective: let users plan monthly limits and inspect actual spending.
- Expected files: `frontend/src/pages/Budgets.tsx`, budget editor/progress components, budget hooks and tests.
- Acceptance: month selection, upsert, confirmed deletion, spent/remaining/status, absent budgets, and over-100% text follow PRD; transaction changes refresh budget data.
- Tests: no-budget, under/at/over display, form cents, confirmation/cancel, month switching; manual persistence and transaction-to-budget update flow.
- DoD: common DoD plus US-07 UI criteria verified.

## T13 — Build spending charts and readable alternatives
- Depends on: T12.
- Objective: visualize the summary API with Recharts.
- Expected files: `frontend/src/pages/Analytics.tsx`, category/daily chart components, data-table alternatives, targeted tests.
- Acceptance: selected-month category and daily charts render supplied API values; empty spending state, responsive sizing, USD labels, and readable equivalent data available without hover.
- Tests: data-to-label mapping and empty states; manual month changes, totals comparison, keyboard access, and narrow-width rendering.
- DoD: common DoD plus US-08 criteria verified without duplicating financial calculations in the UI.

## T14 — Verify release readiness and document the demo
- Depends on: T13.
- Objective: produce a reproducible portfolio-ready local MVP.
- Expected files: `README.md`, `docs/VERIFICATION.md`, `docs/API.md`, optional explicitly invoked demo-data generator and benchmark script, fixes limited to findings.
- Acceptance: clean-database setup and representative opt-in synthetic demo dataset documented; no automatic overwrite/reset; story-to-evidence checklist complete; loopback-only listeners verified; actual 10,000-row measurements and limitations recorded on documented hardware; responsive/keyboard and server restart checks completed. Missing p95 <300 ms alone does not block MVP completion; record optimization follow-ups when needed.
- Tests: full Vitest/Supertest suites, frontend/backend typechecks, production frontend build, backend compile/start, clean initialization walkthrough, 30 warm sequential timings per list/summary endpoint with dataset/parameters and actual p95, manual CRUD/filter/budget/chart workflow at all target viewport widths on localhost.
- DoD: common DoD plus exact results, remaining limitations, demo walkthrough, and all PRD release criteria reviewed; performance threshold is aspirational. Stop for human review; do not deploy, commit, or push.

## Post-MVP deployment phase — separate approval and security gate
P01–P03 do not affect local MVP completion and are not authorized for execution by this document edit. Do not simply publish the localhost API. All future backend source, migrations, and tests remain TypeScript with Express.

### P01 — Approve the public-access security model
- Depends on: T14 review and explicit authorization to start post-MVP planning.
- Objective: select exactly one safe deployment model and a compatible host.
- Expected files: `docs/DEPLOYMENT.md`, updates to PRD/architecture/stories/plan; no production credentials in documentation.
- Acceptance: approve A (synthetic read-only demo with anonymous writes denied server-side and any retained maintenance path authorized) or B (authentication with per-user transaction/budget isolation). Record threat boundaries, origin/session/CSRF approach where applicable, hosting cost, persistent storage, backup retention, and publication approval procedure. Recommend A with all public HTTP mutations disabled for a junior portfolio.
- Tests: documented security verification matrix covering every read/write/maintenance endpoint and direct requests bypassing the UI; assess host persistence and single-instance compatibility.
- DoD: common DoD plus human approval of the concrete security/storage design. Resolve requirements before implementing public access.

### P02 — Implement the approved security and hosting preparation
- Depends on: P01 approval and implementation authorization.
- Objective: prepare a reviewable secure deployment candidate without publishing it.
- Expected files: TypeScript backend middleware/routes/tests; deployment configuration and `.env.example`; `docs/DEPLOYMENT.md`; option B only: reviewed ownership migrations and authentication UI/API changes.
- Acceptance: A uses only a dedicated synthetic database and rejects all anonymous mutations at the server; any retained maintenance route requires authorization. B derives ownership from verified identity and scopes individual records, lists, budgets, and summaries to the current user; user-scoped uniqueness and migration are reviewed. Configure HTTPS termination, origins, validated environment variables, secret handling, absolute persistent DATABASE_PATH, single SQLite instance, and backup/recovery. No personal database is uploaded.
- Tests: A direct POST/PUT/DELETE/maintenance denial and unchanged-data tests; B anonymous and cross-user read/write/aggregate denial tests; chosen session/CSRF checks; invalid environment configuration; migration and isolated backup/restore rehearsal. Run backend/frontend typechecks and applicable build/test suites.
- DoD: common DoD plus approved-model security tests pass and configuration/runbook are ready for review. Obtain deployment approval before P03.

### P03 — Deploy and verify before publication
- Depends on: P02 review and explicit deployment approval.
- Objective: verify the approved deployment in a restricted staging environment before public release.
- Expected files: `docs/DEPLOYMENT.md`, `docs/VERIFICATION.md`, deployment configuration corrections if necessary.
- Acceptance: staging is access-restricted from first boot; deploy only the security-reviewed candidate. Verify HTTPS, readiness, UI/API reads, anonymous mutation denial (A) or authentication/cross-user isolation (B), safe errors, environment configuration, persistent records after restart and redeploy, backup restoration, and recovery procedure. Runtime SQLite path is on the provisioned persistent volume, not the build filesystem. Never publish the original writable unauthenticated application.
- Tests: deployed-URL smoke/security checks bypassing UI, restart/redeploy persistence checks using synthetic test records through an authorized maintenance process, restore to isolated storage, and documented results/limitations. Public exposure requires publication approval after staging verification.
- DoD: common DoD plus evidence reviewed and explicit publication approval recorded before opening access or sharing the URL; document actual deployed behavior and recovery instructions. No commit/push is implied by deployment approval.
