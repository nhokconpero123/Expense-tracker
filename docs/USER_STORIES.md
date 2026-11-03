# User Stories and Acceptance Criteria

PRD.md defines shared business rules. Currency examples below are displayed in USD; API values use cents. US-01–US-10 are required for the localhost-only v1. Post-MVP deployment criteria below are separate and do not block the local MVP. ARCHITECTURE.md section 3 is the authoritative endpoint contract.

## US-01 — See monthly cash flow (FR-01)
As a user, I want monthly totals so I can understand my cash flow.
- Given income of 200000 cents and expenses of 7550 cents in the selected month, show $2,000.00 income, $75.50 expenses, and $1,924.50 balance.
- Transactions outside that month are excluded, including adjacent month boundary dates.
- Changing month updates dashboard, budgets, and charts; empty months show zero totals and helpful empty states.
- Negative balances display correctly. Totals are independent of list search and page size.

## US-02 — Record a transaction (FR-02, FR-03, FR-08)
As a user, I want to record income or an expense so my ledger stays complete.
- A valid type, matching category, date, and amount creates one record and updates affected views without a manual reload.
- Entering `12.34` stores 1234 cents exactly. UI currency parsing rejects more than two decimal places; it does not silently round.
- Missing required fields, zero/negative/over-limit amounts, fractional cents, malformed dates, impossible dates, and mismatched or nonexistent categories are rejected by the backend without a write.
- Notes are optional, trimmed, and limited to 500 characters. Unknown body fields are rejected.
- Repeated clicks while a save is pending are disabled. Failed saves retain entered values and allow retry.
- Data survives a page refresh and server restart.

## US-03 — Browse and inspect transactions (FR-02)
As a user, I want a readable ledger so I can check individual records.
- Each row shows date, type, category, formatted amount, note, and edit/delete actions; blank notes have a clear placeholder.
- Default ordering is transaction date descending, then ID descending, consistently across pages.
- Default page size is 20; the total count and page navigation are available. An empty result has a clear message.
- Loading and failed requests have distinct states and a retry action.

## US-04 — Correct a transaction (FR-02, FR-08)
As a user, I want to edit a record so mistakes do not distort totals.
- Editing opens existing values. A valid save replaces the editable fields while preserving its ID and creation timestamp.
- Changing type requires a category of the new type; changing month or category updates both old and new aggregates.
- The same validation applies as on create. Failed validation leaves the stored record unchanged.
- Canceling makes no change. An unavailable record produces a useful not-found message.

## US-05 — Remove a transaction (FR-02, FR-08)
As a user, I want to delete an incorrect entry deliberately.
- Delete asks for confirmation identifying the record; cancel leaves it intact.
- Confirming removes it and refreshes list totals, dashboard, charts, and any affected budget.
- A failed deletion shows an error and does not falsely remove the row. Missing IDs return a not-found response.
- If the final row of a page is removed, navigation returns to a valid page.

## US-06 — Find transactions (FR-04)
As a user, I want combined search and filters so I can locate records.
- A note search is ASCII case-insensitive and literal: `%`, `_`, and backslash are ordinary characters. Unicode characters match literally; full Unicode case-insensitivity and normalization are outside MVP. For example, `LUNCH` matches `lunch`, while `CAFÉ` does not match `Café` because É and é differ.
- Type, category, start date, end date, and search combine using AND; date endpoints are inclusive. The list is all-time until date filters are supplied.
- An expense type with an income category returns no matches; an invalid category ID or start date after end date returns validation errors.
- Applying/changing filters resets the page to 1. Clear resets filters, search, and pagination.
- No matches show an empty state; filters do not change dashboard, budgets, or charts.

