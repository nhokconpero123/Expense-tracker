# T13 — Analytics and Charts

Implemented November 3, 2026. V1/V2 follow-up completed: mounted Chrome regression tests and responsive acceptance checks now pass. See the current verification section below; earlier implementation notes are historical.

## Data sourcing and integrity

- Analytics reads only the existing GET `/api/summary?month=YYYY-MM` endpoint using `fetchMonthlySummary`, wrapped by `fetchAnalyticsSummary` for chart-input validation. No new endpoint, backend contract, schema, migration, dependency, or development-data write was introduced.
- The actual response is `{data:{month,incomeCents,expenseCents,balanceCents,expensesByCategory,dailyExpenses}}`. Category rows contain `categoryId`, `categoryName`, and `amountCents`; daily rows contain `date` and `amountCents`.
- Verified `backend/src/services/summary.ts`: `buildMonthlySummary` supplies every calendar day using the validated month's final date, including leap days, with zero for days without expenses. `backend/src/repositories/summary.ts` supplies positive expense-category aggregates. Existing backend tests verify zero filling, category/daily totals, month isolation, and transaction mutation updates.
- The frontend preserves those source arrays, server order, and category identifiers. Charts always receive the full daily series; the daily table derives spending-only rows when collapsed without mutating its source. It neither fills missing days nor recomputes category/monthly financial totals. An incomplete/malformed series produces a retryable error instead of invented values. Test fixtures are synthetic and imported only by tests.
- All source amounts remain safe integer cents. The existing BigInt-based `formatCentsToUsd` formats tooltips, details, totals, and tables, including zero and `Number.MAX_SAFE_INTEGER`. The daily chart receives cents directly, uses integer ticks bounded by the actual maximum, and converts only axis text to USD. Compact axis labels are approximate and identified as such in the UI; exact values remain available in tooltips and tables. Recharts geometry uses floating-point pixels/proportions, not authoritative monetary calculations.

## Charts, interaction, and shared state

- Installed and used Recharts **3.10.1**. Components: `ResponsiveContainer`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `PieChart`, `Pie`, `Cell`, and `Tooltip`. No installation was needed.
- Enabled Analytics in existing desktop/mobile navigation and initial/hash-change handling for `#analytics`. The chart page is lazy-loaded so other pages do not eagerly load the Recharts bundle. The build emits a separate Analytics chunk, approximately 410 kB before gzip and 119 kB gzipped.
- Reused `MonthContext`, `MonthSelector`, `useMonthlySummary`, and existing transaction revision notifications. No month URL persistence or additional state library was added.
- The shared loader now uses request IDs and abort checks, preventing stale same-month refreshes and A → B → A results. Hook loader identity changes during render when month/revision changes, so old summary/error snapshots cannot render under the new month while awaiting effects. Failed refreshes clear old data and offer GET retry.
- Chart View shows daily spending bars and a category donut. At most four daily X-axis labels include the first and last day. Chart parents have explicit 288px heights and `min-width: 0`; Y-axis labels use bounded width and compact currency. Tooltips are configured to remain within chart bounds. Empty months show an explicit no-expenses state rather than an empty pie.
- Category buttons expose native keyboard activation, `aria-pressed`, stable ID-based colors/keys, visible focus, exact USD, and explicit Selected text. Selection highlights the donut and category table and announces exact category details. Clear selection resets it. Daily spending remains the full-month series; it is not presented as a selected-category breakdown because the summary API does not provide that series.
- Table View provides semantic category/daily tables, captions, row/column headers, and backend monthly totals. The daily table defaults to spending days and has an accessible toggle for all calendar days, including zeros. An all-zero month shows one concise daily empty state until expanded. Buttons expose the active view through `aria-pressed`. View, valid category selection, and daily expansion survive same-month loading/error/retry and refresh because the reducer belongs to a month-keyed owner outside conditional data rendering. Changing the selected month resets presentation state.
- All chart/tooltip animations are disabled, including for reduced-motion users. Loading skeleton animation uses `motion-safe:animate-pulse`.
- UI/UX Pro Max was read and used only as design guidance for the existing dark theme, semantic controls, non-color-only selection, readable values, and responsive spacing. No skill script was executed.

## Files created

