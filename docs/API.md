# Expense Tracker API

Local base URL: `http://127.0.0.1:3001/api`; Vite development (port 5173) and build preview (port 4173) proxy `/api` to the local backend. Run the API separately when using preview. These unauthenticated APIs are localhost-only. JSON objects use camelCase, monetary values use integer USD cents, and timestamps are UTC. Examples below assume a freshly seeded database; IDs/timestamps are illustrative, not fixed contract values. Discover category IDs through GET /categories.

## GET /categories

Optional `type=income` or `type=expense`; no other query fields are accepted. Return 200 `{data: Category[]}`, sorted by type and then name. Duplicate/array/unknown query parameters and invalid types return safe 400 validation errors.

```http
GET /api/categories?type=income
```

```json
{"data":[{"id":2,"name":"Freelance","type":"income"},{"id":3,"name":"Other Income","type":"income"},{"id":1,"name":"Salary","type":"income"}]}
```

Without a filter, all 11 seeded categories are returned on a fresh database (expense categories precede income categories).

## POST /transactions

Required: type, amountCents, categoryId, date. Optional note is trimmed; omission becomes empty. The existing request validator rejects unknown fields, invalid types/amounts/dates, NUL notes, and notes longer than 500 UTF-16 code units after trimming. No query parameters are accepted.

```http
POST /api/transactions
Content-Type: application/json

{"type":"expense","amountCents":1234,"categoryId":4,"date":"2026-11-03","note":"  Lunch  "}
```

```http
HTTP/1.1 201 Created
Location: /api/transactions/1
Content-Type: application/json; charset=utf-8
```

```json
{"data":{"id":1,"type":"expense","amountCents":1234,"categoryId":4,"categoryName":"Food","date":"2026-11-03","note":"Lunch","createdAt":"2026-11-03T18:00:00.000Z","updatedAt":"2026-11-03T18:00:00.000Z"}}
```

Category must exist and match type; both failures return 400 with categoryId field context. The service checks all-time income and expense sums independently as BigInts before committing. If either exceeds Number.MAX_SAFE_INTEGER, return 400 with amountCents field context and roll back. The existing safe validation envelope intentionally does not distinguish aggregate rejection from other amount errors. Any database or readback failure returns a safe 500 and rolls back. Location is emitted only after a committed creation.

## GET /transactions/:id

Require a canonical positive safe-integer string ID; leading zeros, signs, decimals, exponents, whitespace, invalid percent encoding, and unsafe numbers are rejected with 400. No query parameters are accepted. A valid missing ID returns 404.

```http
GET /api/transactions/1
```

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
```

```json
{"data":{"id":1,"type":"expense","amountCents":1234,"categoryId":4,"categoryName":"Food","date":"2026-11-03","note":"Lunch","createdAt":"2026-11-03T18:00:00.000Z","updatedAt":"2026-11-03T18:00:00.000Z"}}
```

## GET /transactions

Optional query parameters: `type`, `categoryId`, `startDate`, `endDate`, `q`, `page`, `pageSize`. All filters combine with AND; start/end dates are inclusive and may be supplied independently. Defaults: page=1, pageSize=20; pageSize must be 1..100, page a positive safe integer. Numeric query strings follow canonical positive digits without signs, whitespace, leading zeros, decimal points or exponents. Unknown fields, duplicate/array values, invalid dates, and reversed ranges return 400. A nonexistent category returns 400; an existing category incompatible with type yields no matches.

Search trims q (maximum 100 UTF-16 code units); blank means absent. Matching is ASCII case-insensitive and literal for Unicode, with no Unicode case folding or normalization. `%`, `_`, and backslash are literal search characters, not wildcards. For example, `LUNCH` matches `lunch`, but `CAFÉ` does not match `Café`. NUL-containing searches return no matches because notes cannot contain NUL.

Rows sort by date descending, then ID descending. Matching COUNT and SQL LIMIT/OFFSET reads share a database snapshot. Requesting a page beyond the last page returns empty data with matching metadata; zero matches have totalPages=0. Responses have the same transaction object shape as detail.

```http
GET /api/transactions?type=expense&startDate=2026-11-01&endDate=2026-11-30&q=LUNCH&page=1&pageSize=20
```

```json
{"data":[{"id":1,"type":"expense","amountCents":1234,"categoryId":4,"categoryName":"Food","date":"2026-11-03","note":"Lunch","createdAt":"2026-11-03T18:00:00.000Z","updatedAt":"2026-11-03T18:00:00.000Z"}],"meta":{"page":1,"pageSize":20,"total":1,"totalPages":1}}
```

The same filters with page=2 return:

```json
{"data":[],"meta":{"page":2,"pageSize":20,"total":1,"totalPages":1}}
```

A search with no matches returns:

```json
{"data":[],"meta":{"page":1,"pageSize":20,"total":0,"totalPages":0}}
```

## PUT /transactions/:id

Replace all editable fields. ID syntax and unknown query rejection match GET detail. Body validation is identical to POST: required type, amountCents, categoryId, and date; omitted note becomes empty. ID, createdAt, and updatedAt cannot be supplied in the body. The category must exist and match type. Changes to amount/type/category/month are supported. ID and createdAt are preserved; updatedAt advances monotonically in UTC, at least 1 ms after the previous value. Old/new monthly and all-time totals are checked as BigInts before commit. Invalid requests/categories/unsafe totals return 400, valid missing IDs 404, and unexpected failures safe 500 with rollback.

```http
PUT /api/transactions/1
Content-Type: application/json

