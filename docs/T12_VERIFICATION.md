# T12 — Monthly Budget Management UI

Implemented November 3, 2026. Ready for code review; browser verification remains pending as described below.

## Implementation

- Activated Budgets in desktop/mobile navigation and hash navigation, including direct `#budgets` entry.
- Reused the shared month selector and MonthContext. Existing transaction create/edit/delete notifications invalidate monthly budget spending through `summaryRevision` without changing those transaction flows.
- Used the actual T08 contract: GET `/api/budgets?month=YYYY-MM` returns `{data:{month,items}}` with all expense categories. Missing budgets have null amount/remaining/utilization. PUT `/api/budgets/:categoryId/:month` sends only `{amountCents}` and returns `{data:BudgetItem}` with HTTP 200. DELETE uses the same path and returns empty HTTP 204; missing budgets return 404. No backend contracts or schema changed.
- Displayed configured amount, spending, signed remaining amount, supplied utilization, and explicit No budget / Under budget / At limit / Over budget labels. Progress bars cap at 100%; text and accessible value text retain uncapped utilization.
- Added set/edit and confirmed removal dialogs. Input uses the existing exact decimal parser and the existing $0.01–$1,000,000.00 limit. Failed writes retain values and API errors, while pending state synchronously blocks duplicate submissions and cancellation. Cancel does not send a mutation.
- Separated successful writes from subsequent read failures: the editor closes after success, a saved/removed notice persists, stale data is cleared, and retry performs GET only. Removing a budget preserves spending returned by the backend.
- Used request IDs plus AbortController to ignore superseded responses, including fetch implementations that ignore abort signals. Month/revision identity is checked during render, before the next loading effect. Late writes from an obsolete month cannot update the selected month.
- Corrected shared USD formatting to preserve cents at safe-integer aggregate boundaries. Ordinary Dashboard and Transactions currency output is unchanged.
- Retained the current slate/emerald dark theme and responsive card layout. UI/UX Pro Max was used as design guidance only; no skill scripts, packages, or dependencies were installed.

## Files

Created:

- `frontend/src/lib/budgetApi.ts` — typed budget HTTP client and response validation.
- `frontend/src/lib/budgetStore.ts` — actual state controller used by the UI.
- `frontend/src/hooks/useBudgets.ts` — React subscription and shared month/revision integration.
- `frontend/src/components/BudgetCard.tsx` — category amounts, progress, status, and actions.
- `frontend/src/components/BudgetDialog.tsx` — accessible native modal editor/removal confirmation.
- `frontend/src/pages/Budgets.tsx` — page, loading, empty, error/retry, and mutation feedback.
- `frontend/src/lib/budgetApi.test.ts` — HTTP method/path/payload/error/response coverage.
- `frontend/src/lib/budgetStore.test.ts` — real controller validation, mutation, cancellation, duplicate prevention, revision, race, and refresh-failure tests.
- `frontend/src/components/BudgetComponents.test.tsx` — server-rendered presentation and semantics tests.
- `frontend/src/components/BudgetDialog.test.tsx` — dialog dismissal-handler tests with mocked lifecycle hooks; not browser interaction tests.
- `docs/T12_VERIFICATION.md` — this report.

Modified:

- `.gitignore` — made a narrow exception for this verification report; other untracked documentation remains ignored.
- `frontend/src/App.tsx` — Budgets route and hash handling.
- `frontend/src/components/Navbar.tsx` — enabled Budgets navigation.
- `frontend/src/lib/money.ts` — exact formatting for large safe-integer cents.
- `frontend/src/lib/money.test.ts` — positive/negative safe-integer boundary cases.
- `docs/ARCHITECTURE.md` — current frontend status and budget state flow.

## Automated verification

Commands run from the repository root:

| Command | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed for frontend and backend, exit 0. |
| `npm.cmd run build` | Passed for frontend and backend, exit 0. |
| `npm.cmd test` | 1,242 tests passed: 280 frontend tests in 12 files; 962 backend tests in 17 files. Exit 0. |

The reported baseline was 1,164 tests (202 frontend, 962 backend). The initial T12 implementation added 59 frontend tests, the notice recovery fix added 5, and the Escape fix adds 14, for a total increase of 78. Backend source and tests were preserved. Existing backend integration tests cover real budget HTTP upsert/deletion, transaction mutation spending updates, and preservation of transactions after removing a limit. New frontend HTTP tests mock fetch; state tests exercise the production BudgetStore rather than a separate test-only coordinator. Presentation tests use server rendering; dismissal-handler tests mock lifecycle hooks. Neither establishes browser interaction correctness.

### Refresh notice recovery fix

The audit confirmed that a successful PUT/DELETE followed by a failed GET copied refresh-failure text into the mutation-success notice. A successful retry cleared the GET error but left that combined notice unchanged.

`BudgetStore.submit()` now preserves the mutation-success notice without embedding GET errors in it. The existing error state and Budgets page alert remain responsible for refresh failures and GET-only retry. A successful retry therefore leaves useful saved/removed feedback without a contradictory warning; a failed retry retains its current error. Request IDs and month/session guards are unchanged, and the post-refresh mutation completion no longer rewrites notices belonging to later activity. No UI, API, or schema changes were needed.

The existing two save/remove recovery tests now assert the exact success notice, current data, cleared error, and one mutation after a successful retry. Five additional cases cover failed retries for save and remove, late retry success after a newer GET failure, late retry success after a newer mutation refresh failure, and late retry success after switching to a month whose GET failed. The focused suite reproduced the defect before the fix (6 failed, 28 passed) and passed afterward (34 passed). All three required root commands then passed with 266 frontend and 962 backend tests.

