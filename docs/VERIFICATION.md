# Verification Record

Entries are historical records of each task's verification. The latest entry is [Prompt 44 listener resolution](#prompt-44---websocket-listener-resolution-and-acceptance---november-4-2026). T12 and T13 have additional task-specific verification records in this directory; earlier counts below describe their original task snapshots.

## T01

Date: 2026-11-03 (America/Chicago). Scope: local project foundations only. T02a has not started.

## Environment and resolved versions

Windows PowerShell; Node v24.19.0; npm 11.17.0. Selected Node 24 LTS and better-sqlite3 12 after checking upstream LTS documentation and npm engine metadata. Driver 12.11.1 explicitly supports Node 24. See README.md for official references.

| Component | Resolved version |
| --- | --- |
| React / React DOM | 19.3.1 |
| Vite / React plugin | 7.3.7 / 5.2.0 |
| Tailwind / Tailwind Vite plugin | 4.3.4 / 4.3.4 |
| Recharts | 3.10.1 |
| TypeScript | 5.9.3 |
| Express | 5.3.0 |
| better-sqlite3 | 12.11.1 |
| tsx | 4.23.15 |
| Vitest | 5.1.0 |
| Supertest | 7.3.1 |
| concurrently | 9.2.5 |

`package-lock.json` is the authoritative exact dependency graph. `npm.cmd ls --depth=0` completed successfully.

## Final checks

Commands run from the repository root unless noted. Builds/tests requiring esbuild were rerun outside the restricted execution sandbox after access failures, without changing application host bindings.

| Exact command | Result |
| --- | --- |
| `node --version` | PASS: v24.19.0 |
| `npm.cmd --version` | PASS: 11.17.0 |
| `npm.cmd run typecheck` | PASS: frontend and backend `tsc --noEmit`, exit 0 |
| `npm.cmd run build` | PASS: frontend `tsc --noEmit && vite build`; backend `tsc -p tsconfig.build.json`, exit 0 |
| `npm.cmd test` | PASS: backend 1 test file, 1 health test; frontend 0 tests, explicitly allowed; exit 0 |
| `npm.cmd audit --json` | PASS: 0 vulnerabilities after Vitest update |
| `npm.cmd run dev` | PASS: both servers started together; backend via tsx watch and Vite ready |
| `npm.cmd start` | PASS: compiled backend started using Node, not tsx; direct health returned expected JSON |
| `git diff --check` | Exit 0. Repository files are currently untracked, so this command does not validate their contents as a tracked diff. |

Final frontend build: 29 modules transformed, 721 ms; HTML 0.45 kB, CSS 6.51 kB, JS 223.29 kB (gzip 0.29 / 2.11 / 69.69 kB). This is a foundation build measurement, not the future transaction performance benchmark. Backend output contains only `app.js` and `server.js`, excluding tests.

The health test verifies HTTP 200, JSON content type, exact `{"data":{"status":"ok"}}` payload, and disabled X-Powered-By header. It starts an ephemeral HTTP listener explicitly on 127.0.0.1 and closes it after testing. App imports neither start a listener nor open SQLite.

## HTTP, binding, and proxy checks

With `npm.cmd run dev` active, these exact commands were run:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health | ConvertTo-Json -Compress
Invoke-RestMethod http://127.0.0.1:5173/api/health | ConvertTo-Json -Compress
$pageResponse = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/
Write-Output "Frontend HTTP status: $($pageResponse.StatusCode)"
Get-NetTCPConnection -State Listen -LocalPort 3001,5173 |
    Select-Object LocalAddress,LocalPort,OwningProcess
$styleResponse = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/src/styles.css
Write-Output "Tailwind compiled utility present: $($styleResponse.Content.Contains('.bg-slate-950'))"
```

Results: direct API and Vite-proxied API both returned `{"data":{"status":"ok"}}`; frontend HTTP 200; compiled Tailwind utility present = True. OS listener table showed only 127.0.0.1:3001 (PID 23692) and 127.0.0.1:5173 (PID 5616) for these application ports. The proxy preserved `/api/health` and reached Express successfully.

After stopping development, `npm.cmd start` loaded the compiled backend. The direct health command and this listener command were repeated:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3001 |
    Select-Object LocalAddress,LocalPort,OwningProcess
Get-ChildItem backend/dist -Name
```

Result: correct health JSON, 127.0.0.1:3001 (PID 7440), output files `app.js` and `server.js`. No `.env` was required; Node reported it absent and used documented defaults.

Both runs were stopped with Ctrl+C and Windows batch-job confirmation (`Y`). Interrupt shutdown returned exit 1 through npm's Windows batch wrapper; normal checks had already succeeded. A final check returned no remaining listeners on either application port:

```powershell
Get-NetTCPConnection -State Listen |
    Where-Object { $_.LocalPort -in 3001,5173 } |
    Select-Object LocalAddress,LocalPort,OwningProcess
```

## SQLite binary compatibility only

This exact command loaded the native driver and queried a temporary in-memory database:

```powershell
node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); console.log('SQLite in-memory compatibility:', db.prepare('select sqlite_version() as version').get()); db.close();"
```

PASS: SQLite version 3.53.2. No file-backed database, table, migration, or seed was created. Application startup and automated health tests do not connect to any database.

## Initial failures and remediation

- `npm --version` was blocked by PowerShell execution policy for `npm.ps1`. Used `npm.cmd --version` successfully; execution policy unchanged.
- Initial `npm.cmd view vite version` failed with EACCES accessing the registry/cache in the sandbox. Required npm metadata/install operations were rerun with approved external access.
- `npm.cmd install` initially installed Vitest 3.2.7 and reported three vulnerabilities (one moderate, two critical). Inspected `npm.cmd audit --json` and compatibility metadata, then ran `npm.cmd install --save-dev vitest@5.1.0 --workspace frontend --workspace backend`. Final audit: zero vulnerabilities. No forced audit fix was used.
- npm emitted native install-script approval warnings for better-sqlite3/esbuild and an initial transitive prebuild-install deprecation warning. Actual native SQLite loading, Vite build, and Vitest execution succeeded. No global script-approval policy was changed.
- Initial `npm.cmd run build` and `npm.cmd test` failed inside the sandbox because esbuild could not read ancestor directories (Access is denied). The same commands passed with approved execution outside that sandbox, including after the Vitest upgrade.
- Initial `Get-NetTCPConnection` failed with Access denied in the sandbox. The listener check succeeded with approved external execution.
- An initial `npm.cmd dev` invocation failed with Unknown command. Corrected README to `npm.cmd run dev`, then verified the corrected command successfully.

## Limits and handoff

- No browser visual/interaction review was performed. HTTP, asset compilation, strict types, process startup, proxy, OS binding, and the backend health contract were verified; responsive/accessibility feature acceptance remains future work.
- Recharts is installed with compatible React dependencies but no chart is implemented or rendered in T01. Frontend Vitest currently has no tests or DOM environment; this is explicitly reported rather than counted as a passing UI suite.
- `.env` override behavior, invalid PORT cases, port-conflict behavior, Vite preview runtime, and dependency installation on another machine were not separately exercised. No claim is made that `npm.cmd ci` was run; setup uses the lockfile generated by the successful install.
- No transactions, budgets, schema, file-backed storage, authentication, or deployment were implemented. No commit or push was performed. Stop for review before T02a.

