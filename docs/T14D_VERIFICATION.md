# T14d — Final Local-Only MVP Release Rehearsal

Date: November 4, 2026 (America/Chicago). Main run: 2026-11-04T19:20:04.296Z to 2026-11-04T19:20:12.598Z UTC. This report records executed checks against the current uncommitted T14c frontend and compiled backend, not only the committed HEAD.

## 1. Executive summary

**CONDITIONAL PASS.** The real Express backend, built frontend, proxy, SQLite persistence, synthetic financial workflows, and warm benchmarks passed. A repeated Budget dialog Tab-containment failure remains. No application source, dependencies, backend contracts, database schema, or existing documentation files were changed during this rehearsal.

An initial UI-driver attempt stalled while submitting a form. A fresh isolated run with trusted mouse input passed the workflow; a focused follow-up with explicit page activation also verified actual keyboard Enter submission. The initial stall is not treated as a reproduced application defect. Its diagnostics were retained separately rather than silently discarded.

## 2. LOCAL-ONLY RELEASE GATE

**NOT READY.** Resolve and regress the Budget dialog focus-boundary issue before claiming complete keyboard acceptance. Review documentation statements that predate T14c and this rehearsal. No public deployment, authentication, hosting, tunnel, tag, push, or publication is authorized.

## 3. Environment and database isolation

| Item | Actual evidence |
| --- | --- |
| Development database | `C:\Users\chauv\project-manegment\Expense-tracker\backend\data\expense-tracker.sqlite` |
| Main disposable workspace | `C:\Users\chauv\AppData\Local\Temp\expense-tracker-rehearsal-JqskqG` |
| Main isolated database | `C:\Users\chauv\AppData\Local\Temp\expense-tracker-rehearsal-JqskqG\rehearsal.sqlite` |
| Initial diagnostic workspace | `C:/Users/chauv/AppData/Local/Temp/expense-tracker-rehearsal-SYuLQ0` |
| Database configuration | Absolute DATABASE_PATH supplied explicitly to child processes; PORT chosen independently; NODE_ENV=production; inherited VITEST removed for the standalone server. |
| Environment file | backend/.env absent. Its optional absence produced a benign Node notice, not an application startup error. |
| Path proof | Disposable path is inside a new mkdtemp directory, outside backend/data, differs from the resolved development path, and did not exist before initialization. No existing file was replaced. |

Development storage was identified using configuration and filesystem metadata only; it was not opened or read as a SQLite database. Before and after both complete runs, its main file remained **40,960 bytes**, with identical inode and nanosecond modification time (**1793819120193644300**). No journal, WAL, or SHM sidecar appeared. These observations, plus explicit child DATABASE_PATH overrides, establish the isolation evidence; they are not a content-hash claim because financial file contents were deliberately not opened.

All pre-existing application files and five documentation files retained their original SHA-256 hashes. Only .gitignore changed externally during the rehearsal; that edit and external index staging were preserved, not performed or reverted by this task.

Private temporary scripts, raw JSON, synthetic databases, Chrome profiles, and screenshots are retained for review in the listed temporary workspaces. No temporary artifact or database was added to Git.

## 4. Setup and startup verification

- Checked README commands against actual manifests, Vite configuration, database path resolution, and entrypoints. No dependency installation or fresh-clone npm ci was performed; the existing dependency tree was reused.
- Built both workspaces, then ran the actual compiled database CLI twice against the never-created isolated database. Both invocations exited successfully; migration history contained version 1, the category catalog had 11 entries, and transactions/budgets were empty.
- Started the actual compiled `backend/dist/server.js` with the verified environment. Startup initialized storage before listening. A test-only wrapper outside the repository provided shutdown control; it did not replace the app, routes, or database code.
- Served real frontend/dist assets through Vite preview. Runtime-only preview options redirected /api to the isolated backend port. Repository Vite config was not edited.
- Main API: `http://127.0.0.1:59703`. Main preview: `http://127.0.0.1:59704`. Supplementary checks used `http://127.0.0.1:59893` and `http://127.0.0.1:59894`.
- Direct /api/health and preview-proxied /api/health returned 200 with the actual readiness envelope. OS listener inspection confirmed **127.0.0.1** for both services. HTML 200 was supplemented by successful real API and browser workflows.
- Application logs contained normal startup messages, no SQL/stack/internal-error output. The only startup notice was the missing optional .env file.

## 5. End-to-end feature matrix

