# Expense Tracker

A single-user, localhost-only personal finance application. T01 provides project foundations only: a React landing screen and an Express process-readiness endpoint. Transactions, budgets, database schema, and authentication are not implemented. No database is opened by startup or tests.

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
Copy-Item .env.example backend/.env
npm.cmd run dev
```

The environment copy is optional: defaults work without it. If `backend/.env` already exists, keep its contents rather than overwriting it. No initialization, migration, or seed command exists yet.

- Frontend: http://127.0.0.1:5173
- API: http://127.0.0.1:3001/api/health
- Proxied API: http://127.0.0.1:5173/api/health

Both development servers bind exclusively to IPv4 loopback. Do not override the host, use public tunnels, or expose this unauthenticated MVP through LAN/public hosting. Use browser viewport emulation for mobile layouts. Fixed Vite ports fail rather than silently selecting another port. Stop development with Ctrl+C; the root runner stops both commands.

`backend/.env` supports `PORT` (integer 1–65535, default 3001). Backend binding is hardcoded to `127.0.0.1`; there is no HOST override. If you change PORT, also update the `/api` proxy target in `frontend/vite.config.ts`. No secrets belong in `VITE_*` variables. Database path configuration is deferred to T03.

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
| `npm.cmd run preview --workspace frontend` | Preview frontend build at 127.0.0.1:4173; no API proxy is configured for preview |

Frontend Vitest uses a Node environment and now includes T02a pure USD-parser tests. Its command retains the T01 `--passWithNoTests` option, but tests are present and executed. DOM/component testing infrastructure will be added only when needed. Backend unit tests cover money and ID validation; Supertest checks real HTTP on an ephemeral **loopback-only** listener and closes it afterward. None opens SQLite. Production backend output excludes test files.

## T02a validation utilities

- `validateMoneyCents(value: unknown)` accepts primitive numbers that are safe integers from 1 through 100000000 cents. No string coercion is performed.
- `validatePositiveId(value: unknown)` accepts primitive numbers from 1 through Number.MAX_SAFE_INTEGER. It does not check database existence.
- `parsePositiveId(value: unknown)` accepts canonical ASCII digit strings starting with 1–9. Leading zeros, whitespace (including trailing newlines), signs, decimal points, exponent/hex notation, and unsafe results are rejected.
- `parseUsdToCents(input: unknown)` accepts unsigned ASCII whole-dollar strings with optional one/two decimal places. Leading zeros are allowed; whitespace is rejected rather than trimmed. Examples: `12` -> 1200, `12.3` -> 1230, `12.34` -> 1234, `0.01` -> 1, and `1000000.00` -> 100000000. It constructs cent digits as text, bounds their length, then converts the bounded integer to Number; no floating-point multiplication or rounding is used. Symbols, separators, exponents, zero, negatives, excess precision, and over-limit amounts are rejected.

These functions return a validated number or throw a documented `TypeError` for an incorrect primitive type and `RangeError` for invalid format/range. Callers can catch these standard error classes; HTTP error mapping is deferred to T02d. Frontend parsing is separate from formatting and UI, and backend validation remains mandatory when API integration is implemented. Numeric validators operate on decoded numbers: JSON number spellings such as `1e2` are indistinguishable from `100` after decoding; lexical restrictions apply to the string parsers.

## Manual foundation verification

With `npm.cmd run dev` running, use a second PowerShell terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health | ConvertTo-Json -Compress
Invoke-RestMethod http://127.0.0.1:5173/api/health | ConvertTo-Json -Compress
Get-NetTCPConnection -State Listen -LocalPort 3001,5173 |
    Select-Object LocalAddress,LocalPort,OwningProcess
```

Both responses should be `{"data":{"status":"ok"}}`; both listeners must use `127.0.0.1`, not `0.0.0.0` or `::`. T01 health confirms process readiness only; database readiness is added in T03. To check compiled startup, stop development, run `npm.cmd run build --workspace backend`, then `npm.cmd start` and repeat the direct health/listener check.

Current verification results and exact commands are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md). Planning documents live in `docs/`; follow [AGENTS.md](AGENTS.md). Deployment remains a separate, approval-gated post-MVP phase.
