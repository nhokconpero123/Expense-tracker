# Implemented API through T06

Local base URL: `http://127.0.0.1:3001/api`; Vite proxies `/api` from port 5173. These unauthenticated APIs are localhost-only. JSON objects use camelCase, monetary values use integer USD cents, and timestamps are UTC. Examples below assume a freshly seeded database; IDs/timestamps are illustrative, not fixed contract values. Discover category IDs through GET /categories.

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

## Errors and readiness

All errors follow `{error:{code,message,fields?}}`. Client errors do not include SQL, filesystem paths, request values, notes, or stacks.

| Status | Code | Use |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Invalid schema/query/ID, incompatible category, or unsafe aggregate |
| 400 | INVALID_JSON | Malformed or non-container JSON |
| 404 | NOT_FOUND | Unknown route or missing transaction detail |
| 413 | PAYLOAD_TOO_LARGE | JSON body exceeds 16 KiB |
| 500 | INTERNAL_ERROR | Unexpected database/internal failure |
| 503 | DATABASE_UNAVAILABLE | Health readiness only |

GET /health retains 200 `{data:{status:"ok"}}` for a ready database and generic 503 otherwise. Business routers receive the explicit database injected into createApp; constructing an app without a database opens no file and mounts no business routers. Existing server startup always initializes and injects storage before listening.

Budgets, summary/analytics, and UI integrations are not implemented through T06.
