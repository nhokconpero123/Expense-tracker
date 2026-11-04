# Architecture

## 1. Status and components
T01–T08 implement local foundations, validation/error handling, SQLite schema/catalog initialization, categories, transaction APIs, monthly summary/analytics data, and budget APIs. T09–T13 implement the frontend dashboard, transaction management, monthly budget management, and spending analytics with charts and readable tables. The isolated Analytics Chrome suite has passed mounted, keyboard, tooltip, and viewport checks; see T13_VERIFICATION.md. This does not establish all-page accessibility or final release readiness. T14c fixes and the post-T14d Budget Dialog focus fix are implemented and browser-tested. T14d records real-backend workflows, restart persistence and benchmarks. The test-only auxiliary WebSocket listener is disabled, and repeated API/listener isolation acceptance passes; see the latest T14D_VERIFICATION.md addendum. Historical proxy callers remain unknown without being a current blocker. The standalone server opens and initializes storage before listening and closes it on shutdown. App construction only accepts an injected database and never opens a file itself.

```text
Browser: React + TypeScript + Tailwind + Recharts
             | JSON HTTP /api
Node.js + Express + TypeScript: routes -> validation -> services -> repositories
                                                        | SQL
                                                      SQLite
```

- `frontend/`: Vite application, navigation/views, accessible forms, reusable state components, USD formatting, and API client. Use a month selector shared by dashboard, budgets, and analytics; list filters are separate.
- `backend/`: Node.js + Express API written in strict TypeScript, including routes, services, repositories, migrations, and tests. Typecheck separately from runtime execution/test transpilation; runtime input validation remains mandatory.
- `docs/`: product scope, stories, this architecture, implementation plan, API contracts, and verification records. README.md provides the current setup guide.
- Development: Vite proxies `/api` to Express. Both listeners bind exclusively to loopback; no LAN listener, public tunnel, or public unauthenticated hosting. The current Express application serves APIs only. For local build review, run the compiled API and Vite preview separately; preview inherits the configured /api proxy from the development server. Public deployment belongs only to the separately approved post-MVP phase in section 7.
- Prefer built-in React state/hooks and fetch for this small MVP. Keep data fetching in dedicated hooks; invalidate dependent views after writes and ignore stale responses when filters/month change.
- T13 adds a lazy-loaded `#analytics` page using the same MonthContext and summary hook as Dashboard. Its fetch adapter validates the existing summary shape and complete calendar series without filling days, grouping categories, or recomputing authoritative monetary totals. Recharts 3.10.1 renders daily bars and a category donut directly from server cents. Exact USD tooltips/tables use the existing formatter; only axis labels are compact approximations. Animation is disabled, and a native-button category list, explicit selected details, and Chart/Table View controls provide equivalents to SVG interaction. The daily table defaults to spending days only and can expand to every server-provided day; the chart always receives the complete series. A month-keyed presentation owner preserves view/selection/disclosure state through same-month refreshes and resets it on month changes. The summary loader uses request IDs plus abort signals, while hook loader identity changes with month/revision before effects execute. Transactions and budgets keep their existing APIs and revision notifications; transaction drill-down and month URL persistence are optional future enhancements.
- T12 uses `budgetApi.ts` for the existing budget contract and `BudgetStore` behind `useBudgets` for loading, request cancellation/order, editor validation, duplicate-write prevention, and separate write/refresh feedback. The hook subscribes to the existing `MonthContext.summaryRevision`, which transaction create/edit/delete already increment. Render-time month/revision matching hides obsolete snapshots before effects run. Budget writes refresh the current monthly budget endpoint; they do not change transactions or dashboard totals. Native modal dialogs contain keyboard focus and restore the trigger, or the page heading when a refresh removed that trigger. USD formatting splits integer cents using BigInt so large safe-integer spending aggregates retain every cent.

## 2. Data model
All IDs are positive integers; API objects use camelCase and SQLite columns use snake_case. Enable foreign keys on every connection.

