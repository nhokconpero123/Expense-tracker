# Product Requirements Document

## 1. Problem statement
People who track spending manually lack a reliable, quick view of where money goes and how much of a monthly budget remains. This application provides a single place to record transactions and understand personal cash flow.

## 2. Target users
- An individual managing everyday income and expenses on a personal computer or phone.
- A portfolio reviewer evaluating a coherent product, accessible UI, documented architecture, and tested business rules.

## 3. Goals
- Make entering and finding transactions straightforward.
- Show accurate monthly income, expenses, balance, and category spending.
- Help users compare actual expenses with monthly category budgets.
- Preserve records across page refreshes and server restarts.
- Deliver a focused, demonstrable MVP with repeatable local setup and tests.

## 4. MVP scope and business rules
- One user and one local SQLite database; no user accounts. Both frontend and API listen only on loopback. Mobile layouts are evaluated through local browser viewport emulation; access from another device over LAN is outside MVP.
- USD only. Amounts are positive integer cents; transaction type determines income or expense. Zero, negative, fractional-cent, and unsafe integer amounts are rejected.
- An amount must be between 1 and 100,000,000 cents ($1,000,000.00). This same limit applies to budgets.
- A transaction has type, amount, category, transaction date, and optional note (maximum 500 characters after trimming; NUL/U+0000 characters are rejected by both request validation and storage).
- Transaction dates are valid calendar dates in `YYYY-MM-DD`, years 1900–9999. Future dates are allowed and count in their assigned month; this is a record ledger, not a forecast engine.
- Months use `YYYY-MM`. The UI defaults to the user's current local calendar month. The server receives an explicit month and never infers it from UTC timestamps.
- Budget and reporting months use the same year range as transaction dates: 1900–9999.
- Each transaction belongs to exactly one category of the same type. Categories are a fixed seeded catalog in v1: Salary, Freelance, Other Income; Food, Housing, Transport, Utilities, Entertainment, Health, Shopping, Other Expense.
- Budgets are per expense category per calendar month. At most one budget exists for each category/month pair; income categories cannot have budgets. No overall monthly budget or rollover.
- Monthly balance = income minus expenses in the selected month; it is not an account balance or opening balance.
- Budget spent = all expenses in that category/month. Remaining = limit minus spent and may be negative. Exactly at the limit is “At limit”; above it is “Over budget.” An unbudgeted category is “No budget,” not a zero limit.
- Search and filters affect the transaction list only. Dashboard, budget totals, and charts use every transaction in the selected month, regardless of list filters or pagination.
- Deleting a transaction requires UI confirmation; deleting a budget removes the limit only and preserves transactions. Category deletion is unavailable.

## 5. Functional requirements
| ID | Requirement |
| --- | --- |
| FR-01 | Display monthly total income, expenses, and balance; changing month refreshes all monthly views. |
| FR-02 | Create, view, edit, and delete transactions, with visible validation and mutation feedback. |
| FR-03 | Offer seeded income/expense categories and restrict choices to the selected type. |
| FR-04 | Search notes by literal substring with ASCII-only case-insensitive matching; Unicode characters match literally with no Unicode case folding or normalization. Treat `%`, `_`, and backslash literally. Combine type, category, and inclusive date filters using AND. Provide clear/reset controls and paginated results. |
| FR-05 | Create, update, view, and delete category budgets for a month, showing spent, remaining, progress, and status. Over-budget entries remain allowed. |
| FR-06 | Show expense distribution by category and daily expense totals for the selected month using Recharts; provide equivalent readable values. |
| FR-07 | Support desktop and mobile layouts, keyboard use, and loading, empty, success, and recoverable error states. |
| FR-08 | Persist every successful mutation in SQLite; refresh dependent views after mutations so summaries reflect current data. |

## 6. Non-functional requirements
- Correctness: backend validates bodies, path parameters, and query parameters; database constraints reinforce invariants. All monetary arithmetic and aggregates remain safe integers; reject writes that would make supported aggregates unsafe.
- Reliability: atomic writes, foreign keys enabled, separate development/test databases, versioned migrations, and repeatable non-destructive seed data.
- Accessibility: labeled controls, visible focus, keyboard-accessible dialogs, readable contrast, and non-color-only budget statuses. Charts have textual alternatives.
- Responsiveness: no horizontal page scrolling at widths 360, 768, and 1440 pixels; tables may use a contained scroll region.
- Performance: aspire to p95 under 300 ms for warm local list and monthly summary requests with 10,000 transactions over 30 sequential requests each. Exclude setup and server startup; record actual measurements, machine/runtime details, dataset distribution, request parameters, and limitations. Missing 300 ms alone does not block the core MVP; correctness failures and unusable behavior still require resolution.
- Maintainability: strict TypeScript on both frontend and Node.js + Express backend, small components, isolated validation/business logic, clear API contracts, and automated tests for financial calculations and API errors.
- Operational boundary: frontend and backend must bind only to localhost/loopback in MVP; no public hosting, tunnels, or LAN exposure. This unauthenticated MVP is for a trusted local environment. Never log notes or full request bodies by default.

## 7. Out of scope
Authentication, multiple users, bank connections, account synchronization, multiple currencies, currency conversion, transfers/accounts, recurring transactions, receipt uploads, imports/exports, notifications, custom category management, debt/investment tracking, budget rollover, offline synchronization, and production deployment are outside the MVP. Deployment is considered separately in section 9 and is not an MVP acceptance requirement.

## 8. Success criteria
- Every acceptance criterion in USER_STORIES.md is demonstrated or tested, with exact results recorded.
- A reviewer can follow setup instructions to initialize a fresh database, run the application and tests, and inspect a representative demo dataset without external services.
- A user can create a transaction, find it, edit it, delete it, and observe consistent monthly totals and budgets after each action.
- Persistence, integer-cent calculations, combined filters, month boundaries, and backend rejection paths have passing automated coverage.
- Responsive and keyboard checks pass at the specified widths; actual performance measurements and limitations are recorded against the aspirational target above. Exceeding 300 ms alone does not fail release.
- No known critical defects remain. These are release criteria, not claims that implementation already exists.

## 9. Separate post-MVP deployment phase
This phase starts only after MVP review and explicit approval of one security model. It does not authorize deployment now or expand v1 acceptance criteria.

- Option A — Public read-only portfolio demo: synthetic data only, isolated from personal/development databases. Public clients may read demo data; every write operation is denied server-side to anonymous visitors. Any retained maintenance/reset path requires authenticated authorization and must not be callable by visitors. Hiding UI buttons is insufficient. Prefer disabling public HTTP writes entirely.
- Option B — Authenticated application: proper authentication and server-side authorization with per-user transaction/budget ownership, scoped queries, and cross-user access tests. Global seeded categories may remain shared; personal records and aggregates must be isolated. Requires a separately reviewed schema/API migration and session/CSRF policy where applicable.
- Both options require persistent database storage outside ephemeral application files, explicit environment configuration, HTTPS, secure secret handling, backup/restore procedure, and verification after restart/redeploy. Do not publish the existing unauthenticated writable API.
- SQLite hosting requires a persistent local volume and a single application instance; hosts without that capability require an approved storage/architecture change.
- Hosting provider, cost, security option, and detailed operational settings remain open. See ARCHITECTURE.md section 7 and IMPLEMENTATION_PLAN.md P01–P03 for gates and verification.
