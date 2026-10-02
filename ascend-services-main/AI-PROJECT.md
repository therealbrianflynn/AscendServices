# AI-PROJECT.md

> Thin local identity. Shared eng behavior lives in grok-brain `work/ai-core/`. Live SoR = GitHub Issues/PRs/Checks on this repo.

## Identity
- **Project / Repo**: Ascend Services (`MarcusRich/ascend-services`)
- **Domain**: Ministry / community service matching (volunteers ↔ help requests)
- **Type**: Full-stack web app (Dockerized)
- **Primary Stack**: **Next.js (App Router) + TypeScript + PostgreSQL + Prisma + Tailwind** (seed default; MudBlazor/.NET path deferred unless Marcus overrides). Passkeys (WebAuthn) + email magic-link fallback. Observability: structured JSON logs + `/api/health`.
- **Owner / Team**: Marcus Rich — personal GitHub (BUSINESS/personal; not eNobleon)
- **Lifecycle Stage**: Seed MVP / experimental → private until Accept
- **Spec**: `docs/Ascend-Services-Spec-v6.pdf` (v6.0)

## Commands (Exact)
- **Install**: `pnpm install`
- **Build**: `pnpm build` (runs `prisma generate` then `next build`)
- **Test**: `pnpm test` (Vitest unit smoke)
- **Lint / Format**: `pnpm lint`
- **Run / Serve (local Next)**: `pnpm dev` with `DATABASE_URL` from `.env.example` (Postgres via Compose)
- **Run / Serve (full stack)**: `docker compose up --build`
- **Migrate (deploy)**: `pnpm db:migrate` (`prisma migrate deploy`)
- **Migrate (dev)**: `pnpm db:migrate:dev`
- **Seed one ADMIN**: `ADMIN_SEED_EMAIL=you@example.com pnpm db:seed:admin` (idempotent upsert; no password — sign in via magic link)
- **Health**: `curl -sf http://localhost:3000/api/health`
- **Sign in (passkey or magic link)**: `/signin`; passkey endpoints are `POST /api/auth/passkey/{register,authenticate}/{options,verify}` (enrolment needs a session; sign-in does not)
- **Request Help (public)**: form at `/request`; `curl -sX POST http://localhost:3000/api/requests -H 'content-type: application/json' -d '{"requester_name":"...","service_type":"Yard work","neighborhood":"...","street_address":"..."}'`
- **Track a request (no login)**: `/track/<tracking_token>` or `curl -s http://localhost:3000/api/requests/track/<tracking_token>`
- **Help Wanted board (SERVER/ADMIN)**: `/board`; narrow with repeated skill params, e.g. `/board?skill=Yard%20work&skill=Meals`
- **Claim a request**: `curl -sX POST http://localhost:3000/api/board/requests/<request_id>/assign -b 'ascend_session=<cookie>'` (self-assign; NEW → ASSIGNED)
- **Admin console (ADMIN)**: `/admin` — request + member grids and the SLA thresholds; feeds are `GET /api/admin/{requests,users}`
- **Read / edit SLA thresholds**: `curl -s http://localhost:3000/api/admin/settings/sla -b 'ascend_session=<cookie>'`; `curl -sX PATCH .../api/admin/settings/sla -H 'content-type: application/json' -d '{"unassigned_alert_hours":12}'` (partial patch)
- **Bulk-import volunteers (ADMIN)**: upload zone in `/admin` → Members → Bulk import, or `curl -sX POST http://localhost:3000/api/admin/users/import -b 'ascend_session=<cookie>' -F 'file=@src/__fixtures__/volunteer-import/volunteers.csv'`. Accepts `.csv` / `.xlsx`; columns are `Email` (required), `Name`, `Skills`, `Bio`. Answers with a per-row report (`summary` + `errors`), never a bare OK
- **Rebuild the import sample sheets**: `pnpm fixtures:volunteer-import` (regenerates `volunteers.xlsx` from `volunteers.csv` so the pair cannot drift)
- **Run the SLA monitor (job / cron)**: `DATABASE_URL=... pnpm sla:check` — one pass over overdue requests; writes a `SLA_BREACH` JSON line per new breach, audits it and mails the admin digest. Same pass on demand for an ADMIN: `curl -sX POST http://localhost:3000/api/admin/sla/monitor -b 'ascend_session=<cookie>'`
- **Schedule it**: any scheduler that can run the script, e.g. `0,15,30,45 * * * * cd /app && pnpm sla:check >> /var/log/ascend-sla.log 2>&1`. Re-running is safe (one alert per request per stuck state); set `SLA_ADMIN_NOTIFY=false` to keep the log lines and drop the digest email
- **Deploy (safe / preview)**: Docker image build only until Marcus yes on AWS ECS

