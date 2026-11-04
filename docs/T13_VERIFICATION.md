# T13 — Analytics and Charts

Implemented November 3, 2026. Ready for code review; live-browser acceptance remains unverified.

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
| `npm.cmd test` | 1,355 passed: 393 frontend tests in 16 files and 962 backend tests in 17 files, exit 0. |

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

## Responsive and keyboard verification

| Check | Status |
| --- | --- |
| Explicit chart height, shrinking containers, 1-column layout below 1280px and 2 columns above | Reviewed in source/configuration tests. |
| Sparse daily axis labels, compact USD ticks, bounded tooltip configuration | Automated configuration/formatter checks passed. |
| Native buttons, pressed states, explicit selection text, live details, table semantics, focus styles | Source, server-rendered markup, reducer, and handler checks passed. |
| Reduced motion | All Recharts animation disabled; skeleton uses motion-safe CSS. |
| Actual 360px / 768px / 1440px layout and absence of clipping/overflow | **Not verified in a live browser.** |
| Actual tooltip positioning, donut pointer selection, Recharts keyboard behavior | **Not verified in a live browser.** |
| Actual Tab/Enter/Space operation, focus visibility, screen-reader announcements | **Not verified in a live browser.** |

Browser inventory reported `The browser access host is unavailable`. No live viewport, screenshot, or keyboard check was completed. `overflow-x-hidden` on the existing shell/body is not treated as responsive evidence.

## Remaining review checks and limitations

1. On localhost at 360, 768, and 1440px, verify chart sizing, all controls, table wrapping, largest monetary labels, and tooltip placement. Check pointer interaction with one and multiple categories.
2. Use Tab/Enter/Space to switch views, select categories, and clear selection. Verify the same exact details are available without using the SVG or hover, and check screen-reader announcements and reduced-motion mode.
3. Switch rapidly between months, including A → B → A. Navigate between Dashboard/Budgets/Analytics and verify the month persists. Create/edit/delete an expense through the existing UI and verify analytics after navigation.
4. Verify loading and GET-failure/retry behavior in the browser. Data is intentionally hidden while refreshing or after failure; Table View and expansion must survive same-month refresh/retry and reset on a month change.
5. Verify active/inactive button computed colors, underline/Selected feedback, and daily-table expansion/collapse using Tab/Enter/Space. For all-zero months, inspect the complete series through the toggle without duplicate empty-state banners.

Transaction drill-down is an optional enhancement; T13 provides linked category highlighting, exact selected details, and the category table first. URL month persistence is also deferred. No T14, deployment, authentication, external exposure, backend/schema change, dependency change, or development-data modification was performed. No commit or push was made.

Git status at handoff: **9 modified tracked files and 11 untracked new files**, listed above, with nothing staged. Backend and dependency manifests/lockfile have no diff. The repository was clean at the start of T13; the D1–D3 work began with the initial T13 changes already present. `git diff --check` passed. Browser inventory was checked again for D1–D3 and still reported its host unavailable; all live 360/768/1440px and keyboard/computed-style checks remain NOT VERIFIED.