| Check | Result | Executed evidence |
| --- | --- | --- |
| Category catalog | PASS | Real API returned 11 seeded categories; IDs discovered by name/type. |
| Income and multi-category expenses | PASS | Created synthetic salary, Food, Transport and adjacent-month records through real POST requests. |
| Detail, ordering and pagination | PASS | GET detail matched creation; two-row pages verified date-descending and ID-descending ties. |
| Combined filters | PASS | Type, category, inclusive date range and note combined with AND; incompatible type/category returned no matches. |
| Literal/ASCII search | PASS | Percent, underscore and backslash matched literally; LUNCH matched Lunch; CAFé matched Café while CAFÉ did not. |
| Complete replacement | PASS | PUT preserved ID/createdAt, changed type/category/month, and omitted note became empty; explicit empty note also verified. |
| Real UI create/edit/delete | PASS | Saved $12.34, edited to $20.00, canceled deletion without losing the record, then confirmed deletion and observed 404. |
| Keyboard transaction submission | PASS | Supplement explicitly activated the page, focused Save Transaction, sent Enter, verified one real persisted record, then removed that synthetic record. |
| Invalid requests | PASS | Six invalid amount/date/category/unknown-field requests returned 400; record count and summary remained unchanged. |
| Dashboard mutation refresh | PASS | Expenses moved from $100.00 to $112.34 after UI creation and returned to $100.00 after deletion. |
| Successful write / failed refresh | PASS | A real POST committed once; only the following browser GET was fulfilled with a synthetic 500. Retry loaded real data, cleared the warning and did not repeat POST. |
| Category recovery | PASS | One category GET was intercepted as 500; modal Retry fetched the real catalog and preserved the typed amount. |
| Budget API statuses | PASS | Food spending 7,550 cents tested limits 10,000 (under), 7,550 (at_limit), 5,000 (over, 151%), and 20,000 (under). |
| Budget UI | PASS | Set/edit/remove through actual controls; capped progress value 100 with 151% text; removal preserved $75.50 spending. |
| Budget cancellation and pending safety | PASS | Set/Remove idle Escape and removal cancellation preserved data. A held real PUT kept the Edit modal open on Escape, then saved once after release. |
| Shared selected month | PASS | February 2024 persisted while navigating Dashboard, Budgets and Analytics. |
| Summary reconciliation | PASS | Expense categories and daily values each summed to expenseCents. February had 29 days and two spending days before benchmark fixture expansion. |
| Charts and tables | PASS | Real bars/donut rendered; keyboard category selection displayed Food $75.50; Table View showed 2 spending rows, expanded to all 29, then collapsed. Chart axis retained day 29. |
| Month race | PASS | A March summary read was held, old financial values disappeared, February reloaded, and releasing the obsolete read did not replace current data. |
| Supported month bounds | PASS | Previous disabled at 1900-01; Next disabled at 9999-12. Direct-action guards are additionally covered by the existing Chrome suite. |
| Budget complete Tab containment | **FAIL** | Amount → Cancel → Save budget → BODY while the native modal remained open. Reproduced in main and supplementary runs. |

Network interception was limited to the private preview target. Successful reads/writes otherwise reached the real backend; no page-wide fixture fetch replacement was installed. The separate existing 33-case Chrome suite continues to use its documented fixtures and is reported separately below.

## 6. Persistence results

The actual production shutdown handler was exercised by a private wrapper sending a stdin command that emitted SIGTERM inside its own Node process. The unchanged handler called server.close(), closed SQLite and exited 0. This verifies the handler path, not physical Windows Ctrl+C delivery. The backend restarted against the **same** isolated file and port.

| Value | Before restart | After restart |
| --- | --- | --- |
| Transaction IDs, list order | 4, 5, 3, 2, 1 | 4, 5, 3, 2, 1 |
| February income | 200,000 cents | 200,000 cents |
| February expenses | 10,000 cents | 10,000 cents |
| February balance | 190,000 cents | 190,000 cents |
| Food budget | ID 1; category 4; 10,000 cents | Identical ID, amount and timestamps |
| Categories | 11, same IDs/types/names | Identical |
| Migration history | Version 1 with existing applied timestamp | Identical |

Full transaction, category, budget, history and summary snapshots compared equal. No reset or seed duplication occurred. Benchmark data was added only after this comparison. The later supplementary held-PUT test intentionally changed the disposable Food limit to 12,000 cents; that is separate from the restart snapshot.

All owned backend instances exited 0. All rehearsal API/preview listeners were stopped; the final OS check found zero listeners on the recorded main/supplement ports. No pre-existing process was targeted for shutdown.

