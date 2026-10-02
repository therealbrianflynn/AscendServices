import Link from "next/link";

export default function TrackingNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-ascend-navy">
        We could not find that request
      </h1>
      <p className="mt-3 text-ascend-ink">
        The tracking link may have been mistyped or truncated by an email client.
        Check the full link, or send a new request and we will issue a fresh one.
      </p>
      <Link
        href="/request"
        className="ascend-gradient mt-6 inline-block rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm"
      >
        Request help
      </Link>
    </main>
  );
}