Files changed for this fix only: `frontend/src/lib/budgetStore.ts`, `frontend/src/lib/budgetStore.test.ts`, and `docs/T12_VERIFICATION.md`. Existing browser verification gaps remain unchanged.

### Escape dismissal fix

The user confirmed the failure occurs in the VS Code embedded preview while the Cancel button works. All three dialog modes used the same native `onCancel` handler, which prevents browser default closure and asks the store to cancel. There was no dialog-local Escape key handler or native-close synchronization. The store correctly dismisses idle editors, and its pending guard is intentional. The opening effect runs on mount/mode changes, not on each render; inspection found no ordinary idle-dismissal reopening loop. The installed React DOM handles native cancel events, so non-bubbling alone is not evidence of a React event bug.

The identified application gap is reliance exclusively on the embedded browser delivering a native cancel event for Escape. The reported working Cancel button and inspected handlers narrow the failure to the Escape/native-cancel path, but the exact host-side event interception or browser behavior could not be instrumented: browser access reported its host unavailable. This diagnosis is an inference from source and the user report, not a live event trace.

`BudgetDialog` now handles unconsumed Escape locally, prevents its default action/propagation, and calls the same `store.cancel()` used by Cancel and native cancel. It never submits a form or calls a mutation API. While a write is pending, Escape/native cancel remain prevented and Cancel stays disabled; the store refuses dismissal. An unexpected native close synchronizes idle editor state; if still pending, the connected dialog is restored to modal state. Queued close events are ignored when the dialog is already reopened or detached, preventing Strict Mode cleanup events from canceling a newer open modal. Existing trigger/heading focus restoration and effect cleanup are preserved. No global key listener, dependencies, store/hook/page changes, backend changes, or data resets were added.

Fourteen new Node tests exercise actual component handlers against the production store: Escape for Set/Edit/Remove, no mutation or editor reopening after dismissal, native cancel for all modes, pending Escape/native cancel and dismissal after a failed write, unrelated/already-consumed keys, external native closure, queued cleanup closure, and native modal restoration during pending writes. They mock React lifecycle hooks and do not exercise browser key delivery, `showModal()` focus containment, Strict Mode effect timing, or real focus restoration. The repository has no installed browser provider, Playwright, jsdom, or happy-dom; no browser dependency was installed. The focused suite passed 14 tests; all three root commands passed with the current counts above.

Files changed for this fix only: `frontend/src/components/BudgetDialog.tsx`, `frontend/src/components/BudgetDialog.test.tsx`, and `docs/T12_VERIFICATION.md`.

Required live verification: in the VS Code preview and a standalone browser, open Set/Edit/Remove, press Escape, confirm no write request, no immediate reopening, and focus restored to the opener. Verify Tab/Shift+Tab containment, Cancel/Escape equivalence, and blocked dismissal while a delayed write is pending. Browser verification remains necessary before declaring the confirmed browser defect resolved end to end.

The first sandboxed frontend test attempt could not load the Vitest configuration because esbuild was denied a parent-directory read. The tests and builds subsequently ran with approved execution outside that filesystem sandbox; no dependency or configuration workaround was added.

## Responsive and accessibility status

Implemented and inspected in source/server-rendered tests:

- One card column below 768px, two at 768px, and three at 1280px and above; wrapping controls and bounded dialog width/height.
- Text labels for each status, readable spending for unbudgeted categories, capped progress with uncapped accessible value text, labeled fields with associated errors, native buttons, visible focus styles, and disabled pending actions.
- Native `dialog.showModal()` for modal focus containment and background inertness; Escape/cancel handlers and restoration to the trigger or page heading. Removal initially focuses Cancel; save initially focuses the amount field; validation errors focus the field or error message.

Not verified in a browser:

- Actual rendering and page overflow at 360px, 768px, and 1440px.
- Keyboard Tab/Shift+Tab containment, Escape, focus restoration, screen-reader announcements, and measured contrast.
- Full interactive navigation/transaction-to-budget walkthrough and refresh/restart persistence through the UI.

Browser access reported that its host was unavailable. Native Chrome Computer Use was then attempted, but stopped because it could not determine the current browser URL with enough confidence to enforce policy. No further UI automation was performed. A temporary loopback-only API preview used an isolated in-memory SQLite database, never development storage; its processes were stopped and its temporary source removed.

## Remaining review checks

1. At 360/768/1440px, confirm all categories, amounts, and actions are usable without page overflow, including large spending amounts and over-100% text.
2. Set/edit/remove a budget; cancel removal; use Tab/Shift+Tab/Escape; verify focus after close and after refresh.
3. Create/edit/delete an expense in Transactions, return to Budgets, and confirm spending; change month/category and verify each affected month.
4. Simulate write failure and successful write followed by GET failure. Confirm values remain only after failed writes and retry never repeats a successful mutation.
5. With an explicitly disposable local test database, verify persistence across reload/restart. Do not reset development data.

## Scope and limitations

T12 implementation and automated checks are complete; manual browser acceptance remains unverified. No T13 charts, T14 release work, authentication, deployment, external exposure, dependency installation, backend contract/schema change, development-data mutation, commit, or push was performed. Changes remain uncommitted for human review.

Final Git status: 6 modified tracked files and 11 untracked new files, all listed above. No files staged. `git diff --check` passed. The preview listeners were stopped after the original verification attempts; no additional preview server was started for the Escape fix.