## US-07 — Plan monthly category budgets (FR-05)
As a user, I want category limits so I can compare spending against my plan.
- Saving a valid expense category/month/limit creates or replaces its single budget; duplicate entries cannot exist.
- For a 10000-cent limit and 7500-cent spending, show $100.00 limit, $75.00 spent, $25.00 remaining, and 75% utilization.
- At 10000 cents spent show “At limit”; at 12500 show “Over budget,” -$25.00 remaining, and 125% utilization. A visual progress bar may cap at 100%, while text preserves the actual percentage.
- Expenses without budgets show “No budget.” No spending with a budget shows zero utilization.
- Invalid month, income category, zero, negative, fractional-cent, and over-limit budgets are rejected without mutation.
- Confirmed budget deletion preserves every transaction; cancel preserves the budget. Months remain independent with no rollover.

## US-08 — Understand spending patterns (FR-06)
As a user, I want charts so I can identify major categories and daily spending.
- Category values equal monthly expense totals, excluding income and zero-spend categories.
- Daily values include each calendar day of the month, filling missing days with zero, including leap days when appropriate.
- Chart sums equal the dashboard expense total. No spending shows an explicit empty state.
- Textual values remain available without relying on chart hover, sight, or color.

## US-09 — Use the application on different devices (FR-07)
As a user, I want accessible layouts and feedback so I can manage records on desktop and mobile.
- At 360, 768, and 1440 pixels, primary actions and content remain usable without horizontal page overflow.
- Forms have labels and associated errors; all actions work with keyboard, focus is visible, and dialogs restore focus when closed.
- Budget states include text; charts include readable data alternatives.
- Refresh failures are visible, do not display stale data as current, and offer retry. A successful write followed by refresh failure is reported as saved with refresh failure, avoiding a duplicate resubmission prompt.

## US-10 — Trust stored data (FR-08)
As a user, I want durable and accurate records so I can rely on the ledger.
- Backend validation rejects malformed direct API calls even when frontend checks are bypassed.
- SQLite constraints prevent invalid relationships and duplicate category/month budgets.
- Invalid or failed atomic mutations do not leave partial changes; responses do not expose SQL or stack traces.
- Automated tests use isolated databases and never modify the development database.
- Frontend and backend listeners are loopback-only; responsive testing uses local viewport emulation, with no public tunnel or LAN exposure.

## Cross-document traceability
All endpoint paths below have the `/api` prefix. No additional chart or budget-create endpoint is required.

| Stories | Endpoint contract | Implementation evidence |
| --- | --- | --- |
| US-01, US-08 | GET /summary?month=YYYY-MM | T07, T09, T13 |
| US-02, US-03 | GET /categories, POST /transactions, GET /transactions, GET /transactions/:id | T04, T05, T10 |
| US-04, US-05 | PUT /transactions/:id, DELETE /transactions/:id | T06, T11 |
| US-06 | GET /transactions with documented AND filters | T05, T10 |
| US-07 | GET /budgets?month=YYYY-MM, PUT and DELETE /budgets/:categoryId/:month | T08, T12 |
| US-09, US-10 | Shared UI/API contracts; GET /health for readiness | T01–T14, including T02a–T02d |

## Verification policy
Record actual 10,000-transaction benchmark results and limitations. The p95 <300 ms goal is aspirational; exceeding it alone does not invalidate these stories or block core MVP completion.

## Post-MVP deployment acceptance (conditional, not v1 stories)
- Before public access, approve either synthetic read-only demo mode with server-enforced protected writes, or authentication with per-user data isolation. No publicly writable unauthenticated variant is acceptable.
- For demo mode, direct anonymous POST/PUT/DELETE requests cannot change data; any enabled maintenance operation requires authorization, and only synthetic records are publicly readable.
- For authenticated mode, anonymous requests cannot access personal data, and user A cannot read, change, or aggregate user B's transactions/budgets by altering IDs, filters, or paths.
- Verify HTTPS, environment configuration, persistent database storage across restart/redeploy, backup restoration, and security checks on the deployed URL before publication approval. See P01–P03 in IMPLEMENTATION_PLAN.md.
