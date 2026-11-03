# Expense Tracker

A single-user, localhost-only personal finance application. T01–T05 provide the React landing screen, input validation, safe HTTP errors, durable SQLite storage, categories, and transaction creation/detail/search/pagination APIs. Update/delete, budgets, dashboard features, and authentication remain unimplemented. See [docs/API.md](docs/API.md) for the implemented contracts and examples.

## Prerequisites and choices

- Windows PowerShell, Node.js **24 LTS** (minimum and tested baseline **24.19.0**), npm **11.x**. `.nvmrc` records the baseline; install a supported Node 24 patch from [Node.js](https://nodejs.org/en/download). npm workspaces share one root lockfile. Other Node majors are intentionally outside the current project engine range.
- Backend: Express 5, strict TypeScript, ESM/NodeNext. `tsx` runs development source; `tsc` compiles the backend for normal Node startup. Frontend: React 19, Vite 7, strict TypeScript, Tailwind CSS 4 through its [Vite plugin](https://tailwindcss.com/docs/installation/using-vite), and Recharts 3 installed for future analytics.
- SQLite driver: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), major 12, whose package engine range includes Node 24. Its synchronous prepared-statement API matches short local queries in the approved architecture. It is a native dependency: a compatible prebuilt binary is preferred; environments without one may require the supported native build toolchain. The driver is installed but not imported or connected in T01.
- [Node release schedule](https://github.com/nodejs/Release) establishes LTS support. `package-lock.json` records the exact dependency versions used; use `npm.cmd ci` to reproduce them.

## Windows PowerShell setup

Run from the repository root. Use `npm.cmd` because Windows execution policy may block the `npm.ps1` shim; no execution-policy change is necessary.

```powershell
node --version
npm.cmd --version
npm.cmd ci
if (-not (Test-Path backend/.env)) { Copy-Item .env.example backend/.env }
npm.cmd run db:init --workspace backend
npm.cmd run dev
```

The environment copy is optional: defaults work without it. Keep existing environment files. The initializer creates missing schema and catalog entries; normal backend startup also performs this same atomic initialization before listening. There is no reset command. Back up an existing database before applying new migrations.

- Frontend: http://127.0.0.1:5173
- API: http://127.0.0.1:3001/api/health
- Proxied API: http://127.0.0.1:5173/api/health

Both development servers bind exclusively to IPv4 loopback. Do not override the host, use public tunnels, or expose this unauthenticated MVP through LAN/public hosting. Use browser viewport emulation for mobile layouts. Fixed Vite ports fail rather than silently selecting another port. Stop development with Ctrl+C; the root runner stops both commands.

`backend/.env` supports `PORT` (integer 1–65535, default 3001) and `DATABASE_PATH` (default `backend/data/expense-tracker.sqlite`). A configured relative path, such as `./data/expense-tracker.sqlite`, is resolved relative to `backend/`, regardless of the caller's working directory. Absolute paths are supported. The default location is identical for source and compiled entrypoints. Empty paths and development `:memory:` configuration are rejected. Backend binding remains hardcoded to `127.0.0.1`; there is no HOST override. If you change PORT, also update the Vite proxy target. No secrets belong in `VITE_*` variables.

## Commands

All commands below run at the repository root.

| Command | Purpose |
| --- | --- |
| `npm.cmd run dev` | Start both development servers with joint shutdown |
| `npm.cmd run dev --workspace frontend` | Start Vite only |
| `npm.cmd run dev --workspace backend` | Start the watched TypeScript API only |
| `npm.cmd run typecheck` | Check strict TypeScript in both workspaces, including tests/configuration |
| `npm.cmd run build` | Build frontend assets and compile backend source |
| `npm.cmd test` | Run each workspace's Vitest command; backend includes Supertest health coverage |
| `npm.cmd start` | Run compiled backend at loopback (build first) |
| `npm.cmd run db:init --workspace backend` | Apply pending migrations and seed missing categories without starting HTTP |
| `npm.cmd run preview --workspace frontend` | Preview frontend build at 127.0.0.1:4173; no API proxy is configured for preview |

Frontend Vitest uses a Node environment and includes pure USD-parser tests. Its command retains the T01 `--passWithNoTests` option, but tests are present and executed. Backend tests cover input validation, HTTP errors, SQLite schema/migrations, isolation, persistence, and readiness. Supertest uses ephemeral **loopback-only** listeners and closes them afterward. Databases are in-memory or newly allocated temporary test files; no test opens the development database. Production backend output excludes test files.

## T02a validation utilities

- `validateMoneyCents(value: unknown)` accepts primitive numbers that are safe integers from 1 through 100000000 cents. No string coercion is performed.
- `validatePositiveId(value: unknown)` accepts primitive numbers from 1 through Number.MAX_SAFE_INTEGER. It does not check database existence.
- `parsePositiveId(value: unknown)` accepts canonical ASCII digit strings starting with 1–9. Leading zeros, whitespace (including trailing newlines), signs, decimal points, exponent/hex notation, and unsafe results are rejected.
- `parseUsdToCents(input: unknown)` accepts unsigned ASCII whole-dollar strings with optional one/two decimal places. Leading zeros are allowed; whitespace is rejected rather than trimmed. Examples: `12` -> 1200, `12.3` -> 1230, `12.34` -> 1234, `0.01` -> 1, and `1000000.00` -> 100000000. It constructs cent digits as text, bounds their length, then converts the bounded integer to Number; no floating-point multiplication or rounding is used. Symbols, separators, exponents, zero, negatives, excess precision, and over-limit amounts are rejected.

These functions return a validated number or throw a documented `TypeError` for an incorrect primitive type and `RangeError` for invalid format/range. Callers can catch these standard error classes; the T02d `validateInput` adapter provides explicit HTTP validation mapping without changing the pure validators. Frontend parsing is separate from formatting and UI, and backend validation remains mandatory when API integration is implemented. Numeric validators operate on decoded numbers: JSON number spellings such as `1e2` are indistinguishable from `100` after decoding; lexical restrictions apply to the string parsers.

## T02b calendar utilities

`backend/src/validation/calendar.ts` exports pure functions using the same documented TypeError/RangeError convention as T02a:

- `validateDate(value: unknown): string` accepts exact ASCII `YYYY-MM-DD` Gregorian dates from `1900-01-01` through `9999-12-31`. Future dates are allowed. Invalid days and non-leap February 29 are rejected.
- `validateMonth(value: unknown): string` accepts exact ASCII `YYYY-MM` from `1900-01` through `9999-12`.
- `validateDateRange(startDate: unknown, endDate: unknown): DateRange` validates both inclusive endpoints and returns `{startDate, endDate}`. Equal endpoints are valid; reversed ranges are rejected. Both endpoints are required by this primitive utility; optional query-field composition is deferred to T02c.
- `getMonthDateRange(value: unknown): DateRange` returns inclusive first/last dates directly, including `{startDate: '9999-12-01', endDate: '9999-12-31'}` without constructing a next-month boundary.

Wrong types throw TypeError; malformed/out-of-range strings and reversed ranges throw RangeError. Whitespace, timestamps, timezone suffixes, non-ASCII digits, and unpadded values are rejected without trimming or normalization. Leap years are divisible by 4, except centuries not divisible by 400: 1900/2100 are not leap years, while 2000/2400 are. Validators use arithmetic and canonical string comparisons, never Date parsing, UTC conversion, or the current clock. No HTTP or database integration is included.

## T02c composed request validators

All functions are pure, accept `unknown`, return fresh typed objects, and reuse the existing money/ID/calendar validators. They throw documented TypeError for wrong shapes/types (including missing required fields) and RangeError for unknown fields, invalid values, or exceeded limits. They fail on the first error; T02d provides an explicit HTTP adapter, without adding field-error aggregation. No Express imports, database lookups, or side effects are introduced into these validators.

- `validateTransactionRequest(body)` validates the same complete editable fields for POST and PUT: `type`, `amountCents`, `categoryId`, and `date`. `note` is optional only when absent; omission produces `""`, while explicit null/undefined is invalid. Notes are trimmed before enforcing the 500-character limit. Immutable IDs/timestamps and all other unknown fields are rejected.
- `validateBudgetBody(body)` accepts only required `amountCents`. `validateBudgetParams(params)` requires canonical string `categoryId` and calendar `month`; both must be present. `validateBudgetRequest(body, params)` composes them for upsert. The params validator can also be reused by a future DELETE handler. Category existence and expense-only rules remain database-backed responsibilities.
- `validateTransactionQuery(query)` accepts only `type`, `categoryId`, `startDate`, `endDate`, `q`, `page`, and `pageSize`. Absent page/pageSize default to 1/20. Supplied values must be strings; numeric parameters use canonical positive digits with no leading zeros, whitespace, signs, decimals, or exponents. page is a positive safe integer; pageSize is 1..100. Date endpoints may be supplied independently; together they must be ordered inclusively. q is trimmed, capped at 100 characters, and omitted from output when blank. Its case and literal `%`/`_` characters are preserved for later repository matching. All filters are retained together for AND semantics; validation does not resolve category/type relationships.

Request records must have Object.prototype or a null prototype. Arrays, null, class instances, unknown own keys (including symbols/non-enumerable keys), and accessor fields are rejected. No getter is executed for ordinary record validation. Optional defaults apply only to absent own fields, never explicit undefined. String length limits use JavaScript UTF-16 code units after trimming, consistent with the T02c tests; no silent truncation occurs. Query/schema validation is not yet wired into routes.

## T02d HTTP error boundary

`backend/src/app.ts` installs `express.json({ limit: 16 * 1024 })` before routes, then the unchanged health route, followed by `notFound` and `errorHandler` from `backend/src/middleware/errors.ts`. The limit is in bytes, not characters. The JSON parser retains Express's strict container behavior; malformed JSON and scalar/null JSON are rejected. Non-JSON content types are not parsed by this middleware and must be validated by future routes as appropriate.

| HTTP status | Error code | Public message |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Request validation failed. |
| 400 | INVALID_JSON | Request body must contain valid JSON. |
| 404 | NOT_FOUND | Resource not found. |
| 413 | PAYLOAD_TOO_LARGE | JSON request body must not exceed 16 KiB. |
| 500 | INTERNAL_ERROR | An unexpected error occurred. |

Responses use JSON `{error:{code,message,fields?}}`. `validateInput(() => validator(input), field?)` catches TypeError/RangeError only around an explicitly invoked pure validator, converting them to RequestValidationError. An optional typed field selects a fixed allowlisted message, such as `amountCents: "Enter integer cents from 1 to 100000000."`. Whole-schema calls without field context return the generic validation envelope; the adapter does not infer field names from error text. Future routes can throw NotFoundError for absent resources. Raw TypeError/RangeError elsewhere remain internal 500s, rather than masking programming defects as bad requests.

Raw error messages, stack traces, SQL, filesystem paths, request URLs, notes, and bodies are never serialized by this boundary. It logs only a fixed internal-error marker/code for 500s and nothing for expected request errors. If headers are already sent, a fresh sanitized error is delegated to Express for connection cleanup; an already-started response cannot be replaced with a JSON envelope. Parser failures use recognized parser type/status metadata, not arbitrary error status properties. No business/test routes are exposed by createApp; test-only routes live in the Supertest harness. All test listeners use ephemeral loopback ports and no database.

## Manual foundation verification

With `npm.cmd run dev` running, use a second PowerShell terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health | ConvertTo-Json -Compress
Invoke-RestMethod http://127.0.0.1:5173/api/health | ConvertTo-Json -Compress
Get-NetTCPConnection -State Listen -LocalPort 3001,5173 |
    Select-Object LocalAddress,LocalPort,OwningProcess
```

Both responses should be `{"data":{"status":"ok"}}`; both listeners must use `127.0.0.1`, not `0.0.0.0` or `::`. T03 health checks the database connection, foreign-key setting, migration versions, required table columns, and seeded catalog. It performs no writes or initialization. An absent, closed, incomplete, or incompatible database returns HTTP 503 with `{"error":{"code":"DATABASE_UNAVAILABLE","message":"Database is unavailable."}}`. To check compiled startup, stop development, run `npm.cmd run build --workspace backend`, then `npm.cmd start` and repeat the direct health/listener check.

## T03 SQLite storage and safety

- `connection.ts` opens better-sqlite3 with foreign keys enabled on every connection. `initializeDatabase` applies migrations and category seeding as one transaction. Importing modules or calling `createApp()` never opens a database; the standalone server owns initialization/close and injects its connection into `createApp(database)`. Calling `createApp()` without a database reports unavailable readiness.
- `migrate.ts` applies ordered contiguous positive versions in an immediate transaction, records UTC application timestamps, and skips applied versions. A failed batch rolls back DDL, data changes, and history. Unknown/gapped history fails rather than being rewritten. Migration 001 creates categories, transactions, budgets, and their indexes; schema_migrations is transactionally bootstrapped. Existing unversioned conflicting tables cause failure rather than adoption/reset.
- `seed.ts` inserts the exact 11 PRD category keys using `ON CONFLICT(type,name) DO NOTHING`. IDs, timestamps, existing categories, transactions, and budgets are never replaced by repeated initialization. Only missing catalog entries are inserted.
- Database constraints enforce positive safe IDs, integer cents 1..100000000, enums, matching composite category/type foreign keys, expense-only budgets, unique category/month budgets, nonempty category names, note length, and canonical date/month shapes/ranges. Date CHECKs do not prove month/day validity: backend calendar validation remains mandatory. SQLite affinity can coerce numeric text to integer storage; HTTP validators still reject numeric strings. SQL length measures Unicode code points while the backend enforces the stricter UTF-16 length limit. Embedded NULs in names/notes/dates/months are rejected at storage to avoid SQLite text-length truncation; future writes must handle constraint failures safely. UTC timestamp defaults do not automatically update updated_at on later edits; that belongs to T06.
- No totals or balance columns, CRUD endpoints, or reset/delete migration commands are introduced. Keep applied migration files immutable; create a new reviewed migration for future changes. Migration history is version-based, without checksums or full schema-drift repair. Backups/recovery remain an operator responsibility; do not delete an incompatible database to make startup pass.
- Test mode ignores DATABASE_PATH and defaults to `:memory:`. File tests must call `createTestDatabaseFile()` and pass its registered filename to `openDatabase({mode:'test',filename})`; arbitrary paths (including development paths) are refused before SQLite opens them. Development mode is forbidden when NODE_ENV=test or VITEST is set. Allocated file paths validate real parent directories and reject symlinks/hardlinks. Close test connections before disposing their private files; cleanup is non-recursive and refuses unexpected artifacts.
- The default development directory is ignored by Git, as are common SQLite filenames/journals/WAL/SHM files. Tests never read `.env` or use an existing development database. The synthetic persistence fixtures are separate from normal development storage. Path guards protect the supported connection API, not deliberate direct imports of the underlying driver.

## T04 API layers and aggregate safety

Routes validate requests through T02 utilities, then call parameterized repositories and the transaction service. Creation checks category existence/type, inserts, checks aggregate safety, and reads the response in one immediate SQLite transaction. A category failure or unsafe total becomes a safe HTTP 400; absent transaction detail returns 404; unexpected database failures remain generic 500s. Unknown query fields are rejected. Express route-decoding URI errors marked 400 are also safely normalized without reflecting the invalid path.

All-time income and expense sums are read as BigInts and independently limited to Number.MAX_SAFE_INTEGER. Positive cents mean each category/date subset is bounded by its type's all-time sum; balances are also safe when both nonnegative type totals are bounded. The guard does not combine income and expenses into an unnecessarily restrictive single sum. Failed writes/readback roll back before any Location header or success response. Tests use deliberately oversized stored amounts only as controlled fixtures in private databases; schema CHECKs remain enabled during HTTP requests. No aggregate cache, schema changes, or production bypass exists. The guard currently scans totals on every creation; optimization is deferred until measurements justify it.

## T05 list/search behavior

GET /api/transactions reuses the existing query validator. All supplied filters combine with AND; date endpoints are inclusive. A deferred read transaction spans category existence checking, matching COUNT, and page data. COUNT and SELECT use the same parameterized filters/join, and SQL applies LIMIT/OFFSET with date DESC/id DESC ordering. Pagination arithmetic uses BigInt before safe conversion to JSON numbers; valid huge pages return empty data with accurate metadata, not rounded offsets. Existing but type-incompatible categories return no matches; nonexistent categories return 400.

Approved MVP search is ASCII case-insensitive only. SQLite's built-in lower is applied to notes and the bound pattern; `%`, `_`, and backslash are escaped for literal LIKE matching. Unicode characters match literally, without Unicode case folding or normalization: `LUNCH` matches `lunch`, `CAFé` matches `Café`, but `CAFÉ` does not match `Café`. Blank trimmed q means no search. A query containing NUL returns no matches because stored notes prohibit NUL; this avoids SQLite LIKE truncation. Full Unicode case-insensitive support is not claimed. Leading-wildcard search and large offsets can require scans; the 10,000-row test establishes correctness, not the separate aspirational 300 ms performance target.

Current verification results and exact commands are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md). Planning documents live in `docs/`; follow [AGENTS.md](AGENTS.md). Deployment remains a separate, approval-gated post-MVP phase.