## 7. Accessibility and responsive results

| Real built application page | 360px | 768px | 1440px |
| --- | --- | --- | --- |
| Dashboard | PASS | PASS | PASS |
| Transactions | PASS with contained table scrolling | PASS | PASS |
| Budgets | PASS layout; dialog focus issue separate | PASS layout | PASS layout |
| Analytics | PASS chart/table layout | PASS | PASS |

Checks temporarily exposed body/root horizontal overflow rather than trusting overflow-x-hidden. Chart/axis/control geometry and page scroll width were inspected. The first generic 360px transaction assertion flagged off-screen table action buttons; a focused follow-up confirmed the scroll container stays within the page, uses overflow-x:auto, and exposes Edit after horizontal scrolling. The real Edit dialog opened and canceled successfully. This was a test-classification issue, not a page-overflow defect. Contained table scrolling is permitted by the PRD.

Transaction dialogs passed complete forward/backward Tab cycles, initial focus, Escape/cancel, original-trigger restoration and heading fallback. Budget Set and Remove Escape behavior and pending Edit protection passed, but full Budget Tab containment failed as described below. Error/Retry controls and month disabled states were operated in Chrome.

Screenshots were captured for the successful page/width combinations and the 360px contained transaction scroll. Dashboard 360px, Budgets 360px, Analytics 1440px and the scrolled Transactions 360px image were visually inspected. The screenshots contain only synthetic data and remain temporary evidence, not committed portfolio assets.

Actual screen-reader speech, NVDA announcements, other browser engines, and VS Code embedded-preview behavior remain **NOT VERIFIED**. Accessibility-tree checks from the existing suite are not equivalent to screen-reader speech.

## 8. Benchmark report

| Environment | Actual value |
| --- | --- |
| CPU | Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz |
| Logical processors | 8 |
| Reported RAM | 15.92 GiB |
| Platform | Windows 10.0.19045; x64 |
| Node / npm | v24.19.0 / 11.17.0 |
| Browser | Chrome/156.0.8078.80 |
| Dataset | Exactly 10,000 transactions: 7,999 expenses and 2,001 income records; 9,998 in February 2024 and 2 in March 2024. |
| Dataset construction | Retained 5 workflow records; added 9,995 synthetic records with a parameterized transaction on the positively identified disposable file. Foreign keys and normal constraints remained enabled. |
| Synthetic distribution | Additional amounts 1–9,995 cents; every fifth added row income, otherwise one of eight expense categories; dates cycle through February's 29 days. Notes identify benchmark fixtures. |

| Real HTTP endpoint | Measured samples | Statuses | Median ms | p95 ms | Maximum ms |
| --- | ---: | --- | ---: | ---: | ---: |
| GET /api/transactions?page=1&pageSize=20 | 30 | All 200 | 15.899 | 16.360 | 16.403 |
| GET /api/summary?month=2024-02 | 30 | All 200 | 15.370 | 23.183 | 23.627 |

Method: monotonic performance.now(), starting immediately before fetch and ending after response.json(). **HTTP client, loopback transport and JSON parsing overhead are included.** Each endpoint had five warm-up requests excluded from its 30 sequential samples. Startup, fixture creation and browser work were excluded. p95 uses nearest rank, the 29th sorted sample of 30; median averages the 15th and 16th. Raw samples are retained in results.json.

Both measured p95 values are below the aspirational 300 ms target on this machine. These are local warm sequential measurements, not a guarantee, concurrency test, cold-start measurement or benchmark of wildcard searches/deep pagination. The unchanged synchronous SQLite implementation and current system conditions apply.

## 9. Automated test results

Commands were executed from the repository root against the same source fingerprint used to build this rehearsal:

| Command | Exit | Actual result |
| --- | ---: | --- |
| npm.cmd run typecheck | 0 | Frontend and backend passed. |
| npm.cmd run build | 0 | Vite frontend and TypeScript backend passed. |
| npm.cmd test | 0 | 399 frontend + 962 backend = **1,361 passed**, 0 failed, 34 Vitest files. |
| npm.cmd run test:browser --workspace frontend | 0 | **33 passed**, 0 failed, actual Chrome. Includes 13 Analytics and 20 transaction/month cases. |
| git diff --check | 0 | No whitespace errors; line-ending normalization warnings only. |

Counts match the reported T14c baseline. Existing browser tests are fixture-isolated and do not cover the Budget Tab boundary; passing them does not override the reproduced failure. The additional ad hoc real-backend rehearsal is not included in the 1,361 or 33 counts.