## T02a — Money and identifier validation

Date: 2026-11-03 (America/Chicago). Only pure validation utilities, unit tests, and related documentation were added. No dependencies or T01 runtime files changed; no database was opened. T02b–T02d remain unimplemented.

Behavior is documented in README.md and function JSDoc. Incorrect primitive types throw TypeError; invalid formats/ranges throw RangeError. Backend cents allow 1..100000000 inclusive and numeric IDs allow 1..Number.MAX_SAFE_INTEGER. Path/query IDs require canonical ASCII digits without leading zeros. USD input allows leading zeros and zero/one/two fractional digits (when the decimal point is present, one or two digits are required), with no whitespace, signs, symbols, grouping, or exponent notation. Cents are constructed from digit strings without floating-point multiplication or rounding. No formatting or UI integration is included.

Exact commands executed from the repository root, using approved execution outside the restricted sandbox for esbuild compatibility:

```powershell
npm.cmd run typecheck
Write-Output "TYPECHECK_EXIT=$LASTEXITCODE"
npm.cmd run build
Write-Output "BUILD_EXIT=$LASTEXITCODE"
npm.cmd test
Write-Output "TEST_EXIT=$LASTEXITCODE"
```

| Check | Actual result |
| --- | --- |
| Root typecheck | Exit 0; frontend and backend tsc --noEmit passed |
| Root build | Exit 0; frontend production build and backend compilation passed |
| Frontend Vitest | 1 file passed; 71 tests passed, 0 failed, 0 skipped |
| Backend Vitest | 3 files passed; 101 tests passed, 0 failed, 0 skipped, including the unchanged T01 health test |
| Combined tests | Root exit 0; 172 passed, 0 failed, 0 skipped across 4 files |

Frontend build transformed 29 modules in 777 ms; HTML/CSS/JS output sizes remained 0.45/6.51/223.29 kB. No build/typecheck/test failures or warnings were emitted in this run.

Tests cover minimum/maximum and adjacent invalid boundaries, numeric safety, NaN/Infinity, wrong primitive/container types, boxed values, malformed ID strings, whitespace/newlines, Unicode digits, huge digit strings, decimal precision, and exact cents without rounding. Backend numeric validators cannot distinguish original JSON number spellings after parsing; a decoded integral number is accepted regardless of its original exponent notation. String parsers reject that notation explicitly.

No known unresolved T02a edge cases. Aggregate overflow guards, existence checks, complete request schemas, calendar validation, and HTTP error mapping remain assigned to later tasks. No browser or live proxy checks were rerun because T01 runtime behavior was not changed. Stop for review before T02b.

## T02b — Calendar validation

Date: 2026-11-03 (America/Chicago). Added only `backend/src/validation/calendar.ts`, its unit tests, and related README/plan/verification documentation. No T02a utilities, HTTP behavior, database files, dependencies, or UI were changed.

The utilities validate canonical Gregorian dates/months for years 1900..9999, inclusive ranges, and inclusive monthly boundaries. Future dates and equal range endpoints are allowed. Wrong types throw TypeError; invalid format/calendar values and reversed ranges throw RangeError. Whitespace is rejected without trimming. Leap-year century rules are explicit. Monthly boundaries use the actual final day, so December 9999 does not require year 10000. There is no Date parsing, timestamp conversion, current-clock access, or timezone dependency.

Exact root verification commands:

```powershell
npm.cmd run typecheck
Write-Output "TYPECHECK_EXIT=$LASTEXITCODE"
npm.cmd run build
Write-Output "BUILD_EXIT=$LASTEXITCODE"
npm.cmd test
Write-Output "TEST_EXIT=$LASTEXITCODE"
```

| Check | Actual result |
| --- | --- |
| Typecheck | Exit 0; frontend and backend passed |
| Build | Exit 0; frontend production build and backend compilation passed |
| Frontend tests | 1 file, 71 passed, 0 failed, 0 skipped |
| Backend tests | 4 files, 257 passed, 0 failed, 0 skipped |
| Combined tests | Exit 0; 328 passed across 5 files, 0 failed, 0 skipped |

The 257 backend tests include 156 new calendar cases and the existing 101 money/ID/health cases. The frontend build transformed 29 modules in 727 ms. No warnings or failures were emitted by typecheck/build/test.

Timezone verification ran the calendar suite in separate processes. Exact PowerShell command block:

```powershell
$previousTimezone = $env:TZ
try {
    foreach ($testTimezone in @('UTC','America/Chicago','Pacific/Kiritimati')) {
        $env:TZ = $testTimezone
        node -e "console.log('Requested TZ:', process.env.TZ, 'Resolved TZ:', Intl.DateTimeFormat().resolvedOptions().timeZone)"
        npm.cmd test --workspace backend -- src/validation/calendar.test.ts
        Write-Output "TIMEZONE_TEST_EXIT=$LASTEXITCODE TZ=$testTimezone"
        if ($LASTEXITCODE -ne 0) { throw "Timezone test failed: $testTimezone" }
    }
} finally {
    $env:TZ = $previousTimezone
}
```

Each timezone resolved to the requested name and passed all 156 calendar cases, exit 0. These are repeated executions of the same tests, not additional unique test cases. Cases include daylight-saving boundary dates, Gregorian century exceptions, month-end invalid days, year limits, equal/reversed ranges, December transitions, final December 9999, wrong types, whitespace/newlines, timestamp rejection, and non-ASCII digits. Commands used approved execution outside the sandbox for esbuild compatibility.

No known unresolved T02b edge cases. Range endpoints are both required in this utility; optional query composition belongs to T02c. HTTP error handling remains T02d. No browser review or live server checks were repeated for this pure-utility change. Stop for review before T02c; no commit or push performed.

## T02c — Composed request validation

Date: 2026-11-03 (America/Chicago). Added transactions.ts, budgets.ts, queries.ts, their three test files, and shared request.ts under backend/src/validation. Updated README/plan/verification documentation only. Existing T01/T02a/T02b source and test files were not changed; no dependencies, middleware, routes, storage, or UI were added.

Design: fresh typed return objects and documented TypeError/RangeError exceptions, reusing primitive validators. POST and PUT share a complete transaction schema; absent notes normalize to empty. Budget body/params have separate validators and a composed upsert helper. Query defaults apply only when absent, supplied scalar values must be strings, open date ranges are supported, and blank trimmed q is omitted. Filters remain combined for later AND matching. Unknown own fields and invalid record shapes are rejected, including accessor fields without invoking their getters. Length limits are UTF-16 code units after trimming. Detailed function contracts and leading-zero policies are in README.md.

Exact commands executed at repository root:

```powershell
npm.cmd run typecheck
Write-Output "TYPECHECK_EXIT=$LASTEXITCODE"
npm.cmd run build
Write-Output "BUILD_EXIT=$LASTEXITCODE"
npm.cmd test
Write-Output "TEST_EXIT=$LASTEXITCODE"
```