## Repo Map
- `docs/` — product spec + ADRs + `BRAND.md` (palette / gradient / logo rules)
- `public/brand/` — official logo asset (`ascend-services-logo.jpg`; never recolored)
- `src/app/globals.css` — brand CSS variables (`--ascend-*`) + `ascend-gradient` CTA utility
- `src/app/site-header.tsx` — root-layout header lockup (logo links home)
- `src/app/` — Next.js App Router (pages + `/api/health`)
- `src/app/request/` — public Request Help form (no login)
- `src/app/track/[token]/` — requester self-service portal (tracking token = the credential)
- `src/app/api/requests/` — `POST` create (public), `GET` board feed (public columns only), `GET /track/[token]` portal feed
- `src/app/board/` — Volunteer Hub: sticky-note Help Wanted board + skill chips + "My assignments"
- `src/app/api/board/requests/[id]/assign/` — `POST` self-assign (NEW → ASSIGNED)
- `src/app/admin/` — ADMIN console: one shared TanStack Table `DataGrid` (sort + search) for requests and members, plus the SLA thresholds form and the volunteer bulk-import zone
- `src/app/api/admin/` — `whoami`, `requests`, `users`, `users/import` (`POST`, multipart), `settings/sla` (`GET` + `PATCH`), `sla/monitor` (`POST`); all `requireRole(ADMIN)`
- `src/lib/admin/` — admin request + member listings (projections that carry PII, so ADMIN-only callers)
- `src/lib/settings/` — SLA threshold contract (labels/units/bounds), patch validation, `SystemSettings` read/save
- `src/lib/sla/` — SLA monitor: the check table (stuck state + clock column per threshold), the job itself, and the admin digest stub
- `scripts/run-sla-monitor.ts` — cron entry point for one SLA pass (`pnpm sla:check`)
- `src/lib/volunteers/` — signed-in member profile (skills + bio) read fresh from the database
- `src/lib/volunteers/import/` — bulk volunteer upsert: `contract.ts` (columns, aliases, limits — the one dependency-free module the browser also imports), `parse.ts` (CSV/XLSX → one table), `rows.ts` (row validation + admin-facing messages), `skills.ts` (additive skill merge), `upsert.ts` (merge / create + audit), `welcome.ts` (onboarding welcome stub), `service.ts` (the pass + its report)
- `src/__fixtures__/volunteer-import/` — committed sample sheets (`volunteers.csv` + the `volunteers.xlsx` generated from it by `scripts/build-volunteer-import-fixture.ts`); the unit tests import both
- `src/lib/` — Prisma client + structured JSON logger stub + `app-url` (shared `APP_BASE_URL` origin)
- `src/app/signin/` — sign-in page: passkey first, emailed link as fallback, passkey enrolment once signed in
- `src/lib/auth/` — magic-link issue/consume, signed httpOnly session cookie, role guards
- `src/lib/auth/webauthn/` — RP config, server-side challenge store, passkey registration + authentication
- `src/lib/requests/` — form validation, tracking tokens, status copy, create/lookup service, board listing + skill filter, assignment service, connection email, public vs. portal vs. assignee projections
- `src/lib/email/` — `EmailTransport` interface + structured-log stub (`EMAIL_TRANSPORT=log`)
- `scripts/seed-admin.ts` — one-shot ADMIN bootstrap
- `prisma/` — schema + migrations (SLA units = **hours / days**)
- `.github/workflows/ci.yml` — lint + unit smoke on PR
- `.github/ISSUE_TEMPLATE/` — Brief/Epic/Feature/Story/Task

