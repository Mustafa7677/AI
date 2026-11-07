# TULPAR Classroom

Cloudflare Worker `tulpar-classroom` (`classroom/worker.mjs`) + D1 (`classroom/schema.sql`).

## Flow
1. Super Admin: `/admin` → password (`ADMIN_PASSWORD`) → create class → one-time Join Code; open/close classes.
2. Student: `/join` → name + Join Code → HttpOnly `SameSite=Lax` session cookie (first-party).
3. Student is redirected to `/app/` — the full existing TULPAR AI interface, proxied from GitHub Pages
   (`APP_SOURCE`, default `https://mustafa7677.github.io/AI/`) and served from the Worker origin.
   - Cloud (multi-model): browser → same-origin `/api/chat` → service binding `AI_GATEWAY`
     with `TULPAR_ACCESS_TOKEN` added server-side. No token/API key in the browser.
   - Local TULPAR Core: unchanged, runs in the browser (Settings → AI режимі).
4. Every `/api/chat` call re-checks: valid session, active user, student role, active class.
   Closing a class immediately revokes its students' sessions.

Why first-party: `github.io` and `workers.dev` are different sites, so a cookie set by the Worker
is third-party on GitHub Pages and is not sent (SameSite / third-party cookie blocking).

## Routes
GET `/join`, `/admin`, `/app/*` (`/`, `/app`, `/chat` → `/app/`)
POST `/api/class/join`, `/api/admin/login`, `/api/logout`, `/api/chat`
GET `/api/me`; GET/POST `/api/admin/classes`; POST `/api/admin/classes/status` `{id, active}`

## Bindings (existing, unchanged)
`DB` (D1), `AI_GATEWAY` (service → `tulpar-ai-gateway`), secrets `TULPAR_ACCESS_TOKEN`, `ADMIN_PASSWORD`,
var `ALLOWED_ORIGIN` (must be in the gateway's `ALLOWED_ORIGINS`). Optional var `APP_SOURCE`.
No schema change is required.

## Deploy
`.github/workflows/deploy-workers.yml` uploads only the classroom Worker code (bindings and secrets are kept; gateway only via manual run) on push to
`main`, when repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist. Otherwise paste
`classroom/worker.mjs` into the Cloudflare dashboard editor of `tulpar-classroom`.

## Limits
Join Codes can be shared; close the class to revoke. Per-student rate limit (20/min) is best effort per isolate;
enable the gateway `RATE_LIMITER` binding for a hard limit (keyed per student via `x-tulpar-user`).