| Check | Actual result |
| --- | --- |
| Typecheck | Exit 0; frontend/backend strict checks passed |
| Build | Exit 0; frontend production build and backend compilation passed |
| Frontend tests | 1 file; 71 passed, 0 failed, 0 skipped |
| Backend tests | 7 files; 504 passed, 0 failed, 0 skipped |
| Combined tests | Exit 0; 8 files, 575 passed, 0 failed, 0 skipped |

There are 247 new T02c cases in addition to the previous 328 cases. Tests cover complete replacement semantics, missing/unknown keys, wrong shapes and scalar types, amount/ID/calendar constraints, strict route/query parsing, note/search limits and trimming, default pagination and boundaries, inclusive/open/reversed dates, frozen-input immutability, and shared record validation. Frontend build transformed 29 modules in 733 ms; output sizes remained HTML 0.45 kB, CSS 6.51 kB, JS 223.29 kB. No failures or warnings were emitted by these commands. Execution used approved access outside the sandbox for esbuild compatibility.

Remaining integration boundaries: no category existence/type checks, SQL filter execution/escaping, HTTP error mapping, or aggregate guards are implemented here. They remain assigned to later tasks. Length is deliberately measured in UTF-16 code units, not grapheme clusters. No known unresolved T02c validation defects. Live server/browser checks were not rerun for this pure-utility addition. Stop for review before T02d; no commit or push performed.

## T02d — HTTP validation error boundary

Date: 2026-11-03 (America/Chicago). Before any code edits, confirmed T02c with the following root commands:

```powershell
npm.cmd run typecheck
Write-Output "PRECHECK_TYPECHECK_EXIT=$LASTEXITCODE"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run build
Write-Output "PRECHECK_BUILD_EXIT=$LASTEXITCODE"
exit $LASTEXITCODE
```

Both exited 0. Added middleware/errors.ts and middleware/errors.test.ts; integrated JSON parsing and centralized errors in app.ts. Existing pure validators and health test were not changed. No dependencies, business routes, database, authentication, or deployment work was added.

Design and safe public messages are documented in README.md. Explicit validateInput calls adapt existing TypeError/RangeError validation failures to controlled 400 envelopes. Bare programming errors remain 500. Optional fields use fixed allowlisted messages, never error text. Parser malformed JSON returns 400, body above 16384 bytes returns 413, and unknown routes or explicit missing resources return 404. Responses omit all raw error/request details. Internal logs contain only a fixed marker/code, not error objects, notes, URLs, or bodies. Already-sent headers delegate a newly sanitized error for cleanup rather than attempting a second response.

Post-change root commands (executed twice, with actual results below):

```powershell
npm.cmd run typecheck
Write-Output "TYPECHECK_EXIT=$LASTEXITCODE"
npm.cmd run build
Write-Output "BUILD_EXIT=$LASTEXITCODE"
npm.cmd test
Write-Output "TEST_EXIT=$LASTEXITCODE"
```

Initial post-change typecheck exited 2: the test's vi.fn<NextFunction> did not satisfy Express's overloaded callback signature, and a dependent cast was invalid. Build exited 0 and tests exited 0 (604 passed). Fixed only the test mock to accept an optional unknown error and assert its message without the invalid cast; reran all three commands.

| Final check | Actual result |
| --- | --- |
| Typecheck | Exit 0; frontend and backend passed |
| Build | Exit 0; frontend production build and backend compilation passed |
| Frontend tests | 1 file, 71 passed, 0 failed, 0 skipped |
| Backend tests | 8 files, 533 passed, 0 failed, 0 skipped |
| Combined tests | Exit 0; 9 files, 604 passed, 0 failed, 0 skipped |

There are 29 new middleware tests. The existing health test passed unchanged; additional integration coverage confirms createApp health JSON and disabled X-Powered-By. Other cases cover malformed/scalar JSON, actual app unknown routes, explicit missing resources, exact 16 KiB acceptance, one-byte overflow, multi-byte UTF-8 oversized bodies, validator adaptation with/without fields, safe response/log content, async failures, unrelated TypeError/RangeError, forged status objects, and sanitized headers-sent delegation. Only the isolated test harness has synthetic routes; all listeners use 127.0.0.1 and close after tests. No database is opened.

Final frontend build transformed 29 modules in 737 ms. No warnings were emitted by final typecheck/build/test. Approved execution outside the restricted sandbox was used for esbuild compatibility. No visual browser, live Vite proxy, compressed/aborted request, or real streaming-disconnect checks were performed; the headers-sent branch is unit tested. Optional field messages require caller-supplied field context; whole-schema errors intentionally remain generic. No known blocking T02d defects. Stop for review before T03; no commit or push performed.

## T03 — Durable schema and category catalog

Date: 2026-11-03 (America/Chicago). Added db/connection.ts, migrate.ts, seed.ts, initialize.ts, cli.ts, migrations/001_initial.ts, database.test.ts, and health.test.ts. Modified app/server lifecycle, existing app/error test harnesses to inject isolated databases, backend package scripts, .env.example, README, architecture, implementation plan, and this verification record. Prior uncommitted documentation changes were preserved. No dependency versions or lockfile changed; .gitignore already covers database storage and sidecars.

Migration 001 creates categories, transactions, budgets, foreign keys, CHECKs, unique keys, and the two transaction indexes. The migration runner transactionally bootstraps schema_migrations and records ordered applied versions. All pending migrations commit together; initializeDatabase wraps migration plus seed in a single transaction. Repeated initialization preserves existing IDs/records/timestamps and only inserts missing catalog keys. Catalog: Salary, Freelance, Other Income (income); Food, Housing, Transport, Utilities, Entertainment, Health, Shopping, Other Expense (expense).

Tests use only in-memory databases or brand-new registered private temporary files. Test mode ignores DATABASE_PATH; arbitrary paths/default development paths are rejected before opening SQLite. Development mode is refused under Vitest/NODE_ENV=test. Reopen tests prove persistence and foreign-key enforcement on each connection. File fixtures close connections before non-recursive disposal. Hardlinked files and mismatched real parent paths are refused. No existing user/development database was initialized, reset, deleted, or opened.

Exact root verification commands, run three times as changes were finalized:

```powershell
npm.cmd run typecheck
Write-Output "TYPECHECK_EXIT=$LASTEXITCODE"
npm.cmd run build
Write-Output "BUILD_EXIT=$LASTEXITCODE"
npm.cmd test
Write-Output "TEST_EXIT=$LASTEXITCODE"
```

First run: typecheck exited 2 because a parameterized test widened the income/expense literal union to string. Build exited 0; tests exited 0. Fixed the test table with `as const`. Second run passed all commands. After tightening the test-path check to recognize even broken symlinks via lstat and removing an unused import, the final run produced:

| Final check | Actual result |
| --- | --- |
| Typecheck | Exit 0; frontend/backend strict TypeScript passed |
| Build | Exit 0; frontend production assets and backend compilation passed |
| Frontend tests | 1 file, 71 passed, 0 failed, 0 skipped |
| Backend tests | 10 files, 608 passed, 0 failed, 0 skipped |
| Combined tests | Exit 0; 11 files, 679 passed, 0 failed, 0 skipped |

