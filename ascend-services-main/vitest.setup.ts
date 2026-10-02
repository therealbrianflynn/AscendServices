/**
 * Test-only environment defaults. Mirrors the keys documented in `.env.example`
 * so unit tests never depend on a developer's local `.env`.
 */
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-at-least-32-chars";
process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.EMAIL_FROM ??= "no-reply@ascend.test";
process.env.EMAIL_TRANSPORT ??= "log";