| File | Purpose |
| --- | --- |
| `frontend/src/pages/Analytics.tsx` | Analytics page, loading/error/retry, empty state, selection details, view composition. |
| `frontend/src/components/SpendingCharts.tsx` | Daily bar chart, category donut, exact custom tooltips. |
| `frontend/src/components/AnalyticsControls.tsx` | Keyboard-accessible view/category/clear controls. |
| `frontend/src/components/AnalyticsTables.tsx` | Daily/category data tables and authoritative monthly totals. |
| `frontend/src/lib/analytics.ts` | Summary adapter/validation, labels, stable colors, view/selection reducer. |
| `frontend/src/test/analyticsFixtures.ts` | Synthetic summary fixtures used only in tests. |
| `frontend/src/lib/analytics.test.ts` | Contract, leap/zero days, amounts, axes, view/selection, and GET retry tests. |
| `frontend/src/components/AnalyticsComponents.test.tsx` | Tooltip/table/empty-state/semantics, chart configuration, and control-handler tests. |
| `frontend/src/components/DailySpendingTable.test.tsx` | Disclosure toggle/reducer/parent wiring, complete month lengths, zero-only state, refresh presentation, and full chart-data regressions. |
| `frontend/src/pages/Analytics.test.tsx` | Page loading/error/recovery/empty states, shared month input, and stale snapshot guard. |
| `docs/T13_VERIFICATION.md` | This report. |

## Files modified

- `frontend/src/App.tsx`: Analytics route and lazy-loaded page.
- `frontend/src/components/Navbar.tsx`: enabled Analytics navigation.
- `frontend/src/hooks/useMonthlySummary.ts`: optional validated fetcher and render-time month/revision isolation.
- `frontend/src/lib/summaryLoader.ts`: per-request stale-response and destruction protection.
- `frontend/src/lib/summaryLoader.test.ts`: overlapping same-month, A → B → A, and late-after-destruction regressions.
- `frontend/src/components/BudgetComponents.test.tsx`: updated the existing navigation expectation now that Analytics is available.
- `docs/ARCHITECTURE.md`: current frontend state and analytics flow.
- `docs/IMPLEMENTATION_PLAN.md`: T13 implementation and verification status.
- `.gitignore`: a narrow exception for this report; other untracked documentation remains ignored.

## Automated verification

All commands run from the repository root:

| Command | Actual result |
| --- | --- |
| `npm.cmd run typecheck` | Passed, frontend and backend, exit 0. |
| `npm.cmd run build` | Passed, frontend and backend, exit 0. |
| `npm.cmd test` | 1,358 passed: 396 frontend tests in 17 files and 962 backend tests in 17 files, exit 0. |
| `npm.cmd run test:browser --workspace frontend` | 13 passed, 0 failed in actual headless Chrome 156.0.8078.80, exit 0. Run separately from Vitest. |

The final verified T12 baseline was 1,242 tests: 280 frontend and 962 backend. Initial T13 added 78 frontend tests for a verified 1,320-test baseline. The D1–D3 changes add 35 more (19 tooltip, 4 selected-style, and 12 disclosure/state cases), giving **113** added frontend tests across T13. Backend tests remain unchanged. The original pre-T12 baseline was 1,164 tests. Existing T01–T12 tests remain present and passing; one navigation assertion was updated for the newly available page.

Coverage includes exact zero/cent/large tooltips; complete leap/non-leap February and month boundary series; invalid/unsafe inputs; four-label date selection; integer/compact Y-axis labels; ID-based category selection/color/keys; one/multiple categories; empty/all-zero states; tables and zero-day rows; view switching; category selection/clear/details; loading/error/retry; same-month and month-change races; and delayed responses after destruction. Frontend API tests mock fetch, and component tests use server rendering plus direct handler/prop checks. Page tests mock the data hook. These are not mounted browser, screen-reader, or viewport tests.

The first frontend run had two failed string assertions caused by React hydration comment markers. Switching the new presentation tests to static markup resolved them without changing the corresponding application behavior. The full suite subsequently passed. Builds/tests used approved execution outside the filesystem sandbox so esbuild could resolve the existing configuration.

## D1–D3 final audit fixes