There are 75 new T03 cases. Existing validation/error suites still pass; health harnesses now use initialized isolated databases and preserve the original success contract. New coverage includes exact catalog/schema, repeat initialization preserving data, indexes, composite foreign keys, category types, expense-only budgets, uniqueness, monetary boundaries, note/date/month constraints, atomic migration failure including DDL/history, incompatible/unversioned databases, seed rollback, close/reopen persistence, path isolation, environment-path sentinel preservation, hardlinks, and healthy/unavailable readiness.

Health returns the original 200 `{data:{status:"ok"}}` only for a ready injected connection. Missing, closed, uninitialized, missing-schema/catalog, foreign-keys-disabled, and unknown-version states return JSON 503 `{error:{code:"DATABASE_UNAVAILABLE",message:"Database is unavailable."}}` without SQL, file paths, or error text. Readiness never initializes/reseeds and is not an exhaustive integrity audit.

Additional smoke verification used a one-off Node script piped through `node --input-type=module`. It allocated a brand-new OS temporary directory named expense-tracker-smoke-*, set DATABASE_PATH to its synthetic.sqlite, and spawned these commands from backend/:

```powershell
node --env-file-if-exists=.env dist/db/cli.js
node --env-file-if-exists=.env dist/db/cli.js
node dist/server.js
```

Both compiled initializer calls exited 0. The compiled server used a newly allocated loopback port, and GET /api/health returned 200 with the exact original success JSON. After stopping that child, a read-only reopen confirmed 11 categories and migration version 1. The default development database's existence/mtime state was unchanged. The script removed only its own synthetic files/directory and exited 0 (`SMOKE_CLEANUP=PASS`). No default `db:init` or default server command was run against development storage.

Final frontend build: 29 modules, 753 ms; output sizes remained HTML/CSS/JS 0.45/6.51/223.29 kB. No warnings were emitted by final typecheck/build/test. Commands used approved execution outside the sandbox for esbuild/native SQLite compatibility. `git check-ignore -v` confirmed default database/journal and representative SQLite WAL/SHM filenames are ignored; no .gitignore change was necessary.

Limitations: basic SQL date CHECKs intentionally do not replace full calendar validation; SQLite affinity can coerce numeric text and SQL length counts Unicode code points, while API validators remain stricter. Storage rejects NUL-containing text to avoid SQLite length truncation. Applied migration files must remain immutable; there are no checksums, reset commands, schema-drift repair, or automated backups. Actual production crash recovery, disk-full/corrupt-file scenarios, Vite proxy/browser review, and Windows graceful signal delivery were not retested. No known blocking T03 defects. Stop for review before T04; no commit or push performed.

## T04 — Categories and transaction creation/detail

Date: 2026-11-03 (America/Chicago). Before coding, executed `npm.cmd test --workspace backend -- src/validation/transactions.test.ts`: exit 0, 78 passed, 0 failed/skipped. Source inspection confirmed NUL rejection, including beginning/middle/end tests for shared create/full-PUT validation. This prerequisite passed before T04 edits.

Created repositories/categories.ts, repositories/transactions.ts, services/transactions.ts, routes/categories.ts, routes/transactions.ts, routes/transactions.test.ts, and validation/categories.ts. Mounted routers in app.ts; updated error middleware to safely classify Express's status-400 URIError when a malformed percent-encoded transaction ID cannot be decoded. No existing validators, database schema/connections, dependency versions, or frontend source changed. Documentation updated: README, architecture, plan, API examples, and this record.

Implemented GET /api/categories (optional validated type filter, type/name ordering), POST /api/transactions (complete validation, category compatibility, atomic insert/aggregate/readback, 201 and Location), and GET /api/transactions/:id (strict ID, exact response shape, missing 404). Docs/API.md contains illustrative request/responses. All SQL is static/parameterized. The service independently bounds all-time income and expense totals as BigInts; both positive totals <= Number.MAX_SAFE_INTEGER bound all date/category subsets and balances. Failures roll back before responding. Expected category/aggregate errors map to existing safe 400 envelopes; unexpected SQL/readback errors remain 500. No list/update/delete/budget/summary endpoints were added.

Exact root commands executed:

```powershell
npm.cmd run typecheck
Write-Output "TYPECHECK_EXIT=$LASTEXITCODE"
npm.cmd run build
Write-Output "BUILD_EXIT=$LASTEXITCODE"
npm.cmd test
Write-Output "TEST_EXIT=$LASTEXITCODE"
```

Initial run passed all three, with 771 tests (74 new integration cases). Final review added three malformed percent-encoding cases and safe URIError normalization; all root checks were rerun:

| Final check | Actual result |
| --- | --- |
| Typecheck | Exit 0; frontend/backend strict checks passed |
| Build | Exit 0; frontend production build and backend compilation passed |
| Frontend tests | 1 file, 71 passed, 0 failed, 0 skipped |
| Backend tests | 11 files, 703 passed, 0 failed, 0 skipped |
| Combined tests | Exit 0; 12 files, 774 passed, 0 failed, 0 skipped |

The final 77 integration cases cover full catalog ordering/filtering, malformed/duplicate/unknown queries, income/expense writes, exact cents and boundaries, response shape/timestamps/Location, optional/max-length notes, NUL rejection, invalid/missing inputs, missing/incompatible categories, strict/malformed IDs, detail 404, SQL-looking note data, unimplemented endpoint 404s, BigInt aggregate boundary/rollback for both types across dates, SQL trigger/readback failure rollback, unavailable connections, safe logging, and HTTP persistence after close/reopen.

Aggregate tests temporarily disable CHECK constraints only to construct a huge synthetic stored amount in a private in-memory fixture; they re-enable CHECKs before HTTP calls. This avoids generating roughly 90 million rows just to hit Number.MAX_SAFE_INTEGER. Production has no such bypass. Test data never opens the development database. Persistence uses only the registered temporary-file allocator and disposes its own artifacts after closing connections.

Final frontend build: 29 modules, 776 ms, unchanged output sizes. No typecheck/build/test warnings or failures occurred. Commands used approved external execution for esbuild/native SQLite compatibility. No live server/Vite proxy/browser review was performed; HTTP integration uses actual loopback Supertest listeners. Aggregate checks scan stored totals on each creation; performance tuning remains future work. Error messages for category/aggregate rejection use the existing fixed field-message envelope, without detailed subreason codes. No known blocking T04 defects. Stop for review before T05/T06; no commit/push performed.

## T05 — Transaction search and pagination

Date: 2026-11-03 (America/Chicago). Prerequisite: executed `npm.cmd test` before changes, exit 0; 774 passed (71 frontend, 703 backend), 0 failed/skipped. Reviewed T04 source/contracts. Before implementation, explicitly recorded the user-approved ASCII-only case-insensitive/literal-Unicode note search scope in PRD FR-04, US-06, architecture, and T05 plan; no full Unicode folding/normalization is claimed.

