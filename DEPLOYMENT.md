# Public read-only portfolio demo preparation

Status: implemented for review; **nothing has been deployed**. This is the approved preparation of architecture option A, separate from the original writable local MVP. Actual resource creation, publication, custom domains and paid plans require a later human decision. Never deploy the original writable configuration publicly.

## Security and storage model

`PUBLIC_DEMO_MODE=true` creates a fresh **in-memory SQLite** database on every process startup using existing migrations, canonical category IDs, request validators and transaction/budget services. It never opens DATABASE_PATH, the normal development file, or the portfolio screenshot files. No SQLite binary or private record belongs in Git or a build artifact. SQLite query_only is enabled after seeding as a second write barrier. There is no maintenance, reset, seed or admin HTTP endpoint.

The fictional November 2026 dataset has 13 transactions and six budgets: income 395000 cents, expenses 215500 cents and balance 179500 cents. Food includes groceries/dining; Housing includes rent. Limits demonstrate under, at_limit, over and no_budget. All money stays in integer cents. Every restart recreates the same financial values; generated record timestamps can change. There is no persistence dependency or disk to attach. Local mode continues using existing persistent storage and migrations without reset.

Before body parsing, public mode globally allows only GET/HEAD plus restricted OPTIONS preflights. All other Express requests receive 403, including unknown paths and method-override attempts. Separate HTTP server handlers reject CONNECT and protocol upgrades; there is no tunnel or WebSocket API. Unsafe or unrecognized HTTP syntax is also subject to Node's HTTP parser rejection. These guards apply independently of the frontend.

Only the exact configured HTTPS browser Origin receives CORS permission; other supplied origins, including null, are rejected. Originless GET/HEAD remains available for public readers and health checks. Host must match the configured lowercase API hostname; forwarded-host headers are ignored. CORS and Host validation are not authentication: non-browser callers can forge them and read the intentionally public fictional dataset. No credentials/cookies are sent cross-origin. Query validation and sanitized API errors remain active.

## Required configuration

Example hostnames below are placeholders, not existing deployments. Replace both with the exact assigned names before launching. Flags accept only the literal strings true/false; invalid settings fail startup.

| Location | Variable | Value / behavior |
| --- | --- | --- |
| Render | NODE_VERSION | 24.19.0, matching the supported Node 24 range; verify npm 11 in build logs |
| Render | NODE_ENV | production |
| Render | PUBLIC_DEMO_MODE | true (default false) |
| Render | HOSTED_DEPLOYMENT | true (default false); requires public mode |
| Render | PUBLIC_DEMO_ORIGIN | https://expense-tracker-demo.pages.dev, exact origin without slash/path or wildcard |
| Render | PUBLIC_DEMO_HOST | expense-tracker-demo.onrender.com, exact lowercase hostname without scheme/port/path |
| Render | PORT | Supplied by Render, normally 10000; application accepts 1-65535 |
| Pages | NODE_VERSION | 24.19.0 |
| Pages | SKIP_DEPENDENCY_INSTALL | 1; build command performs the workspace install |
| Pages | VITE_PUBLIC_DEMO_MODE | true; shows fictional/read-only notice, disables editing, defaults month to November 2026 |
| Pages | VITE_API_BASE_URL | https://expense-tracker-demo.onrender.com, origin only; /api is appended by clients |

Do not configure DATABASE_PATH for Render; public mode ignores even a mistakenly supplied value. No account keys or application secrets are needed by this unauthenticated demo. VITE_* settings are compiled into publicly downloadable JavaScript; never put secrets in them. Frontend settings do not secure the backend: keep backend PUBLIC_DEMO_MODE=true regardless of UI settings. A mismatched frontend flag can expose ineffective editing controls, so smoke-test the actual build. Changing Vite settings requires rebuilding Pages.

With no hosted flag the server binds 127.0.0.1. Only HOSTED_DEPLOYMENT=true with valid public-demo configuration permits 0.0.0.0. NODE_ENV=production or Render's PORT alone cannot change that boundary. Local frontend requests stay relative /api when VITE_API_BASE_URL is absent; the existing Vite loopback proxy remains unchanged.

## Render Web Service configuration (after approval)

Use the repository root as Root Directory (leave blank), Node runtime, and the explicitly selected Free instance if available. Keep automatic deploys disabled until the reviewed candidate and smoke checklist are approved. Do not attach a disk or database service.

Build Command:

```sh
npm ci --include=dev && npm run build --workspace backend
```

Start Command:

```sh
npm run start --workspace backend
```

The start script runs Node on backend/dist/server.js; it does not run tsx, TypeScript source, Vite dev, or the workspace-wide dev command. Development dependencies are needed during compilation. Set the environment above **before the first start**. Health Check Path: `/api/health`. A healthy demo response is `{data:{status:"ok",publicDemoMode:true,demoMonth:"2026-11"}}`; unavailable storage yields sanitized 503. Health includes a real schema/catalog readiness check without initialization or writes.

