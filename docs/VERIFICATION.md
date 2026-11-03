# T01 Verification Record

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