{"type":"income","amountCents":29,"categoryId":1,"date":"2027-02-28"}
```

Illustrative 200 response (note was omitted and is cleared):

```json
{"data":{"id":1,"type":"income","amountCents":29,"categoryId":1,"categoryName":"Salary","date":"2027-02-28","note":"","createdAt":"2026-11-03T18:00:00.000Z","updatedAt":"2026-11-03T18:01:00.000Z"}}
```

## DELETE /transactions/:id

Strictly validate the ID; no query fields are accepted. Successful deletion returns 204 with no response body. Missing or repeated deletion returns 404. Database/ignored-deletion failures return safe 500 and roll back. It never deletes other transactions or budget records.

```http
DELETE /api/transactions/1
```

```http
HTTP/1.1 204 No Content
```

Subsequent GET/DELETE /api/transactions/1 returns:

```json
{"error":{"code":"NOT_FOUND","message":"Resource not found."}}
```

## GET /summary?month=YYYY-MM

Require one explicit month in 1900-01..9999-12 using exact YYYY-MM syntax. Missing/blank/invalid/repeated/array month values and unknown query parameters return safe 400. Transaction-list filters and pagination are not accepted here. Reporting uses transaction dates inclusively from first through last day, independently of metadata timestamps or the server timezone.

Income/expense/balance values are safe integer cents. Expense category totals exclude income and unspent categories and sort amount descending, category ID ascending. Daily expenses include every calendar date, zero-filled and ascending. Both breakdown sums equal expenseCents. An empty month has zero totals, empty category data, and all daily zeros. All aggregates use one read snapshot; nothing derived is stored. Corrupt/unsafe totals, SQLite SUM overflow, or unavailable storage produce a generic safe 500 rather than imprecise JSON numbers.

Illustrative example: one 100-cent income and one 29-cent Food expense on February 1:

```http
GET /api/summary?month=2026-02
```

```json
{
  "data": {
    "month": "2026-02", "incomeCents": 100, "expenseCents": 29, "balanceCents": 71,
    "expensesByCategory": [{"categoryId": 4, "categoryName": "Food", "amountCents": 29}],
    "dailyExpenses": [
      {"date":"2026-02-01","amountCents":29},
      {"date":"2026-02-02","amountCents":0},
      {"date":"2026-02-03","amountCents":0},
      {"date":"2026-02-04","amountCents":0},
      {"date":"2026-02-05","amountCents":0},
      {"date":"2026-02-06","amountCents":0},
      {"date":"2026-02-07","amountCents":0},
      {"date":"2026-02-08","amountCents":0},
      {"date":"2026-02-09","amountCents":0},
      {"date":"2026-02-10","amountCents":0},
      {"date":"2026-02-11","amountCents":0},
      {"date":"2026-02-12","amountCents":0},
      {"date":"2026-02-13","amountCents":0},
      {"date":"2026-02-14","amountCents":0},
      {"date":"2026-02-15","amountCents":0},
      {"date":"2026-02-16","amountCents":0},
      {"date":"2026-02-17","amountCents":0},
      {"date":"2026-02-18","amountCents":0},
      {"date":"2026-02-19","amountCents":0},
      {"date":"2026-02-20","amountCents":0},
      {"date":"2026-02-21","amountCents":0},
      {"date":"2026-02-22","amountCents":0},
      {"date":"2026-02-23","amountCents":0},
      {"date":"2026-02-24","amountCents":0},
      {"date":"2026-02-25","amountCents":0},
      {"date":"2026-02-26","amountCents":0},
      {"date":"2026-02-27","amountCents":0},
      {"date":"2026-02-28","amountCents":0}
    ]
  }
}
```

## Errors and readiness

All errors follow `{error:{code,message,fields?}}`. Client errors do not include SQL, filesystem paths, request values, notes, or stacks.

| Status | Code | Use |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Invalid schema/query/ID, incompatible category, or unsafe aggregate |
| 400 | INVALID_JSON | Malformed or non-container JSON |
| 404 | NOT_FOUND | Unknown route, missing transaction, or absent budget on DELETE |
| 413 | PAYLOAD_TOO_LARGE | JSON body exceeds 16 KiB |
| 500 | INTERNAL_ERROR | Unexpected database/internal failure |
| 503 | DATABASE_UNAVAILABLE | Health readiness only |

GET /health retains 200 `{data:{status:"ok"}}` for a ready database and generic 503 otherwise. Business routers receive the explicit database injected into createApp; constructing an app without a database opens no file and mounts no business routers. Existing server startup always initializes and injects storage before listening.

Dashboard, Transactions, Budgets, and Analytics consume these APIs. No additional chart endpoint is required. See README.md for current feature status and known UI limitations.

## Monthly budgets

GET `/api/budgets?month=2026-01` requires one canonical month (years 1900–9999). Return 200 `{data:{month,items}}`. Items contain all eight expense categories ordered by name, then ID. List filters/pagination and unknown/duplicate/array query fields are rejected with 400. Spending uses inclusive calendar dates and every expense transaction in that category/month, independently of list filters. Income is excluded.

Each item has exactly `categoryId`, `categoryName`, `month`, `amountCents`, `spentCents`, `remainingCents`, `utilizationPercent`, and `status`. With no limit, amount/remaining/utilization are null, status is `no_budget`, and spending still reflects persisted transactions. With a limit, remaining = amount minus spent; status is `under`, `at_limit`, or `over` according to exact cents. Spending above the limit is allowed. Utilization is uncapped, rounded half-up to one decimal (for example 1/3 = 33.3%, 2/3 = 66.7%, 1/2000 = 0.1%). Large display percentages have JSON floating-point precision limits; monetary values and status comparisons remain exact.

Example GET response excerpt (the full items array contains eight categories):

```json
{"data":{"month":"2026-01","items":[
  {"categoryId":4,"categoryName":"Food","month":"2026-01","amountCents":10000,"spentCents":12500,"remainingCents":-2500,"utilizationPercent":125,"status":"over"},
  {"categoryId":5,"categoryName":"Housing","month":"2026-01","amountCents":null,"spentCents":0,"remainingCents":null,"utilizationPercent":null,"status":"no_budget"}
]}}
```

PUT `/api/budgets/4/2026-01` with JSON `{"amountCents":10000}` creates or replaces the limit. Both paths return **200**, with no Location requirement:

```json
{"data":{"categoryId":4,"categoryName":"Food","month":"2026-01","amountCents":10000,"spentCents":12500,"remainingCents":-2500,"utilizationPercent":125,"status":"over"}}
```

Body fields other than amountCents are rejected; amountCents must be a JSON safe integer in 1..100000000. Route IDs use strict positive safe-integer parsing. Both mutations reject query parameters, invalid months, nonexistent categories and income categories with 400. DELETE `/api/budgets/4/2026-01` returns **204 with no body**; repeating it returns 404. Only the budget limit is deleted; transactions persist. An unavailable database, unsafe aggregate, SQLite SUM overflow or unexpected write/readback failure returns the standard generic 500 envelope. Writes and readback roll back together. No derived totals are stored.