Render requires 0.0.0.0 binding for public Web Services and provides PORT; this is enabled only by the guarded hosted setting. Its HTTP health checks use the onrender.com hostname when no custom domain is configured. Do not add custom domains during initial acceptance: Render can use a verified custom domain for health Host, which would require reviewing/updating PUBLIC_DEMO_HOST and the frontend API origin together. See [Render Web Services](https://render.com/docs/web-services) and [health checks](https://render.com/docs/health-checks).

## Cloudflare Pages configuration (after approval)

Use Pages Git integration, not a Workers deployment. Repository root: blank/root. Framework preset: React (Vite), with these explicit overrides:

Build Command:

```sh
npm ci --include=dev --workspace frontend --include-workspace-root && npm run build --workspace frontend
```

Build Output Directory: `frontend/dist` (relative to repository root). No Functions directory or server process is needed. Set the Pages variables above for the production environment. Do not automatically enable preview builds against the production API: their distinct origins are deliberately not allowed. Use a separately reviewed backend/origin pair if previews are later required; never change CORS to a wildcard to accommodate them.

Navigation uses #dashboard, #transactions, #budgets and #analytics, so normal navigation/reloads request the same index document. Cloudflare Pages also provides SPA fallback when no top-level 404.html exists; none is supplied by this application. No URL-route rewrite, router replacement or backend asset serving is necessary. See [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [build-image overrides](https://developers.cloudflare.com/pages/configuration/build-image/) and [serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/).

## Deployment order and blockers

1. Review this diff and tests; independently verify that Git/build contents contain no SQLite files, .env secrets or personal records. Actual provider builds, TLS and proxy behavior remain unverified until an approved deployment.
2. Choose/reserve the intended Render service name and Pages project name through a separately approved action. Record exact assigned hostnames; the example names are not a guarantee of availability.
3. Configure all backend flags/origin/host first. After explicit deployment approval, build/start Render and verify the health response declares publicDemoMode true. Stop immediately if it does not. Do not publish a writable fallback.
4. Configure Pages with the confirmed backend HTTPS origin and public UI flag, then build/publish only after approval. Check CORS, console/network output and all pages using the actual Pages origin.
5. Complete the checklist below before sharing the URL. Avoid automatic publication from an unreviewed branch. No command in this document has been used to create cloud resources during preparation.

## Browser and direct-request smoke checklist

- Confirm HTTPS on both origins and that /api/health returns the read-only demo indicator.
- Load all four hash routes, reload each, and confirm November 2026 defaults; compare $3,950 income, $2,155 expenses and $1,795 balance. Confirm readable chart tables and budget states.
- Confirm the read-only fictional-data banner; Add, Edit, Delete, Set and Remove controls must be disabled. Month selection, filters, pagination, category selection and refresh must still work.
- Inspect Network: every API URL must use the chosen Render HTTPS origin. No localhost, credentials, mixed content, failed CORS or private values may appear.
- From the exact Pages origin, GET/HEAD and an OPTIONS preflight requesting GET must succeed. An unapproved Origin must receive 403 without Allow-Origin; an approved-origin write preflight must receive 403. Preview subdomains are not implicitly trusted.
- Using a direct client (UI bypass), send POST /api/transactions, PUT/DELETE /api/transactions/1, PUT/DELETE /api/budgets/4/2026-11, PATCH, TRACE and an unknown write path: expect 403. Record transaction/budget/summary responses before and after; they must remain unchanged. Do not send these probes to any personal/local database service.
- Test CONNECT/upgrade rejection in an approved environment, wrong Host, spoofed forwarded Host, malformed JSON and invalid queries. Errors must not expose SQL, paths, stack traces, notes or environment values.
- Restart the demo instance: the fictional dataset must be recreated without duplicates, while no user/database volume is read or restored. Recheck configuration after any rollback.
- Verify platform traffic controls, logging/privacy and spending caps before sharing. Record actual deployed smoke results; local tests are not proof of provider behavior.

## Local verification (no public listener)

Run npm.cmd run typecheck, npm.cmd run build, npm.cmd test, npm.cmd run test:browser --workspace frontend and git diff --check from the repository root. The original Chrome regression suite tests local writable behavior with intercepted fixtures, not a real Cloudflare/Render deployment. Backend public-demo tests bind ephemeral loopback sockets, compare serialized in-memory SQLite before/after blocked requests, cover unusual methods and preflight rules, and verify query-only protection. Frontend tests check HTTPS URL selection, local defaults and disabled read-only presentation. Hosted binding is configuration-tested without opening 0.0.0.0 during this work.

## Free-tier and security limitations

Render Free Web Services spin down after 15 minutes idle and may take about a minute to wake; local filesystem changes are lost on restart/redeploy/spin-down. This demo intentionally regenerates memory data, so no persistence is promised. Free services have usage/bandwidth/build limits and may be suspended when allowances are exhausted; review current dashboards and [Render Free documentation](https://render.com/docs/free). Cloudflare Pages also has build/project limits; review [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) before publishing. Availability and quotas can change; no paid upgrade is authorized here.

Read-only mode does not solve denial of service, scraping, dependency vulnerabilities, provider compromise or all transport risks. There is no application authentication, per-user isolation, application rate limiter or complete CSP/WAF policy. Use provider/edge rate limits and budget controls appropriate to a public demo, monitor sanitized logs, and keep dependencies patched. Non-browser readers are intentionally allowed to obtain fictional data. Treat any real-data, authenticated, write-enabled, custom-domain or persistent-storage extension as a separate security review. Never reuse this configuration to publish personal financial storage.


## Preparation verification record

Local checks on November 4, 2026: frontend 413 and backend 1052 Vitest cases passed (1465 total), typecheck/build passed, and all 44 existing Chrome cases passed. A separate smoke check ran the actual compiled backend twice in public mode with hosted binding disabled on ephemeral 127.0.0.1 ports 59577 and 59583: both returned health 200, rejected POST with 403, and recreated exactly 13 transactions with expense total 215500 cents. A deliberately unused DATABASE_PATH file was not created, and development database metadata was unchanged. Both owned processes exited cleanly. These are local preparation results, not actual Render/Pages or cross-origin HTTPS browser acceptance.
