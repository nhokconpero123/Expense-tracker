# Interactive browser demo implementation and review

Candidate prepared on November 4, 2026. No deployment, commit, push, Render setting change, authentication, or shared writable database is part of this change. The currently published site has not been updated by this work.

## Architecture and mode separation

The existing `apiFetch` function is the adapter boundary beneath the transaction, category, monthly summary, and budget clients. With `VITE_PUBLIC_DEMO_MODE=true`, it dispatches every request to the browser repository. There is no fallback to Render, including when storage fails. All derived financial views read the same current transaction/budget snapshot. Existing React pages, forms, request ordering, error states, and transaction revision notifications remain in use.

Without that frontend flag, the original API transport, Vite loopback proxy, Express CRUD, and persistent local SQLite workflow remain in place. The frontend flag defaults to false. Backend `PUBLIC_DEMO_MODE`, `HOSTED_DEPLOYMENT`, Host/Origin/CORS checks, SQLite query-only protection, seed definitions, and public mutation rejection are unchanged. Browser-local reset does not call a backend endpoint.

The browser fixture is generated from the canonical category catalog and public-demo sample tuples. A test compares those literals against the backend source without importing backend modules into the browser. IDs are generated from the fresh canonical catalog, and fixture records resolve categories by name/type. Initial values are November 2026, 13 transactions, six budgets, income 395000 cents, expenses 215500 cents, and balance 179500 cents.

## Storage, recovery, and concurrency

Only `expense-tracker:interactive-demo:v1` is written. Its JSON object includes schema version 1, seed version 1, the next transaction ID, transactions, and budgets. Transactions and budgets are saved in one `localStorage.setItem` operation. Stored values are validated before use: versions, IDs, category/type relationships, dates, notes, cents, metadata, duplicate records, budget keys, and safe aggregate totals. Reloading uses stored changes rather than reseeding. This version has no automatic migration; incompatible schema/seed versions remain stored and require an explicit recovery decision.

Corruption blocks reads with an error and leaves the original value intact. The demo notice and Reset Demo remain usable. Storage access and quota failures do not report successful saves and do not replace existing data. Users can allow site storage/free space and retry, or inspect/export the raw namespaced value using browser tools before explicitly resetting. Unsupported browsers show a safe error rather than attempting a network write or silently switching to nonpersistent memory.

Web Locks serialize all repository operations across tabs, including first initialization, mutations, and reset. Each operation reads the latest snapshot while holding the lock. IDs increase monotonically, including after deletions. Storage events remount the active data view in other tabs, dropping stale dialogs and requests while preserving those tabs' selected month. Reset explicitly restores the initiating tab's selected month to November 2026. People sharing an origin in the same browser profile share the demo state; independent profiles/devices do not. This is browser storage behavior, not server-enforced identity isolation.

## Transaction and budget behavior

The existing Add/Edit/Delete dialogs are enabled. Money remains integer USD cents, with positive per-record values limited to 100000000 cents and safe aggregate guards. Dates retain the supported Gregorian 1900–9999 range, including future dates. Category/type relationships are checked. PUT is a complete replacement: omitted note clears it; explicit null/undefined, NUL, or an overlong note is invalid. Identity and creation metadata survive updates. Searches retain literal, ASCII case-insensitive note matching, combined AND filters, descending date/ID ordering, and existing page defaults/limits.

Budget Set/Edit/Remove uses the existing UI and local repository. Only expense categories can have budgets. Spending is recalculated from current transactions for the selected month. Under, at-limit, over, and no-budget states, remaining cents, and half-up utilization to one decimal follow the existing contracts. Summary income/expenses/balance, category totals, and zero-filled daily series are derived from the same validated local transactions. There are no stale server summary or budget responses to mix into local changes.

Reset Demo uses a native modal confirmation with Cancel initially focused, keyboard containment, Escape/Cancel handling, pending guards, trigger focus restoration, and accessible success/error feedback. Cancellation leaves storage unchanged. Confirmation replaces transactions and budgets together with the canonical fixture, resets the initiating month, refreshes mounted views and other tabs, and preserves unrelated localStorage keys. Reset never touches SQLite.

## Files created or modified