Created routes/transaction-list.test.ts. Modified transaction repository/service/router to add only GET /api/transactions. Reused validateTransactionQuery unchanged. Updated the T04 unimplemented-endpoint assertion and the old unknown-route middleware case now that the list endpoint exists; create/detail tests are otherwise unchanged. Documentation updated: four planning documents, README, API examples, and this record. No dependencies, schema, UI, PUT/DELETE, budget, or analytics features added. Existing uncommitted changes were preserved.

The list service uses a deferred transaction spanning category existence lookup, COUNT, and paginated data. Both SQL queries share the same parameterized AND filters and join. Date comparisons are inclusive. Ordering is date DESC/id DESC, SQL LIMIT/OFFSET is used, and BigInt metadata/offset arithmetic avoids rounding huge valid page numbers. Missing categories return safe 400; incompatible existing categories yield empty results. A query beyond the last page keeps accurate metadata and skips data selection. No matches produce totalPages=0. Search escapes LIKE percent/underscore/backslash and uses built-in ASCII lower on both sides; Unicode stays literal. NUL-containing searches yield no matches, avoiding LIKE truncation against NUL-free stored notes.

Exact root verification commands:

```powershell
npm.cmd run typecheck
Write-Output "TYPECHECK_EXIT=$LASTEXITCODE"
npm.cmd run build
Write-Output "BUILD_EXIT=$LASTEXITCODE"
npm.cmd test
Write-Output "TEST_EXIT=$LASTEXITCODE"
```

| Check | Actual result |
| --- | --- |
| Typecheck | Exit 0; frontend/backend passed |
| Build | Exit 0; frontend production assets and backend compilation passed |
| Frontend tests | 1 file, 71 passed, 0 failed, 0 skipped |
| Backend tests | 12 files, 753 passed, 0 failed, 0 skipped |
| Combined tests | Exit 0; 13 files, 824 passed, 0 failed, 0 skipped |

50 new list integration cases cover defaults, complete/partial/beyond-last pages, empty metadata, maximum safe page, 10,000 rows, accurate filtered counts, same-date tie ordering, combined AND filters, inclusive/open/final-year dates, category compatibility/existence, literal wildcard/backslash/injection searches, ASCII/non-ASCII case behavior, Unicode normalization differences, NUL search, whitespace/length limits, malformed and duplicate/array query values, unavailable connections, and nonmutation.

Read-only verification compares all application tables plus total_changes while query_only is enabled. A separate private-file WAL test installs a test-only SQL lower callback to commit a second connection's row during COUNT evaluation: first response keeps the old count/data snapshot, next response sees the new row. This hook is not in production code. All test databases are memory or registered fresh temporary files; connections close before fixture disposal. No development database was opened.

Frontend build transformed 29 modules in 750 ms; artifact sizes unchanged. No warnings/failures were emitted by verification commands. Approved execution outside the sandbox was used for esbuild/native SQLite compatibility. No browser or live Vite proxy checks were performed. The 10,000-row correctness test is not a 300 ms performance benchmark: leading-wildcard searches, counts, and deep offsets can scan rows. Full Unicode case folding/normalization remain explicitly out of scope. No known blocking T05 issues. Stop for review before T06; no commit/push performed.

## T06 — Transaction replacement and deletion

Date: 2026-11-03 (America/Chicago). Prerequisite: ran `npm.cmd test` before editing, exit 0, 824 passed (71 frontend/753 backend), 0 failed/skipped. Reviewed T05 and project documents. Added routes/transaction-mutations.test.ts. Modified transaction repository/service/router and the previous unimplemented-endpoint assertion to retain only budget 404 checks. Updated README, architecture, plan, API examples and this record. No schemas, dependencies, validators, summaries, budgets or frontend features were added/changed.

PUT validates the same complete editable body as POST, checks ID/category existence/type, updates only editable columns, checks affected old/new monthly totals plus all-time totals as BigInts, and reads back within one immediate transaction. Omitted note clears to empty. ID and createdAt are preserved. SQL updates updatedAt to current UTC time when later, otherwise increments the existing timestamp by one millisecond; repeated edits and a simulated future metadata timestamp/century rollover are tested without sleeps. DELETE atomically checks existence, deletes one row, and verifies absence before committing an empty 204. Missing rows return 404; any failed/ignored write, overflow, or readback error rolls back data/metadata/side effects. Safe error mapping reuses the existing boundary. There is no update/delete route logic in validation or repositories beyond the documented layer responsibilities.

Exact root commands executed:

```powershell
npm.cmd run typecheck
Write-Output "TYPECHECK_EXIT=$LASTEXITCODE"
npm.cmd run build
Write-Output "BUILD_EXIT=$LASTEXITCODE"
npm.cmd test
Write-Output "TEST_EXIT=$LASTEXITCODE"
```

| Check | Actual result |
| --- | --- |
| Typecheck | Exit 0; frontend/backend passed |
| Build | Exit 0; frontend production assets and backend compilation passed |
| Frontend tests | 1 file, 71 passed, 0 failed, 0 skipped |
| Backend tests | 13 files, 826 passed, 0 failed, 0 skipped |
| Combined tests | Exit 0; 14 files, 897 passed, 0 failed, 0 skipped |

73 new mutation cases cover replacement identity/creation metadata, monotonic updatedAt, category/type/month switches, exact cent boundaries, omitted/max-length/NUL notes, missing required fields, malformed bodies/IDs, unknown fields, missing categories/records, category mismatch, parameter binding, invalid-edit rollback, safe monthly/all-time boundaries, old/new month coverage, SQL/readback failure rollback, ignored deletion rollback, database unavailability, empty successful 204, repeated deletion, preserved unrelated transactions/budgets, list/search changes, and persistent replacement/deletion after close/reopen.

All mutation tests use memory or registered private temporary files. Oversized aggregate rows and failure triggers are test-only fixtures; CHECK constraints are restored before HTTP operations. Private files are disposed after closing connections. No development database was opened or modified. Existing T04 creation/detail and T05 list/search suites passed unchanged except for removing obsolete assertions that PUT/DELETE were unimplemented.

Frontend build: 29 modules, 799 ms; artifact sizes unchanged. No warnings/failures occurred in verification commands. Approved execution outside the sandbox was used for esbuild/native SQLite compatibility. No browser/live proxy/performance benchmark was performed. Aggregate guards still scan totals; updatedAt is server-managed monotonic edit metadata and can be 1 ms ahead of wall time for rapid edits. No optimistic concurrency control is implemented (single-user last successful write wins). No known blocking T06 issues. Stop for review before T07; no commit/push performed.

## T07 — Monthly summary and analytics API

Date: 2026-11-03 (America/Chicago). Prerequisite: ran `npm.cmd test` before editing, exit 0; 897 passed (71 frontend/826 backend), no failures/skips. This confirms the T06 final verification baseline. Vitest emitted an optional worker-reuse performance hint on that precheck; isolation settings were not changed.

Created validation/summary.ts, repositories/summary.ts, services/summary.ts, routes/summary.ts, services/summary.test.ts, and routes/summary.test.ts. Mounted the summary router in app.ts. Updated README, API examples, architecture, plan, and this record. No existing money/date/query rules, transaction APIs, dependencies, schemas, derived storage, budgets, or frontend logic changed.

