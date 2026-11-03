# Verification Record

Entries are historical records of each task's verification. The final T03 entry records the current SQLite storage/readiness work and test counts.

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
