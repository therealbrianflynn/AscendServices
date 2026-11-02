"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "./brand-logo";

interface Viewer {
  admin: boolean;
  board: boolean;
}

const PUBLIC_LINKS = [
  { href: "/about", label: "About" },
  { href: "/request", label: "Request help" },
  { href: "/serve", label: "Serve" },
  { href: "/media", label: "Media" },
  { href: "/partners", label: "Partners" },
  { href: "/events", label: "Events" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { user?: { admin?: boolean; board?: boolean } };
        if (!body.user) return null;
        return { admin: body.user.admin === true, board: body.user.board === true };
      })
      .then((next) => {
        if (!cancelled) setViewer(next);
      })
      .catch(() => {
        if (!cancelled) setViewer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const links = [
    ...PUBLIC_LINKS,
    ...(viewer?.board ? [{ href: "/board", label: "Help wanted" }] : []),
    ...(viewer?.admin
      ? [
          { href: "/admin", label: "Admin" },
          { href: "/admin/users", label: "Users" },
        ]
      : []),
  ];
  const accountLabel = viewer ? "Account" : "Sign in";

  return (
    <header className="sticky top-0 z-40 border-b border-ascend-navy/10 bg-white/90 shadow-[0_10px_30px_-22px_rgba(22,48,87,0.7)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Link href="/" aria-label="Ascend Services home" className="shrink-0 rounded-xl">
          <BrandLogo height={48} priority />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-3 lg:flex">
          <div className="flex flex-wrap items-center gap-1 rounded-full bg-ascend-bg p-1 ring-1 ring-ascend-navy/10">
            {links.map((item) => (
              <NavLink key={item.href} href={item.href} current={isCurrent(pathname, item.href)}>
                {item.label}
              </NavLink>
            ))}
          </div>
          <SignInLink current={isCurrent(pathname, "/signin")} label={accountLabel} />
        </nav>

        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full bg-ascend-navy px-3.5 py-2 text-sm font-semibold text-white lg:hidden"
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MenuIcon open={menuOpen} />
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>

      {menuOpen ? (
        <nav id="site-menu" aria-label="Primary" className="border-t border-ascend-navy/10 bg-white px-4 py-3 lg:hidden">
          <ul className="mx-auto grid max-w-6xl gap-1">
            <li>
              <MobileLink href="/" current={pathname === "/"}>
                Home
              </MobileLink>
            </li>
            {links.map((item) => (
              <li key={item.href}>
                <MobileLink href={item.href} current={isCurrent(pathname, item.href)}>
                  {item.label}
                </MobileLink>
              </li>
            ))}
            <li>
              <MobileLink href="/signin" current={isCurrent(pathname, "/signin")}>
                {accountLabel}
              </MobileLink>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
        current
          ? "bg-white text-ascend-navy shadow-sm ring-1 ring-ascend-navy/10"
          : "text-ascend-navy/75 hover:bg-white/70 hover:text-ascend-navy"
      }`}
    >
      {children}
    </Link>
  );
}

function SignInLink({ current, label }: { current: boolean; label: string }) {
  return (
    <Link
      href="/signin"
      aria-current={current ? "page" : undefined}
      className={`rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm ${
        current ? "bg-ascend-navy ring-2 ring-ascend-sky" : "ascend-gradient"
      }`}
    >
      {label}
    </Link>
  );
}

function MobileLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`block rounded-2xl px-4 py-3 text-base font-semibold ${
        current ? "bg-ascend-navy text-white" : "text-ascend-navy hover:bg-ascend-bg"
      }`}
    >
      {children}
    </Link>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      {open ? (
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}