GET /api/summary requires one validated month and rejects unknown/list query parameters. The repository reuses the existing per-type monetary SUM query and adds parameterized category/date expense aggregates. One deferred service transaction spans all reads. BigInt values are checked before conversion to safe JSON numbers; balance uses BigInt subtraction. Categories exclude income/zero totals and sort amount DESC/ID ASC. Pure service assembly zero-fills every day using existing inclusive calendar boundaries and checks category/day sums equal monthly expenseCents. Empty months return zero totals/full daily data. No timestamp/current-clock month inference is used. Unsafe/inconsistent stored values, SQLite overflow, and unexpected database errors fail with generic 500; malformed month queries return safe 400.

Exact root verification commands:

```powershell
npm.cmd run typecheck
Write-Output "TYPECHECK_EXIT=$LASTEXITCODE"
npm.cmd run build
Write-Output "BUILD_EXIT=$LASTEXITCODE"
npm.cmd test
Write-Output "TEST_EXIT=$LASTEXITCODE"
```

| Check | Actual result |
| --- | --- |
| Typecheck | Exit 0; frontend/backend passed |
| Build | Exit 0; frontend production assets and backend compilation passed |
| Frontend tests | 1 file, 71 passed, 0 failed, 0 skipped |
| Backend tests | 15 files, 878 passed, 0 failed, 0 skipped |
| Combined tests | Exit 0; 16 files, 949 passed, 0 failed, 0 skipped |

52 new cases comprise 14 pure unit tests and 38 HTTP integration tests. Coverage includes 1900/2000/2100/2400 February rules, 30/31-day months, empty months, negative/exact-cent balances, safe integer extrema, zero filling, category order/ties, income/unspent-category exclusion, inclusive boundaries independent of metadata, December/year transitions, December 9999, list-filter independence, mutation-driven changes across categories/types/months, malformed/duplicate/unknown month queries, SQLite SUM overflow, unsafe aggregate rejection without data changes, unavailable connections, and no derived data/schema mutation under query_only.

The concurrent snapshot test uses a registered private temporary WAL database with two connections. A test-only statement spy commits a writer after the first totals read. The first HTTP response retains the old consistent totals/category/day snapshot; the next response sees the new row consistently. The spy is test-only; no production instrumentation or journal-policy change was added. Aggregate overflow fixtures temporarily bypass CHECKs only in isolated test setup, then restore enforcement before requests. All other tests use memory; connections close before private-file disposal. No development database was opened or modified.

Frontend build: 29 modules, 791 ms; artifact sizes unchanged. No verification failures or warnings were emitted in the final commands. Approved execution outside the sandbox was used for esbuild/native SQLite compatibility. No browser/Vite proxy review or performance benchmark was performed; the aspirational 10,000-row p95 target remains a later measurement. Reporting assumes writes go through validated APIs; SQL date CHECKs alone do not repair manually corrupted data. No known blocking T07 issues. Stop for review before T08; no commit/push performed.

## T08 — Monthly budget API

Date: 2026-11-03 (America/Chicago). Prerequisite: T07 final read-only review passed all 15 criteria with an executed 949-test suite (0 failures/skips). No blocking discrepancy was found.

Created backend/src/repositories/budgets.ts, services/budgets.ts, routes/budgets.ts, services/budgets.test.ts and routes/budgets.test.ts. Modified app.ts to mount the router. Removed only the obsolete T04 assertion that budget APIs were unimplemented; all remaining earlier tests passed. Updated README.md, API.md, ARCHITECTURE.md, IMPLEMENTATION_PLAN.md and this record. No dependencies, schemas, frontend code, authentication or deployment changes.

GET /api/budgets requires an explicit validated month and returns all eight seeded expense categories with derived spending, ordered by name/ID. Absent amount/remaining/utilization values are null. A joined parameterized statement within a deferred transaction provides consistent limits/spending. PUT uses an immediate transaction for category validation, ON CONFLICT upsert and response readback, returning 200 for insert/replacement. DELETE returns empty 204, or 404 for a missing expense-category limit, without deleting transactions. Nonexistent/income categories and malformed inputs return safe 400. Failed writes/readback, unsafe stored aggregates, and SQLite SUM overflow return generic 500 with transaction rollback.

BigInt is used for monetary safety checks, remaining arithmetic, percentage rounding and status comparisons. Utilization is rounded half-up to one decimal without a 100% cap, then converted to a JSON display number. Extreme percentages may exceed floating-point decimal resolution; exact cents/status remain unaffected. Over-budget spending is permitted by existing transaction APIs. No derived totals are stored.

Exact final root commands:

```powershell
npm.cmd run typecheck
Write-Output "TYPECHECK_EXIT=$LASTEXITCODE"
npm.cmd run build
Write-Output "BUILD_EXIT=$LASTEXITCODE"
npm.cmd test
Write-Output "TEST_EXIT=$LASTEXITCODE"
```

| Check | Actual result |
| --- | --- |
| Typecheck | Exit 0; frontend and backend passed |
| Build | Exit 0; Vite production build and backend TypeScript compilation passed |
| Frontend tests | 1 file; 71 passed, 0 failed, 0 skipped |
| Backend tests | 17 files; 962 passed, 0 failed, 0 skipped |
| Combined tests | Exit 0; 18 files; 1033 passed, 0 failed, 0 skipped |

85 new budget tests comprise 17 unit tests and 68 integration tests. The total is 949 previous tests minus one obsolete unimplemented-route assertion plus 85 new cases. Earlier iterations also passed typecheck/build and a 1032-test suite before adding the targeted SQLite SUM overflow test. Final frontend build transformed 29 modules in 814 ms; asset sizes are unchanged. Test/build execution used approved execution outside the sandbox for esbuild access. Vitest emitted only an optional worker-reuse performance hint; isolation was preserved.

Coverage includes every expense category, null semantics, all statuses, exact limits and cents, percentage rounding ties, month/category/type isolation, leap and final-year boundaries, repeated upsert uniqueness and preserved identity, successful/repeated deletion, transaction preservation, malformed inputs and parameterized paths, foreign keys, trigger/readback failures with rollback, unsafe spending/SUM overflow, unavailable storage, mutation-driven spending, private-file close/reopen persistence, and read-only GET under query_only. The snapshot test holds a SELECT iterator open while another WAL connection atomically replaces a limit and adds spending: the first response retains the complete old snapshot, and the next response reflects both committed changes.

Tests use memory or newly registered private temporary files only; all connections close before private-file disposal. No development database was opened, deleted, reset or modified. No browser/live proxy review or performance benchmark was performed. No known blocking T08 issues. Stop for review before T09; no commit/push performed.


## T14b documentation preparation

Date: November 4, 2026 (America/Chicago). Starting HEAD: `ad9899d`. Scope: documentation only; no source, tests, package scripts, dependencies, database schema, or configuration changes.

### Prerequisite and release status

The T14a repository/security audit was completed and reviewed in the task conversation. It reported **0 critical, 0 high, 8 medium findings and 1 low optional hardening item**, with local-only release **NOT READY**. No unresolved critical/high blocker required stopping this documentation task. This entry preserves its relevant conclusions; it is not a new full audit or a claim that the application findings were fixed.