The main ad hoc runner initially recorded 30 passing checks and two flags. Supplementary execution passed contained scrolling, keyboard submission and pending budget safety, while independently reproducing the Budget focus failure. The scrolling flag was resolved by checking its actual permitted container. Do not treat a zero process exit from the soft-check runner as proof all ad hoc checks passed; this report's gate is NOT READY.

## 10. Security and Git safety

- All actual API/preview services were loopback-only, confirmed through OS socket inspection; proxy override existed only in the private runner.
- No production route, schema, migration, application source, dependency, authentication or deployment configuration was edited. Existing backend diff remains empty.
- The five T14b documentation files and all pre-existing application files are byte-identical to rehearsal start. Existing T14c uncommitted changes were retained.
- .gitignore was edited externally during execution, and existing changes were staged externally. The rehearsal did not stage, unstage, restore, commit or push anything.
- No database, .env credential file, private key or temporary rehearsal artifact appeared in the inspected tracked/staged filename lists. These filename checks are not a comprehensive secret-forensics audit.
- .env.example remains tracked; its newly edited ignore rule does not remove it from Git. Review the external ignore-policy changes separately before committing.
- This unauthenticated MVP is **not safe for public deployment as-is**. No LAN binding, hosting, tunnel or publication was configured.

## 11. Remaining issues

### R1 — Medium: Budget dialog Tab boundary leaves the dialog

File: frontend/src/components/BudgetDialog.tsx, key handling around lines 33–40. The shared transaction dialog fix does not apply to this component.

Reproduction: open Budgets for February 2024, choose Edit budget for Food, begin at the amount field, press Tab three times. Actual trace: Cancel (inside), Save budget (inside), BODY (outside). dialog.matches(':modal') remained true, so this does not demonstrate that background controls became actionable; it demonstrates failed focus containment and lost dialog context. Repeated with the real API in a supplementary run. Reverse/full-cycle acceptance is not established after the forward failure.

Narrow recommendation: reuse or adapt the local boundary wrapping/pending-safe native-dialog lifecycle already used by transaction dialogs, preserving BudgetStore behavior. Add actual Set/Edit/Remove forward/backward boundary tests to the production Chrome suite. No fix was made during this rehearsal.

### R2 — Low: preserved documentation is now stale in places

README's known-issues section and ARCHITECTURE.md/IMPLEMENTATION_PLAN.md still describe already-fixed T14c transaction/month issues and pending measurements now recorded here. VERIFICATION.md's T14b counts are historical and remain correctly dated, but its latest-entry pointer predates this report. This task deliberately preserved all five files.

Proposed later changes, not applied: change the README known-issues list from unresolved F1–F6 statements to T14c fixed plus R1 pending; link this report for restart/benchmark evidence; update architecture testing scope to include real Transactions browser coverage; update implementation status and the verification index. These changes should preserve historical task snapshots.

### R3 — Low: external ignore-file edit conflicts with English-only policy

The current uncommitted .gitignore contains a newly introduced non-English comment and changed ignore policies. It changed outside the rehearsal commands and was preserved. Review the exact diff and translate that comment to English before release; no application data exposure was observed from the staged filename checks.

### R4 — Low presentation limitation: independently rounded Dashboard shares

The inspected synthetic Dashboard displays Food 76% and Transport 25%, totaling 101%, because 75.5% and 24.5% are rounded independently. Exact displayed USD values and backend totals reconcile. Consider labeling shares approximate or showing one decimal. This is not an authoritative-money defect and is not the reason for the NOT READY gate.

Fresh-install reproducibility, full screen-reader speech and VS Code preview acceptance remain unverified; no package installation or additional dependency was authorized or performed. Backup restoration was not rehearsed. Restart persistence was rehearsed as detailed above.

## 12. Final recommendation

**Do not close the LOCAL-ONLY MVP release gate yet.** The actual financial workflows, durable storage, real proxy/UI integration, regressions and warm target measurements passed. Resolve R1, add its browser regression, review the externally modified ignore file, and reconcile current status documentation before final portfolio sign-off. Public deployment remains a separate approval-gated phase.

This task creates only docs/T14D_VERIFICATION.md in the repository. It does not modify or discard the five existing documentation files. The current ignore exception for *_VERIFICATION.md permits this report to appear as an untracked file; it was not staged. Full synthetic diagnostics remain in the temporary workspaces. Stop for human review.


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
