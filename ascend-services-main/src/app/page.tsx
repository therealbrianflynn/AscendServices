export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-ascend-taupe">
          Ascend Services
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ascend-navy">
          Community help, matched with care
        </h1>
        <p className="mt-4 text-lg text-ascend-ink">
          Ministry volunteer ↔ help-request platform. Scaffold ready — CTAs below
          are placeholders for upcoming flows.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <a
          href="/request"
          className="ascend-gradient rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm"
        >
          Request help
        </a>
        <a
          href="/signin"
          className="rounded-lg border border-ascend-taupe/60 bg-ascend-bg px-4 py-2.5 text-sm font-medium text-ascend-navy"
        >
          Volunteer / serve
        </a>
        <a
          href="#admin"
          className="rounded-lg border border-ascend-taupe/60 bg-ascend-bg px-4 py-2.5 text-sm font-medium text-ascend-navy"
        >
          Admin
        </a>
      </div>
      <section
        id="request-help"
        className="rounded-xl border border-ascend-taupe/30 bg-ascend-surface p-4"
      >
        <h2 className="font-medium text-ascend-navy">Request help</h2>
        <p className="mt-1 text-sm text-ascend-ink">
          No account needed. Tell us what you need and keep the private tracking
          link we hand back to follow your request.
        </p>
        <a
          href="/request"
          className="mt-3 inline-block text-sm font-medium text-ascend-navy underline decoration-ascend-sky-deep decoration-2 underline-offset-4"
        >
          Open the request form
        </a>
      </section>
      <section
        id="volunteer"
        className="rounded-xl border border-ascend-taupe/30 bg-ascend-surface p-4"
      >
        <h2 className="font-medium text-ascend-navy">Volunteer / serve</h2>
        <p className="mt-1 text-sm text-ascend-ink">
          Sign in with a passkey, or have a one-time link emailed to you, then
          pick up an open request from the Help Wanted board.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <a
            href="/signin"
            className="text-sm font-medium text-ascend-navy underline decoration-ascend-sky-deep decoration-2 underline-offset-4"
          >
            Sign in
          </a>
          <a
            href="/board"
            className="text-sm font-medium text-ascend-navy underline decoration-ascend-sky-deep decoration-2 underline-offset-4"
          >
            Help Wanted board
          </a>
        </div>
      </section>
      <section
        id="admin"
        className="rounded-xl border border-ascend-taupe/30 bg-ascend-surface p-4"
      >
        <h2 className="font-medium text-ascend-navy">Admin</h2>
        <p className="mt-1 text-sm text-ascend-taupe">Placeholder — request grid + SLA settings later.</p>
      </section>
    </main>
  );
}