| T14a item | Carry-forward after documentation preparation |
| --- | --- |
| F1: transaction modal focus containment/restoration | Open. See frontend/src/components/AddTransactionDialog.tsx, DeleteTransactionDialog.tsx, and pages/Transactions.tsx. |
| F2: category-fetch failure recovery | Open. The transaction hook does not expose a category-specific error/Retry. |
| F3: old transaction rows after failed filter/page refresh | Open. Prior rows can remain actionable under changed controls. |
| F4: stale transaction refresh warning | Open. Successful retry does not automatically resolve the warning. |
| F5: test-local coordinator coverage | Open. TransactionCoordinator is defined in its test file rather than testing the mounted production hook. |
| F6: month navigation at year limits | Open. Previous from 1900-01 and next from 9999-12 need guarded controls/state. |
| F7: stale release documentation | Corrected in this task: current features, API-only Express topology, preview proxy, test coverage scope, and current task status. |
| F8: release acceptance evidence | Open. Full disposable-database workflow, dialog/browser acceptance, restart rehearsal, demo captures, and benchmark measurements remain. |
| S1: explicit local Host/Origin policy | Optional hardening remains open; no exploit was reproduced in T14a. Public deployment remains prohibited. |

### Documentation changes

- Replaced the historical root README with current features, stack, architecture/engineering decisions, supported runtime versions, PowerShell setup, database lifecycle/backups, development/build/test commands, preview topology, environment values, actual API/reporting behavior, test strategy, security boundary, known issues, screenshot placeholders, troubleshooting, and documentation links.
- Corrected README's claims that dashboard/budget UI/charts were unimplemented, Recharts was future work, and preview had no API proxy.
- Updated API documentation's title and frontend/proxy status without changing endpoint contracts or examples.
- Corrected architecture claims about Express serving built assets, blanket T13 browser-pending status, historical-only testing descriptions, and raw diagnostic logging.
- Updated the implementation plan to reflect the current approved T14b documentation scope. Its earlier audit proposal to call code fixes T14b is superseded; fixes and release rehearsals remain separate future work.
- Preserved historical test/task records rather than rewriting them as new verification. Updated this record's introduction to point to the current entry.

### Executed verification

All required commands ran from the repository root. Runtime: Node **24.19.0**, npm **11.17.0**; supported engine ranges remain Node >=24.19.0 <25 and npm >=11 <12.

| Command | Exit | Actual result |
| --- | --- | --- |
| npm.cmd run typecheck | 0 | Frontend and backend passed. |
| npm.cmd run build | 0 | Frontend Vite build and backend TypeScript compilation passed. |
| npm.cmd test | 0 | Frontend 396 passed in 17 files; backend 962 passed in 17 files; **1,358 total**, 0 failed in 34 files. |
| git diff --check | 0 | No whitespace errors. |

Counts are unchanged from the T14a execution and up 3 frontend cases from the earlier 1,355-test T13 snapshot. No tests were added, removed, or edited by this documentation task. The separate 13-case Analytics Chrome suite passed during T14a, but was **not rerun for T14b** and is not included in the 1,358 total.

Additional read-only checks matched documented npm script commands to actual workspace manifests and checked local Markdown links in the changed documents. Resolving the existing Vite config without opening a listener confirmed development 127.0.0.1:5173 and preview 127.0.0.1:4173, strict ports, and the same /api proxy to http://127.0.0.1:3001. The backend source confirms its hardcoded loopback host and API-only routing.

Setup, npm ci, db:init, dev, start, preview and backup instructions were checked against scripts/source/configuration, **not executed as a clean-install or development-storage walkthrough**. The initializer applies pending migrations and seeds missing categories; running it is intentionally outside this documentation verification. No dependency installation, development database initialization/migration/reset, or new live application walkthrough was performed.

### Remaining documentation evidence

README screenshot names are planned placeholders only; no portfolio image files, demo generator or demo records were created. A complete clean-database/demo/restart record, 10,000-row benchmark results (30 warm list/summary measurements with actual p95, hardware and parameters), and broader keyboard/screen-reader evidence remain absent. Documenting these gaps does not satisfy the corresponding release checks. The p95 target itself is aspirational, but measurement evidence is required by the release plan.

### Handoff

Modified only README.md, docs/API.md, docs/ARCHITECTURE.md, docs/IMPLEMENTATION_PLAN.md, and docs/VERIFICATION.md. No new files; no application changes or documentation-related code fixes. Builds regenerated ignored output, and tests used their existing isolated fixtures. Development records were not touched. No commit or push.

Git status: five modified tracked documentation files; nothing staged or untracked. T14b documentation is ready for review; final local-only MVP release remains pending the known fixes and acceptance evidence above.


## Release packaging and post-fix verification - November 4, 2026

**Assessment: CONDITIONAL PASS. LOCAL-ONLY release package: NOT READY.** This entry supersedes current-status claims, not historical T14b/T14d results above. No public release, commit, or deployment has occurred.

T14c resolved F1-F6 with mounted transaction/month tests. The subsequent BudgetDialog.tsx fix preserves showModal(), native background modality and Escape behavior; local Tab/Shift+Tab handling wraps enabled controls. Pending mutations focus the dialog, prevent cancellation/duplicates, and retain errors and values. Closing restores a connected trigger or the Budgets heading. Nine registered Chrome budget cases exercise Set/Edit/Remove, initial and boundary focus, actual background nonactivation, cancellation, saves, pending guards, failures and repeated reopening. The former BODY boundary state did not itself prove background interactivity.

### Browser proxy investigation and isolation

Earlier audit logs contained three GET /api/summary?month=2026-11 proxy failures with ECONNREFUSED at 127.0.0.1:3001. Those were attempted connections to the development API target, not successful API responses. No backend listener was reached by those refused connections; no write is established. Their initiating page/tab/runner is **NOT VERIFIED**: the retained logs contain no request origin or initiator, and guarded reruns did not reproduce them. Do not attribute them to an external tab or fixture without evidence.

Two configuration weaknesses were verified: Vite merged proxy: {} with the application's /api proxy, and its port-zero handling could fall back to the normal development port. These explain a possible forwarding path, not the unidentified caller. The browser runner now uses test-only configFile: false, the existing React/Tailwind plugins, middleware mode, HMR disabled, and a Node HTTP listener bound to 127.0.0.1 on an OS-assigned port. Production Vite settings are untouched. A boundary rejects actual /api requests with explicit 503 TEST_API_BLOCKED responses, records request metadata in temporary api-requests.json, and fails on unexpected traffic.

One additional regression deliberately requests the summary endpoint and verifies the blocked response and request trace. All 42 previous interaction cases remain registered. The final run passed **43 Chrome checks**; its trace contained exactly the deliberate Node probe and no unexpected API requests. This verifies the current boundary, not the historical caller. **Unattributed prior requests remain a release blocker as required by the packaging task.**

### Executed commands

| Command | Exit | Result |
| --- | --- | --- |
| npm.cmd run typecheck | 0 | Both workspaces passed. |
| npm.cmd run build | 0 | Frontend build and backend compilation passed. |
| npm.cmd test | 0 | 399 frontend / 17 files; 962 backend / 17 files; 1,361 total / 34 files. |
| npm.cmd run test:browser --workspace frontend | 0 | 43 passed, 0 failed; Chrome 156.0.8078.80. |