## Local Constraints & Gotchas
- Private repo; no public flip without Marcus yes
- Marcus Accept only for Feature/Epic → `main`; Tasks never target `main`
- No forever `mvp` branch — ephemeral `epic/*` / `feature/*` only
- Passwordless-first auth: Passkeys (Task #16) + magic link fallback (Task #12, inclusivity). Both land on the same `ascend_session` cookie and the same SERVER|ADMIN roles
- Magic-link tokens are stored as SHA-256 hashes, single-use, TTL `MAGIC_LINK_TTL_MINUTES` (15); session = HMAC-signed httpOnly `ascend_session` cookie, secret from env only
- Passkeys use `@simplewebauthn/server` + `@simplewebauthn/browser`; credentials in `PasskeyCredential` (public key + signature counter only — attestation is verified then discarded, never stored or logged)
- WebAuthn challenges are **server-side and single-use** (`WebAuthnChallenge`, TTL `WEBAUTHN_CHALLENGE_TTL_MINUTES`, default 5); the browser holds only an opaque ceremony id in the short-lived httpOnly `ascend_webauthn` cookie (SameSite=Strict)
- Enrolment is session-gated: you sign in with a magic link first, then add a passkey. An unauthenticated enrol endpoint would be an account-takeover primitive
- `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGINS` default to `APP_BASE_URL`; the RP ID must be the origin host or a parent domain or config throws (see `.env.example`). Passkeys need `localhost` or HTTPS
- Seed MVP sends no real email: `EMAIL_TRANSPORT=log` writes one `email_sent` JSON line per message; bodies (which carry the link) are omitted when `NODE_ENV=production`
- New sign-ins self-register as `SERVER`; `ADMIN` only via `pnpm db:seed:admin`, and ADMIN routes re-read the role from the DB so revocation is immediate
- Requester street address is private (visible only when assigned); neighborhood is public-facing
- Help Wanted board cards use `PUBLIC_REQUEST_SELECT`; the address reaches a volunteer only through `ASSIGNMENT_REQUEST_SELECT`, and every query using it is scoped to `assignedToId = <that volunteer>`
- Assignment is self-service and a **conditional update** (`where: { id, status: NEW }`), so two volunteers claiming the same sticky note cannot both win — the loser gets `409 already_claimed`
- Prayer text is never selected for a volunteer: assignment is not the requester's opt-in to share it
- `Request.requester_email` is optional. Spec v6 §4 mails the requester on ASSIGNED, which the Spec §3 table has no column for; with no address on file the assignment still lands and `connection_email_skipped` is logged
- Connection email (`volunteer_connection`) introduces the volunteer by name + bio and BCCs ADMIN users; the body carries **no street address and no tracking token** because `EMAIL_TRANSPORT=log` writes it to the structured log outside production
- Volunteers with no `services_provided` see every open request — an unfinished profile must not read as "nothing to do"; `?skill=` may narrow a board, never widen it past the profile
- `PUBLIC_REQUEST_SELECT` (`src/lib/requests/views.ts`) is the only projection public/board responses may use — `street_address`, `requester_name` and prayer text are never selected, so they cannot leak by omission bug
- Tracking tokens are 192-bit url-safe bearer credentials stored in clear (the portal is a repeat lookup, not a one-shot login) — never log them, never return them on a list; the portal page is `robots: noindex` and `cache-control: no-store`
- Prayer request is optional and **private by default** (`prayer_private`); the requester must opt in before the text may be shared beyond staff
- Request Help form categories come from `REQUEST_SERVICE_TYPES` (see `.env.example`), not hardcoded in the form
- Brand palette lives only in `src/app/globals.css` `:root` (`--ascend-*`, sourced from `docs/BRAND.md`) and is consumed through Tailwind `*-ascend-*` utilities — no raw hexes in components
- Logo is used as-is: no recolor, no filters; header height stays in the 40–48px band from `docs/BRAND.md`
- No dark-mode inversion this pass (explicitly out of scope in `docs/BRAND.md`)
- No PHI / clinical claims; ministry community ops — still no secrets in logs
- No AWS spend / domain / Stripe / production deploy without Marcus yes
- Richard determinism rule N/A (not NobleOne regulated path) unless later linked
- **SystemSettings SLA thresholds follow Spec v6 units** — `unassigned_alert_hours` (24), `stalled_contact_alert_hours` (24), `stalled_progress_days` (3)
- SLA thresholds are described once in `src/lib/settings/sla-thresholds.ts` (label, unit, bounds, fallback mirroring the Prisma default); the admin form renders itself from that list and the server re-validates every value. `SystemSettings` is a singleton row (`id = "default"`) created lazily on the first save, so a fresh install reports the defaults with `updatedAt: null`
- A threshold edit is a **partial** PATCH (upsert + audit row in one transaction), so tuning one threshold cannot clobber a colleague's edit to another
- Admins may read `street_address` and requester emails — `ADMIN_REQUEST_SELECT` selects them, the responses are `no-store`, and **no admin path ever logs a row**: failures log the error message alone. Prayer text and tracking tokens stay out of the admin list, and `onboarding_token` stays out of `ADMIN_USER_SELECT`
- The SLA monitor reads its limits from `SystemSettings` every pass — thresholds are never baked into the job. Each check is one row of `SLA_CHECKS` (`src/lib/sla/checks.ts`): stuck state + the clock it is aged from — NEW/`createdAt`, ASSIGNED/`assignedAt`, IN_PROGRESS/`updatedAt`. A null clock (ASSIGNED with no `assignedAt`) cannot be aged and is skipped rather than guessed
- `stalled_progress` is measured from `updatedAt` because no IN_PROGRESS transition timestamp exists yet: any edit counts as progress, so it under-reports rather than crying wolf
- A breach is alerted **once per request per stuck state**: the `SLA_BREACH` audit row (`fromStatus` = the stuck state) is the dedupe key, written before the log line, so a cron may run as often as it likes and a crash mid-pass can only cost an alert, never repeat one
- SLA alerts are PII-free by construction: the monitor selects `SLA_REQUEST_SELECT` (id, service type, neighborhood, timestamps), so requester name, email, street address, prayer text and tracking token are never fetched, logged, audited or emailed
- The volunteer import is **additive**: `services_provided` is unioned (case-insensitive, existing spelling wins), and a blank cell leaves the column it maps to alone — an import sheet is one admin's snapshot of a volunteer, never the whole truth about them, so it may fill gaps but never clear a profile. A non-empty `Name` / `Bio` cell does overwrite
- Import rows are applied **one at a time**, each in its own transaction with its audit row. A bad row is reported against its line number and changes nothing; the good rows still land. The response is always the report (`created` / `merged` / `unchanged` / `failed` plus per-row errors), so a partially applied sheet can never look like a clean import. Only an unreadable sheet — wrong extension, no `Email` column, over `VOLUNTEER_IMPORT_MAX_ROWS`/`MAX_BYTES`, corrupt — is a 400 with nothing applied
- `role` is never read from an import sheet: ADMIN stays a deliberate act (`pnpm db:seed:admin`), and a repeated address inside one sheet is rejected on the second row rather than merged twice
- A newly imported member gets an `onboarding_token` (Spec v6 §3) and one `volunteer_welcome` line through the usual `EMAIL_TRANSPORT=log` stub. The token is a bearer credential: it is never put in the email body, the log, the audit metadata or the import report, and `ADMIN_USER_SELECT` still keeps it off the member grid. The welcome points at `/signin` — the passwordless entry point that exists today — rather than an onboarding URL with no route behind it; the token marks the account as import-provisioned for the Spec v6 §5 first-time onboarding flow
- `requireRole` (routes) and `requireRoleForPage` (pages) share one database-authoritative role read, so revoking an ADMIN closes both. A member without the role gets 403 from a route and **404** from a page — a 403 page would confirm the admin URL exists
- Admin grids format dates with a fixed locale and time zone: a cell renders on the server and hydrates on the client, and "whatever locale each end has" is a hydration mismatch
- **`RequestStatus` is exactly** `NEW | ASSIGNED | CONTACT_MADE | IN_PROGRESS | COMPLETE` — no `COMPLETED`, no `CANCELLED`
- `User.id` / `Request.id` are UUIDs (`@default(uuid())`) per Spec v6 §3

## Branch topology
- `main` — protected; Accept-only
- `epic/<slug>`, `feature/<slug>`, `story/<slug>`, `task/<slug>` — ephemeral; delete after Accept

## Context Sources
- Spec PDF in `docs/`
- Issues labeled `brief` | `epic` | `feature` | `story` | `task` | `ready` | `blocked` | `verify` | `autopilot` | `done`

## Overrides
- Prefer wrap/boring stack; TanStack Table for Admin grid; sticky-note board for volunteers
- Cron SLA monitor: unassigned / stalled contact / stalled progress → admin notify + `SLA_BREACH` log

## Freshness
- **Last updated**: 2026-09-25 by Task #23 volunteer bulk import (`POST /api/admin/users/import`, additive skill merge, `onboarding_token` + `volunteer_welcome` stub, per-row report), previously Task #21 SLA monitor job (`pnpm sla:check` / `POST /api/admin/sla/monitor`, `SLA_BREACH` logs + audit rows, admin digest stub)
- **Confidence**: High (scaffold + magic-link auth + request create/track + passkeys + brand theme + volunteer board + admin console landed; passkey register/authenticate covered by tests that run real P-256 ceremonies through the verifier, plus replay/clone/cross-user failure cases; create→fetch-by-token and street-address-hidden covered by unit tests; assign transition, claim race, skill filter and connection-email stub covered by unit tests; admin SERVER/revoked-ADMIN denials, admin projections, SLA validation and the no-PII-in-logs rule covered by unit tests; the SLA monitor covered by fake-clock unit tests over overdue fixtures — threshold reads, the three checks, alert-once dedupe, the ADMIN route guards and the PII rule; the volunteer import covered by unit tests over the committed CSV **and** XLSX sample sheets — merge-by-email, new-account + `onboarding_token` + welcome stub, per-row errors with the good rows still applied, rollback on a failed row, and the ADMIN route guards; verified end-to-end against local Postgres)
- **Next review**: after Feature Accept / next story tasks
