/**
 * Cookie that ties a browser to the server-side challenge row for the WebAuthn
 * ceremony it is in the middle of. It carries an opaque row id and nothing else
 * — no challenge, no identity — and is cleared as soon as the ceremony ends.
 */
import type { NextResponse } from "next/server";

import { getAuthConfig } from "../config";

export const WEBAUTHN_CEREMONY_COOKIE_NAME = "ascend_webauthn";

export interface CeremonyCookieOptions {
  httpOnly: true;
  /**
   * `strict`: the ceremony cookie is only ever read by a same-origin `fetch`
   * from our own sign-in page, never by a top-level navigation, so there is no
   * reason to let it ride along on a cross-site request.
   */
  sameSite: "strict";
  path: "/";
  secure: boolean;
  maxAge: number;
}

export function setCeremonyCookie<T extends NextResponse>(
  response: T,
  ceremonyId: string,
  { expiresAt }: { expiresAt: Date },
): T {
  const maxAge = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
  response.cookies.set(WEBAUTHN_CEREMONY_COOKIE_NAME, ceremonyId, {
    ...baseOptions(),
    maxAge,
  });
  return response;
}

export function clearCeremonyCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(WEBAUTHN_CEREMONY_COOKIE_NAME, "", {
    ...baseOptions(),
    maxAge: 0,
  });
  return response;
}

function baseOptions(): Omit<CeremonyCookieOptions, "maxAge"> {
  return {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: getAuthConfig().cookieSecure,
  };
}