| Entity | Fields and constraints |
| --- | --- |
| categories | id PK; name nonempty; type `income` or `expense`; unique(type, name); unique(id, type) for composite relationship enforcement. Fixed seeded catalog from PRD. |
| transactions | id PK; type enum; amount_cents INTEGER, typeof integer, 1..100000000; category_id required; transaction_date canonical date TEXT; note TEXT default empty, max 500; created_at and updated_at UTC timestamp TEXT. Composite FK(category_id, type) -> categories(id, type), ON DELETE RESTRICT. |
| budgets | id PK; category_id required; category_type fixed `expense` by CHECK; amount_cents INTEGER, typeof integer, 1..100000000; month canonical `YYYY-MM` TEXT; created_at/updated_at; UNIQUE(category_id, month); composite FK(category_id, category_type) -> categories(id, type), ON DELETE RESTRICT. |
| schema_migrations | version PK; applied_at UTC timestamp; tracks ordered schema migrations. |

Relationships: a category has many transactions and many monthly budgets. A budget has no direct ownership of transactions; spending is derived by matching category and transaction month. Do not store totals or remaining amounts.

Use database CHECK constraints for enums, amount ranges, basic date/month shape, and note length. Validate actual calendar dates in the backend; SQLite text shape checks alone do not establish date validity. Use indexes on transaction_date and (category_id, transaction_date); the budget unique constraint supplies its lookup index. Revisit indexes only after measuring queries.

Transaction notes reject NUL (U+0000) in the shared POST/full-PUT request validator and the existing SQLite CHECK. Trimming, the 500-character limit, and omitted-note normalization remain unchanged.

## 3. REST API contract
Base path `/api`; JSON request/response bodies, except successful DELETE responses. This table describes the implemented contract.

Implemented through T08: all API entries below, including monthly budget GET/PUT/DELETE. See docs/API.md for current examples and errors.

| Method and path | Input | Success |
| --- | --- | --- |
| GET /health | None | 200 `{data:{status:"ok"}}` when database-ready; 503 `{error:{code:"DATABASE_UNAVAILABLE",message:"Database is unavailable."}}` otherwise |
| GET /categories | Optional type enum | 200 `{data: Category[]}` sorted by type, then name |
| GET /transactions | Optional type, categoryId, startDate, endDate, q, page, pageSize | 200 `{data: Transaction[],meta:{page,pageSize,total,totalPages}}` |
| GET /transactions/:id | Positive integer ID | 200 `{data: Transaction}` |
| POST /transactions | `{type,amountCents,categoryId,date,note?}` | 201 `{data: Transaction}` and Location header |
| PUT /transactions/:id | Same complete editable fields as POST; omitted note becomes empty | 200 `{data: Transaction}` |
| DELETE /transactions/:id | ID | 204, no body |
| GET /budgets | Required month | 200 `{data: BudgetMonth}` including all expense categories |
| PUT /budgets/:categoryId/:month | `{amountCents}` | 200 `{data: BudgetItem}`; atomic upsert whether newly created or replaced |
| DELETE /budgets/:categoryId/:month | Expense category/month | 204; 404 if no budget exists |
| GET /summary | Required month | 200 `{data: MonthlySummary}` |

Response shapes:
- `Category`: id, name, type.
- `Transaction`: id, type, amountCents, categoryId, categoryName, date, note, createdAt, updatedAt.
- `BudgetMonth`: month, items. Each `BudgetItem`: categoryId, categoryName, month, amountCents (null when absent), spentCents, remainingCents (null when absent), utilizationPercent (null when absent), status (`no_budget`, `under`, `at_limit`, `over`).
- `MonthlySummary`: month, incomeCents, expenseCents, balanceCents, expensesByCategory (`{categoryId,categoryName,amountCents}[]`), dailyExpenses (`{date,amountCents}[]`). Category rows sorted by amount descending then category ID; daily rows ascending.

