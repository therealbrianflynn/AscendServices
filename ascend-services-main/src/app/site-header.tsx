import Image from "next/image";
import Link from "next/link";

/** Brand rules for the header lockup live in docs/BRAND.md. */
const LOGO_SRC = "/brand/ascend-services-logo.jpg";
/** docs/BRAND.md: header logo height ~40–48px, left-aligned, never recolored. */
const LOGO_HEIGHT_PX = 44;
/** Intrinsic pixel size of LOGO_SRC — keeps the rendered lockup undistorted. */
const LOGO_INTRINSIC = { width: 2816, height: 1536 } as const;

const LOGO_WIDTH_PX = Math.round(
  (LOGO_HEIGHT_PX * LOGO_INTRINSIC.width) / LOGO_INTRINSIC.height,
);

const navLinkClass =
  "text-sm font-medium text-ascend-navy underline decoration-ascend-sky-deep decoration-2 underline-offset-4 hover:text-ascend-sky-deep";

export function SiteHeader() {
  return (
    <header className="border-b border-ascend-taupe/30 bg-ascend-bg">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" aria-label="Ascend Services home" className="flex items-center">
          <Image
            src={LOGO_SRC}
            alt="Ascend Services"
            width={LOGO_WIDTH_PX}
            height={LOGO_HEIGHT_PX}
            priority
          />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-5">
          <Link href="/board" className={navLinkClass}>
            Help wanted
          </Link>
          <Link href="/request" className={navLinkClass}>
            Request help
          </Link>
        </nav>
      </div>
    </header>
  );
}
