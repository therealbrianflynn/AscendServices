import Link from "next/link";

import { BrandLogo } from "./brand-logo";

const navLinkClass =
  "rounded-full px-3 py-2 text-sm font-semibold text-ascend-navy hover:bg-ascend-sky/20 hover:text-ascend-sky-deep";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-ascend-navy/10 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2.5">
        <Link href="/" aria-label="Ascend Services home" className="shrink-0">
          <BrandLogo height={64} priority />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <Link href="/request" className={navLinkClass}>
            Request help
          </Link>
          <Link href="/board" className={`${navLinkClass} hidden sm:inline`}>
            Help wanted
          </Link>
          <Link
            href="/signin"
            className="ascend-gradient ml-1 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