Validation and query rules:
- Reject unknown body/query fields, invalid enum values, arrays where scalars are expected, invalid IDs, invalid dates/months, unsafe numeric values, and wrong JSON types. Body money/IDs must be JSON numbers, not numeric strings. Parse numeric query/path strings strictly.
- Dates and months use years 1900–9999, including the final supported December; avoid relying on a year-10000 next-month boundary.
- List defaults: page=1, pageSize=20; pageSize range 1..100, positive safe-integer page. `q` is trimmed, maximum 100 characters, blank means no search. Date range is inclusive; startDate must not exceed endDate. All list filters combine with AND. Approved MVP search scope: ASCII-only case-insensitive note matching; Unicode characters match literally, without Unicode case folding or normalization. Escape SQL LIKE `%`, `_`, and the escape character itself for literal substring search. Full Unicode case-insensitive support is out of scope.
- Return empty data for a valid page beyond the last page. `totalPages=0` when no rows match. UI adjusts out-of-range pages after deletions.
- Existing but type-incompatible list category filters produce no matches. Nonexistent category filters produce 400. Missing resources addressed directly return 404.
- Error envelope: `{error:{code,message,fields?}}`; fields map input names to messages. Use 400 for validation/malformed JSON, 404 for missing resources, 413 for body above 16 KiB, and 500 for unexpected failures. Log only fixed diagnostic markers for internal failures, without raw errors, URLs, bodies, or transaction notes; never expose stack traces or SQL.

## 4. Calculations and persistence
- Frontend parses decimal input as strings into cents without floating-point multiplication. Backend accepts cents only. Format USD with Intl.NumberFormat for display; do not reuse formatted strings for calculations.
- Use lexicographic canonical date ranges from first through last calendar day for month aggregation, including December and leap-year boundaries. Transaction dates have no timezone. Metadata timestamps use UTC and do not determine reporting month.
- Compute aggregates from persisted rows using integer SQL SUM and safe-integer checks. Within the write transaction, verify supported totals remain within JavaScript's safe integer range; rollback otherwise. Test this guard with controlled fixtures. Percentage is derived display data, rounded to one decimal; monetary data remains integer.
- T04 creates transactions through routes -> existing validation -> transaction service -> parameterized repositories. Category lookup, insert, aggregate guard and response readback share an immediate write transaction. Per-type all-time SUM values use better-sqlite3 BigInt mode before comparison with Number.MAX_SAFE_INTEGER; bounding both nonnegative totals also bounds category/date subsets and balances. Unsafe totals reject with 400 and rollback; SQL/readback failures reject with generic 500 and rollback. This scan-based guard favors correctness before future performance tuning. No production CHECK bypass or aggregate cache is added.
- Read summary aggregates in one consistent read transaction. Budget list and spent calculations also use a consistent snapshot. Sequential API reads across different endpoints need not share a snapshot; after a mutation the UI refreshes all relevant views.
- T08 joins all expense categories (name/ID order) to the selected month's limits and grouped expense spending in one parameterized SELECT within a deferred read transaction. Absent limits yield null amount/remaining/utilization while spending remains numeric. PUT uses ON CONFLICT(category_id, month) DO UPDATE in an immediate transaction spanning expense-category validation, write, and derived response readback; both insert and replacement return 200. DELETE checks existence, deletes only the limit and verifies absence atomically; missing budgets return 404, invalid/nonexistent/income categories return 400. Unexpected failures roll back and return safe 500. Monetary results use BigInt with safe-integer checks. Utilization is uncapped and rounded half-up to one decimal using integer quotient arithmetic before JSON-number conversion; extreme display percentages can lose decimal resolution without affecting cents or exact status comparisons. No schema, dependency, or transaction-write rule changes are introduced.
- T07 implements summary reads as one deferred transaction spanning per-type totals, expense category GROUP BY, and expense date GROUP BY. It reuses monetaryTotals with inclusive getMonthDateRange bounds, and uses SQLite BigInt reads before checking/serializing safe integer outputs. Category results omit zero spending and sort amount DESC/categoryId ASC; daily zero filling uses date strings and the final calendar day, never timestamps or a next-year boundary. Pure assembly checks both breakdown sums against expenseCents and computes balance in BigInt. Invalid month queries return 400; unavailable storage or unsafe/inconsistent aggregates fail with safe 500. No derived data is stored and list filters/pagination are never accepted by this endpoint.
- T05 list service opens a deferred read transaction before category validation and uses one filter definition for COUNT and SQL-paginated SELECT, keeping count/data consistent. Valid out-of-range offsets skip SELECT; offset and total-page arithmetic use BigInt to avoid precision loss for safe but very large page values. SQL sorting is transaction_date DESC, id DESC. Search uses built-in SQLite lower on both operands and escaped LIKE for ASCII folding plus literal Unicode; no schema/index changes or writes are performed. Queries containing NUL return no matches because notes cannot store it.
- T06 PUT uses the same complete input validator as POST and parameterized UPDATE of editable fields only. An immediate transaction spans existence/category checks, update, old/new month per-type BigInt sums, all-time safety checks, and readback. ID/createdAt stay unchanged. updatedAt advances to current UTC time or previous timestamp plus 1 ms if the clock has not advanced. DELETE likewise uses an immediate transaction around existence/deletion/postcondition checks, returning empty 204 after commit; absent IDs return 404. Mutations roll back on SQL errors, ignored changes, unsafe totals, or failed readback. No summary/budget API or schema changes are introduced.
- Use transactions for migrations, seed updates, budget upserts, and writes with aggregate guards. Seed by stable category keys without overwriting user data. Keep test database paths independent and explicitly guarded.
- Implemented in T03: initialize migrations and seeding atomically; migration 001 creates the schema/indexes without resetting tables. Migration versions are immutable and contiguous; incompatible history is rejected. Default storage is backend/data/expense-tracker.sqlite for source and compiled startup. DATABASE_PATH relative values resolve from backend/. See README.md for initialization commands, constraints, limitations, and backup guidance.
- Test connections default to memory, ignore DATABASE_PATH, and only open persistent files allocated by the registered temporary-file factory. Development connections are refused under Vitest/NODE_ENV=test. Realpath and file-link checks guard allocated paths; unrelated filenames are refused before opening. The server injects the initialized connection into createApp; health performs read-only schema/version/catalog checks and never exposes SQLite errors. Readiness is not an exhaustive integrity/schema-drift audit.
- T01 selects Node 24 LTS (tested baseline 24.19.0; engine range >=24.19.0 <25, npm 11) and better-sqlite3 12, whose supported engine range includes Node 24. Its synchronous prepared-statement API suits short local queries. The native driver is installed, but no database is opened before T03. Exact resolved dependencies are in the root lockfile. See README.md for upstream references and native installation limitations.

