"use client";

import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useSyncExternalStore } from "react";

/** WebAuthn support never changes for the life of a page, so nothing to watch. */
const subscribe = () => () => {};

/**
 * Whether this browser can run a WebAuthn ceremony. Rendered optimistically on
 * the server: the passkey button is the primary action, and flashing it away on
 * hydration for the common (supported) case would be worse than the reverse.
 */
export function usePasskeySupport(): boolean {
  return useSyncExternalStore(subscribe, browserSupportsWebAuthn, () => true);
}
