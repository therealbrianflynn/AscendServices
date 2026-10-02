import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-ascend-navy/10 bg-white/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-display text-xl text-ascend-navy">Ascend Services</p>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-ascend-navy/70">
            A ministry of practical care. We show up for our community with meals,
            repairs, rides, and a willing pair of hands.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-ascend-navy">
          <Link href="/request" className="hover:text-ascend-sky-deep">
            Request help
          </Link>
          <Link href="/signin" className="hover:text-ascend-sky-deep">
            Serve
          </Link>
          <Link href="/board" className="hover:text-ascend-sky-deep">
            Help wanted
          </Link>
        </nav>
      </div>
    </footer>
  );
}