## 5. Decisions and trade-offs
| Decision | Benefit | Cost / limitation |
| --- | --- | --- |
| SQLite, one Express process | Simple durable local setup | Limited write concurrency and no horizontal scaling |
| Integer cents and explicit dates | Exact USD arithmetic and predictable monthly reporting | Decimal parsing and calendar validation must be explicit |
| Fixed typed categories | Small UI and stable budget relationships | Personal category customization deferred |
| Derived totals | Avoid stale denormalized balances | Aggregation work on reads; measure with 10,000 rows |
| PUT replacement/upsert semantics | Clear editing and one budget per key | No partial transaction updates in v1 |
| No authentication | Focused single-user MVP | Trusted local operation only; future hosting needs security work |
| Local state and fetch | Fewer abstractions/dependencies | Explicit invalidation, cancellation, and retry handling |

## 6. Verification strategy

Vitest covers validators, money/date utilities, reporting, production stores/loaders, and component rendering. Supertest exercises actual routes through ephemeral loopback listeners; SQLite integration tests cover constraints, rollback, persistence, filters, and consistent snapshots. Test connections use memory or registered private temporary files and cannot open development storage. Strict typechecks and frontend/backend builds are separate required checks.

The dependency-free Chrome runner is invoked with `npm.cmd run test:browser --workspace frontend`. It mounts production Analytics, Transactions and Budgets with synthetic intercepted API responses. The suite has 42 interaction cases, including nine Budget Dialog regressions for Set/Edit/Remove focus cycles, initial/restored focus, background inertness, cancellation, pending guards, duplicate prevention, errors and reopening. API rejection and actual runtime listener checks make 44 browser checks. The test-only Vite server does not inherit the application config or proxy: Node binds an OS-assigned loopback port, and an API boundary returns 503, records requests in temporary api-requests.json, and fails the suite for unexpected traffic. Vite server.ws is false in test-only configuration; hmr: false alone did not disable its separate transport in Vite 7.3.7. The listener guard observes Node TCP server addresses continuously, rejects wildcard/non-loopback bindings, blocks Node port-3001 connection attempts, and inspects Windows-owned TCP sockets for the runner and descendants before/after interaction tests. Chrome debugger ownership is asserted. Non-Windows native inspection fails explicitly. Transient native listeners between snapshots and UDP are not covered. Production proxy settings are unchanged.