| File | Change |
| --- | --- |
| `frontend/src/lib/demoFixture.ts` | Versioned browser-safe fictional fixture |
| `frontend/src/lib/demoRepository.ts` | Validated storage, serialization, CRUD, filtering, derived summaries/budgets and reset |
| `frontend/src/lib/deployment.ts` | Explicit public-mode repository selection |
| `frontend/src/components/DemoNotice.tsx` | Privacy/storage disclosure and accessible reset dialog |
| `frontend/src/App.tsx` | Notice and cross-tab/reset view invalidation |
| `frontend/src/context/MonthContext.tsx` | Restore initial month after explicit demo reset |
| `frontend/src/components/BudgetCard.tsx` | Enable browser-local budget controls |
| `frontend/src/components/TransactionTable.tsx` | Enable browser-local transaction actions |
| `frontend/src/pages/Transactions.tsx` | Enable Add Transaction |
| `frontend/src/lib/demoRepository.test.ts` | Fixture parity, domain behavior, storage and recovery tests |
| `frontend/src/lib/demoTransport.test.ts` | Existing-client consistency, serialized mutations and no-network tests |
| `frontend/src/lib/deployment.test.tsx` | Mode routing, no-network boundary and interactive presentation tests |
| `frontend/test/browser/interactive-demo.browser.mjs` | Isolated real-Chrome runner for public-mode source and compiled assets |
| `frontend/test/browser/interactive-demo.checks.mjs` | CRUD, reload, reset, analytics, accessibility, recovery and cross-tab scenarios |
| `frontend/package.json` | Additional `test:browser:demo` command |
| `scripts/verify-worker-assets.mjs` | Interactive notice/storage checks, absent network transport and backend-runtime asset checks |
| `README.md` | Browser-local behavior, recovery, modes, test command and candidate status; existing user edits preserved |
| `DEPLOYMENT.md` | Updated frontend-mode meaning and acceptance instructions; historical evidence retained |
| `docs/INTERACTIVE_DEMO_VERIFICATION.md` | This implementation and review report |

## Verification

Run from the repository root, using the supported Node 24/npm 11 toolchain. Chrome may be selected through `CHROME_PATH`.

| Command | Final result |
| --- | --- |
| `npm.cmd run typecheck` | Passed for frontend and backend |
| `npm.cmd run build` | Passed for frontend and backend |
| `npm.cmd test` | 468 frontend + 1065 backend = 1533 passed, 0 failed; 38 test files |
| `npm.cmd run test:browser --workspace frontend` | 44 passed, 0 failed |
| `npm.cmd run test:browser:demo --workspace frontend` | 8 passed, 0 failed |
| `npm.cmd run build:cloudflare` | Passed with public-demo build variables; assets-only verifier passed |
| `npm.cmd run test:browser:demo --workspace frontend -- --built` | 7 passed, 0 failed against compiled public assets |
| `git diff --check` | Passed |

Chrome version: 157.0.8103.38. The source-mode demo run uses the actual app with the public flag compiled by Vite, real localStorage/Web Locks, an isolated temporary browser profile, blocked external origins, and no API fixtures/backend. It covers exact initial totals, keyboard transaction create/edit/delete, confirmation cancellation, Dashboard/Analytics updates, reload persistence, budget create/edit/remove, reset focus/containment/cancellation/confirmation, restoring the selected month and seed, mobile/reduced-motion usability, corrupt-data recovery, and ten serialized operations from a second same-origin tab. Network observation found zero write requests; the API interception log was empty. The compiled-asset mode repeats seven UI scenarios; its source-module concurrency probe is covered separately by the eight-check source run.

The original 44 Chrome checks cover existing local transaction/budget dialogs, keyboard focus, async error/retry behavior, month bounds, responsive analytics, and loopback listener isolation. Backend public-demo protection tests pass within the 1065 backend cases. No backend source, configuration, seed, deployment descriptor, or lockfile is changed. No commands were issued against the existing local SQLite database. All browser profiles and tooling downloads are temporary and outside committed application assets.

## Cloudflare configuration and limits

No deployment descriptor, variable name, Worker binding, API proxy, or Render setting changes are required. Keep `VITE_PUBLIC_DEMO_MODE=true` for the public build. `VITE_API_BASE_URL` remains an exact HTTPS-origin requirement of the existing asset-verification workflow; this candidate was checked with `https://expense-tracker-oeow.onrender.com`. The public bundle eliminates that network transport. Continue using the documented root Cloudflare build command; a successful build does not authorize publication. Keep the public Render API read-only independently of the frontend.

Current HTTPS/localhost browsers with localStorage and Web Locks are required. Quota/private-mode policies may prevent persistence; the application reports errors instead of claiming durable saves. Browser storage is neither encrypted finance storage nor an account-backed service. Use fictional inputs only. A person sharing the browser profile can see/change/reset its demo state; there is no authentication or server-enforced per-person isolation. Clearing storage removes changes. Other-tab updates intentionally discard stale editors/filters in the active view rather than presenting obsolete financial data. There is no offline service worker, import/export UI, bank integration, multi-user production service, or implicit schema migration.

Git changes remain uncommitted for human review. No live provider smoke test, deployment, commit, or push has been performed.