- **D1:** Daily tooltips previously type-checked the date but called the strict formatter without validating the calendar value. `SpendingCharts.tsx` now requires a canonical ten-character date accepted by the existing `isValidDate` utility before formatting. Invalid dates and monetary values suppress tooltip content instead of creating replacement data. Existing valid leap-day, zero-cent, and largest-safe-integer formatting is unchanged.
- **D2:** The shared button base previously contained slate background/border utilities while selected controls appended conflicting emerald utilities. `AnalyticsControls.tsx` now separates structural/focus styles from mutually exclusive active/inactive color sets, including hover colors. Active view/category controls are underlined; category Selected text and all `aria-pressed` states remain. Tests assert exactly one background and border token per state and exercise callbacks. Actual computed browser styles remain NOT VERIFIED.
- **D3:** `DailySpendingTable` derives `amountCents > 0` rows in source order for its collapsed presentation. Its native button below the table switches between `Show all N days` and `Show spending days only`, exposes `aria-expanded`/`aria-controls`, and retains focus styling. N comes from the supplied array length. The entire source array stays in memory, charts receive it unchanged, and category data/financial totals are not modified. All-zero collapsed state renders `No spending recorded this month.` without a daily table; expansion shows every zero day. The general no-expenses banner remains in Chart View, avoiding a duplicate banner in Table View.
- Expansion belongs to the analytics reducer in a month-keyed owner that remains mounted while data loads or fails. A successful same-month refresh preserves expansion and Table View; a month change replaces the owner and resets expansion. Existing request-order and stale-data guards are unchanged.
- New disclosure tests invoke the real button callback through parent dispatch and the production reducer, then verify the resulting rows/text/attributes. They cover November 3/10/18 order, repeated expand/collapse, 28/29/30/31-day inputs, all-zero expansion, exact USD, and unchanged Recharts series. Page tests assert a stable React owner type/key during same-month refresh and a changed key when the month changes. These tests do not mount a browser or verify actual React DOM lifecycle, keyboard focus, viewport layout, or computed styles.
- A first D1–D3 test run failed collection because a new `%j` test title tried to serialize a BigInt fixture. The title now uses `%s`. The frontend and full root suites subsequently passed with the counts above. Strict TypeScript remains enabled, and both builds pass.

Files changed specifically for D1–D3:

- Modified `frontend/src/components/SpendingCharts.tsx`.
- Modified `frontend/src/components/AnalyticsControls.tsx`.
- Modified `frontend/src/components/AnalyticsTables.tsx`.
- Modified `frontend/src/pages/Analytics.tsx`.
- Modified `frontend/src/lib/analytics.ts`.
- Modified `frontend/src/components/AnalyticsComponents.test.tsx`.
- Modified `frontend/src/lib/analytics.test.ts`.
- Modified `frontend/src/pages/Analytics.test.tsx`.
- Created `frontend/src/components/DailySpendingTable.test.tsx`.
- Updated `docs/ARCHITECTURE.md` and this report.

## Current V1/V2 verification follow-up

This follow-up started from HEAD `521b261` (`feat T13: add analytics page with spending charts and summary`). It changes tests, test tooling, one npm script, and this report only. Production components, hooks, financial logic, backend, database, schema, and dependency versions are unchanged.

### V1: mounted lifecycle acceptance

`frontend/src/test/analyticsBrowserHarness.tsx` mounts the production Analytics page, MonthProvider, summary hook, loader, controls, tables, and Recharts in a real Chrome DOM. It is loaded only by `frontend/test/browser/analytics.html`, never by the application entry point or production build. Its synthetic summary fixtures are test data only. The page replaces fetch before mounting, accepts only GET summary requests, and never contacts a backend. A separate test-only button increments the real transaction revision; no transaction mutation is performed.

`frontend/test/browser/analytics.browser.mjs` starts a loopback-only Vite server and a new headless Chrome profile. It uses the Chrome DevTools Protocol through Node's built-in WebSocket without new dependencies. Run from the repository root:

```text
npm.cmd run test:browser --workspace frontend
```

Chrome defaults to the installed Windows path `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`; set `CHROME_PATH` for another installation. The browser suite is separate from `npm.cmd test` so the existing Node-only Vitest suite does not require Chrome.

Actual result: **13 passed, 0 failed**, Chrome **156.0.8078.80**:

1. Tab, Shift+Tab, Enter and Space operate view/disclosure buttons; expansion retains focus, exposes aria-expanded, and displays a computed focus ring.
2. Expanded Table View survives an actual mounted same-month loading to successful refresh transition with updated amounts.
3. Expanded Table View survives a failed refresh and successful Retry.
4. A real context revision refresh passes through loading and retains presentation state.
5. A held next-month response followed by returning to the original month resets the mounted view/disclosure; releasing the obsolete response does not replace current data.
6. Computed active/inactive view background and border differ, selected underline is present, and category keyboard selection/clear updates exact details.
7. At 360px, actual chart and control geometry fits the viewport, four X-axis labels do not overlap, large exact USD values render, and tooltip hover stays inside the viewport. Expanded table has 29 rows without horizontal page overflow.
8. The same checks pass at 768px.
9. The same checks pass at 1440px.
10. Actual mouse input on the donut selects the matching category and displays its exact category tooltip.
11. An all-zero month shows one concise message, no collapsed daily table, and all 29 zero days when expanded.
12. Emulated prefers-reduced-motion disables the loading pulse; all intercepted API requests are GET summary reads.
13. Chrome's actual accessibility tree exposes table semantics and the disclosure button's expanded state.