The Vitest baseline is unchanged; Chrome increased from 42 to 43 because of the isolation regression. Browser screenshots, isolated profile and request trace are temporary artifacts, not portfolio images or release files. Typecheck/build/test/browser were rerun together; no unexpected API traffic occurred in that run.

### Evidence continuity and remaining limits

Original T14d failure text and its 10,000-row measurements are preserved. Backend, migrations, query and financial code, lockfile and production proxy have not changed from the rehearsal evidence; the focus fix and browser-only isolation do not invalidate those results. No benchmark was rerun or invented. The original historical CONDITIONAL PASS remains accurate for its snapshot; the budget blocker is now resolved, while the separate packaging attribution blocker remains.

README, ARCHITECTURE, IMPLEMENTATION_PLAN and the verification index now reflect current fixes and evidence. The .gitignore comment is translated with every ignore pattern preserved. Full screen-reader speech, VS Code preview, fresh-install reproducibility and backup restoration remain unverified. Independently rounded Dashboard shares can total 101% without affecting cents. The unauthenticated API is approved only for trusted loopback use, never public hosting or LAN exposure.


## Prompt 44 - WebSocket listener resolution and acceptance - November 4, 2026

**Result: PASS. LOCAL-ONLY RELEASE GATE: READY for human review.** This dated entry supersedes earlier current-gate assessments while preserving their historical observations and all benchmark measurements. No commit, tag, push, publication or public-deployment approval is implied.

### Confirmed cause and narrow fix

Prompt 43 observed the intended ephemeral loopback HTTP listener plus an unintended IPv6 wildcard TCP listener at [::]:24678. Installed Vite 7.3.7 createWebSocketServer only returns a disabled transport for server.ws === false; hmr: false alone leaves its standalone WebSocket transport enabled, with default port 24678 and unspecified host. That confirms the previously observed listener belongs to the test runner rather than an unrelated process. No additional wildcard listener was deliberately opened to reproduce it in this task.

The test-only createServer call in frontend/test/browser/analytics.browser.mjs now sets **server.ws: false** alongside hmr: false and middlewareMode: true. Node still binds HTTP to 127.0.0.1 on an OS-assigned port. configFile: false, API rejection/tracing and the final unexpected-request assertion remain. frontend/vite.config.ts, backend APIs, schema, financial logic, lockfile and application features are unchanged. All nine Budget Dialog regressions remain registered.

### Runtime regression guard

New frontend/test/browser/listener-guard.mjs observes actual Node net.Server listening events, records addresses/ports and closes unsafe listeners; its assertions reject wildcard and non-loopback addresses. It distinguishes IPv4 127/8, IPv6 ::1 and IPv4-mapped loopback from wildcard/LAN addresses. Node connection attempts to port 3001 are blocked and recorded as failures.

Windows CIM process ancestry and Get-NetTCPConnection snapshots select only TCP listeners owned by the runner and its descendants, including native Chrome. The browser case asserts that both the runner HTTP socket and Chrome debugger socket are found under their actual PIDs. Unrelated system listeners are excluded. Evidence is printed and written to temporary listeners.json; API traffic remains in api-requests.json. These are test artifacts, not staged release files.

Node server observation is continuous from before Vite creation. Native-child inspection is a start/end snapshot, not continuous OS surveillance: transient native listeners between snapshots and UDP endpoints are not verified. PowerShell/CIM/TCP inspection failures and unsupported operating systems fail explicitly rather than silently skipping. This guard is currently verified on Windows/Node 24, not claimed as cross-platform OS coverage.

### Unchanged-configuration acceptance runs

Every normal run below executed npm.cmd run test:browser --workspace frontend with the final fixed runner and permanent guard. No external runtime hooks, port rewriting, alternate configuration or development backend was used. Each start/end OS snapshot contained exactly two test-owned listeners, both IPv4 loopback; continuous Node evidence contained only the HTTP socket. No port 24678 listener, unexpected API traffic or Node port-3001 attempt was recorded.

| Run | Node PID / HTTP port | Chrome PID / debugger port | Listeners per snapshot | Tests | Exit |
| --- | --- | --- | --- | --- | --- |
| Normal 1 | 28380 / 50306 | 26132 / 50307 | 2, both 127.0.0.1 | 44 passed | 0 |
| Normal 2 | 23812 / 50376 | 27160 / 50378 | 2, both 127.0.0.1 | 44 passed | 0 |
| Normal 3 | 9812 / 51370 | 20816 / 51371 | 2, both 127.0.0.1 | 44 passed | 0 |
| Clean normal after negative | 13688 / 51472 | 27616 / 51473 | 2, both 127.0.0.1 | 44 passed | 0 |

All normal API traces contained exactly one intentional marked summary probe and zero unexpected requests. Temporary artifact directories were expense-analytics-browser-BmOJ3s, -uwJFLF, -DZw2Qm and -Id4erF respectively under the OS temporary directory. Chrome version: 156.0.8078.80. The count increased from 43 to 44 solely because of the actual-listener case; no existing case was removed.

### Negative API isolation acceptance

The final runner supports the explicit test-only environment flag BROWSER_ISOLATION_NEGATIVE=1. It generates an unmarked GET /api/isolation-negative against its own isolated HTTP server after the normal marked probe. Actual result: **503 TEST_API_BLOCKED**, recorded with probe: false, then the normal final assertion reported Unexpected real API requests and the npm process exited **1** after 44 cases passed. This is an expected negative-test failure, not a normal-suite failure. The negative run used HTTP 51419 (Node PID 27292), Chrome debugger 51420 (PID 15292), both loopback. Its artifact directory was expense-analytics-browser-tzwa6X. A clean normal run afterward passed 44/44 with exit 0. The flag was removed before that run.

### Full verification and evidence continuity

| Command | Exit | Result |
| --- | --- | --- |
| npm.cmd run typecheck | 0 | Frontend and backend passed. |
| npm.cmd run build | 0 | Frontend build and backend compilation passed. |
| npm.cmd test | 0 | 399 frontend in 17 files; 962 backend in 17 files; 1,361 total in 34 files. |
| npm.cmd run test:browser --workspace frontend | 0 | Four normal runs passed 44 cases each; negative mode intentionally exited 1. |

No dependency was installed and no development backend was launched. Development database metadata remained unchanged with no journal/WAL sidecars; no financial record was opened or mutated through the application. The previously recorded real-backend T14d workflows and 10,000-row benchmark remain attributable to unchanged backend/query code; their values were not rewritten or remeasured.

The initiator of the three historical refused summary proxy attempts remains **unknown**. Current proxy removal, API blocking, negative failure detection and repeated runtime listener checks mitigate the present isolation risk; unavailable historical attribution alone is no longer a release blocker under the accepted review criteria. Full screen-reader speech, VS Code preview, fresh installation and backup restoration remain unverified. Dashboard independently rounded shares can still total 101% without changing cents. These limits do not authorize public exposure: the unauthenticated MVP remains restricted to trusted local loopback use.
