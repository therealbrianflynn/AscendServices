# ascend-services

Ascend Services v6 — ministry volunteer ↔ help-request platform.

## Quick start

```bash
cp .env.example .env
docker compose up --build
curl -sf http://localhost:3000/api/health
```

Local Next (Postgres already up via Compose):

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

## Sign in

Open `/signin`. Passkeys are the primary factor; the emailed magic link is the
fallback for anyone without one (and is how you get your first session, since
enrolling a passkey requires being signed in).

## Passkeys (WebAuthn)

Enrolment and sign-in run through `@simplewebauthn/server` and its browser
client. Credentials live in Postgres (`PasskeyCredential`); challenges live in
`WebAuthnChallenge` — server-side, single-use and expiring after
`WEBAUTHN_CHALLENGE_TTL_MINUTES` (default 5) — with the browser holding only an
opaque ceremony id in a short-lived httpOnly cookie.

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/passkey/register/options` | session | Start enrolment |
| `POST /api/auth/passkey/register/verify` | session | Store the new credential |
| `POST /api/auth/passkey/authenticate/options` | none | Start sign-in (`{ email? }`) |
| `POST /api/auth/passkey/authenticate/verify` | none | Verify and set the session cookie |

`RP ID` and origin default to `APP_BASE_URL`; override with `WEBAUTHN_RP_ID` and
`WEBAUTHN_ORIGINS` once the app answers on a real domain (see `.env.example`).
The RP ID has to be the origin host or a parent of it — the app refuses to start
a ceremony otherwise rather than letting the browser fail confusingly.

Passkeys need a secure context, so use `http://localhost:3000` (treated as
secure) or HTTPS; a plain-HTTP LAN address will not work.

## Passwordless sign-in (magic link — fallback)

Email is a stub in the seed MVP: `EMAIL_TRANSPORT=log` writes each outbound
message to the structured JSON log instead of sending it, so copy the link out of
the app logs.

```bash
# 1. request a link (202 for known and new addresses alike)
curl -si -X POST http://localhost:3000/api/auth/magic-link \
  -H 'content-type: application/json' -d '{"email":"you@example.com"}'

# 2. copy the callback URL from the `"msg":"email_sent"` log line, then consume it
curl -si -c cookies.txt 'http://localhost:3000/api/auth/callback?token=...'

# 3. the httpOnly `ascend_session` cookie is now a session
curl -s -b cookies.txt http://localhost:3000/api/auth/session
curl -s -b cookies.txt -X POST http://localhost:3000/api/auth/logout
```

Tokens are single-use and expire after `MAGIC_LINK_TTL_MINUTES` (default 15).
Unknown addresses self-register with role `SERVER`. Once signed in, add a
passkey from `/signin`; the magic link keeps working either way.

### Bootstrap an ADMIN

```bash
ADMIN_SEED_EMAIL=you@example.com pnpm db:seed:admin
curl -s -b cookies.txt http://localhost:3000/api/admin/whoami  # 403 unless ADMIN
```

The seed is idempotent and creates no password — sign in with a magic link.

See `AI-PROJECT.md` for exact commands. Spec: `docs/Ascend-Services-Spec-v6.pdf`.