The viewport checks temporarily set body/root horizontal overflow to visible and inspect scroll width, control/chart/axis bounding boxes, and label spacing. They do not treat overflow-x-hidden as evidence. Screenshots at 360/768/1440px were captured and visually inspected, including the maximum-safe-cents tooltip. The page is scrolled to show the chart tooltip in these screenshots; they are not full-page screenshots.

Final-run screenshots and the isolated synthetic test profile are in:

```text
C:\Users\chauv\AppData\Local\Temp\expense-analytics-browser-uOBpVy
```

Earlier browser harness attempts exposed missing keyboard protocol text and Recharts 3's separate tick-label layer, plus an escaped CSS selector issue in the test runner. Correcting those test-driver assumptions produced the passing results above; no production defect was reproduced or application change needed.

### V2: test-helper typing

Removed both caller-chosen `props<T>` assertions from AnalyticsComponents.test.tsx and DailySpendingTable.test.tsx. Shared `elementProps(node, expectedType)` now infers ComponentProps from the expected native/component type and verifies element type identity before returning props. Children extraction checks element validity. Event-independent callback probes explicitly invoke handlers without manufacturing a typed browser event; actual native event behavior is covered by the Chrome suite.

Three new Vitest cases verify inferred component prop types/reference identity, rejection of an unexpected element type, and rejection of non-elements. Existing chart, tooltip, selection, and disclosure assertions remain and pass.

### Final commands and counts

| Command | Result |
| --- | --- |
| npm.cmd run typecheck | Exit 0, frontend and backend. |
| npm.cmd run build | Exit 0, frontend and backend. |
| npm.cmd test | Exit 0: 396 frontend tests in 17 files; 962 backend tests in 17 files; **1,358 total**, zero failures. |
| npm.cmd run test:browser --workspace frontend | Exit 0: **13 browser cases**, zero failures. |
| git diff --check | Exit 0; line-ending normalization warning only. |

Vitest is up **3** from the previous 1,355 baseline. The separately executed browser suite adds **13** cases, giving **1,371 passing cases across both commands**. The original pre-T12 baseline was 1,164, so the current Vitest total is up 194. Backend remains 962. No existing tests were removed.

### Files changed in this follow-up

Modified:

- frontend/package.json: adds test:browser only; dependency declarations and lockfile unchanged.
- frontend/src/components/AnalyticsComponents.test.tsx: typed element extraction.
- frontend/src/components/DailySpendingTable.test.tsx: typed element extraction.
- docs/T13_VERIFICATION.md: current evidence and limitations.

Created:

- frontend/src/test/reactElements.ts
- frontend/src/test/reactElements.test.tsx
- frontend/src/test/analyticsBrowserHarness.tsx
- frontend/test/browser/analytics.html
- frontend/test/browser/analytics.browser.mjs

### Remaining limitations and handoff

V1 and V2 are addressed. The previously missing mounted, keyboard, computed-style, tooltip, and viewport evidence is now available from actual Chrome with isolated synthetic fixtures. This is real browser execution, not server rendering, but it is not a walkthrough against development records. No create/edit/delete operation was performed against the development API. Actual summary/API behavior remains covered by existing automated client/backend tests.

Screen-reader speech/announcements (for example NVDA), other browser engines, the VS Code embedded preview, and a full manual assistive-technology review remain unverified. Accessibility-tree checks and visible focus evidence do not establish screen-reader speech. Pointer coverage selects one donut sector; extremely small sectors have equivalent accessible category buttons. Transaction drill-down and URL month persistence remain optional enhancements.

Git status at this handoff: **4 modified tracked files and 5 untracked new files, nothing staged**. No backend, schema, dependency, development-data, authentication, deployment, or T14 changes. No commit or push was performed. The T13 follow-up is ready for human review; the remaining manual accessibility limitations are stated explicitly rather than treated as completed checks.