Node Vitest currently passes 399 frontend and 962 backend cases. Some older transactionCoordinator tests still use a test-local implementation; production browser interactions now supplement them. T14c transaction/month findings and the post-T14d budget focus blocker are fixed. Full screen-reader speech and VS Code preview acceptance remain unverified; Chrome accessibility-tree and keyboard assertions do not establish spoken output.

T14D_VERIFICATION.md preserves clean isolated database initialization, synthetic cross-page workflows, compiled-server restart persistence, responsive checks, and 30 warm sequential list/summary timings on 10,000 transactions. Backend/query code is unchanged, so those measurements remain attributable; they were not rerun for packaging. The p95 <300 ms target is aspirational. Fresh-install and backup-restoration walkthroughs remain unverified. Earlier proxy-request callers remain unknown; the latest VERIFICATION.md entry records current isolation acceptance without claiming retrospective attribution.

## 7. Post-MVP deployment architecture (approval required)
The local MVP topology and API contract above remain unchanged. Select one model before implementing public access:

| Model | Required security boundary | Data implications |
| --- | --- | --- |
| A: Read-only public demo | Deny anonymous writes in Express for every mutation route and any maintenance path; absent credentials or failed authorization must never mutate data. Prefer no public HTTP maintenance routes. UI controls alone are insufficient. | Synthetic data in a dedicated demo database; never mount the personal/development database. |
| B: Authenticated application | Reviewed authentication/session design, authorization on every personal-data route, user ownership from verified server identity rather than body/query user IDs, and cross-user denial tests. | Add user ownership to transactions/budgets, user-scoped budget uniqueness and aggregates, and a reviewed migration. Shared fixed categories are possible. |

Common operational requirements:
- Serve over HTTPS; configure trusted origins, proxy settings and credentials according to the chosen hosting/session design. Review CSRF protections for cookie authentication, abuse limits, and safe errors/logging.
- Document and validate `NODE_ENV`, `PORT`, deployment-specific bind address, `DATABASE_PATH`, frontend API origin (or same-origin proxy), allowed origins, and any chosen authentication secrets. Local defaults remain loopback-only; public settings require the selected security gate. Never place secrets in frontend/Vite environment variables.
- Keep SQLite on an explicitly provisioned persistent volume at an absolute path, outside the build output. Use one writable application instance; no ephemeral/serverless filesystem assumptions. If the host cannot support this, review another database architecture before proceeding.
- Apply versioned migrations with backup and rollback/recovery instructions; do not reseed or reset on every restart. Define backup retention and test restoration to an isolated database.
- Verify HTTPS, readiness, read flows, security denials, absence of sensitive error output, persistence after restart/redeploy, and backup restoration. Complete these checks before approving publication.

## 8. Remaining review decisions
- Choose deployment option A or B after the MVP; recommendation for a junior portfolio is A with public HTTP mutations disabled. Hosting provider, storage/cost, backup retention, and (for B) authentication/session approach require separate approval.
- Resolved in T01/T03: Node 24 LTS, better-sqlite3 12, strict backend TypeScript, and initial schema/connection lifecycle. Transaction, summary, and budget APIs are implemented; no public-access security model is implemented.
- Search scope resolved for T05 by explicit user approval: ASCII case-insensitive matching and literal Unicode characters, with no full Unicode case folding or normalization. PRD FR-04 and US-06 use this same MVP scope.
