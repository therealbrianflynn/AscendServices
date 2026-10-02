/**
 * Minimal software authenticator for tests.
 *
 * It produces real WebAuthn responses — real P-256 keys, real CBOR, real
 * ECDSA signatures — so the passkey tests exercise the actual verification
 * path in `@simplewebauthn/server` instead of a stubbed `verified: true`.
 * Only the `none` attestation format is supported, which is what the
 * application asks authenticators for.
 */
import {
  createHash,
  createSign,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";

import { isoCBOR } from "@simplewebauthn/server/helpers";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

const AAGUID_BYTES = 16;

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_CREDENTIAL_DATA = 0x40;

/** COSE key parameters for an ES256 (ECDSA P-256 + SHA-256) credential. */
const COSE_KTY_EC2 = 2;
const COSE_CRV_P256 = 1;
const COSE_ALG_ES256 = -7;

export interface CeremonyContext {
  challenge: string;
  rpId: string;
  origin: string;
}

export interface SoftwareAuthenticatorOptions {
  transports?: string[];
  /** Base64URL user handle returned with assertions (the `User.id` as UTF-8). */
  userHandle?: string;
}

export class SoftwareAuthenticator {
  readonly credentialId: string;
  private readonly privateKey: KeyObject;
  private readonly coseKey: Uint8Array;
  private readonly transports: string[];
  private readonly userHandle?: string;
  private signCount = 0;

  constructor({ transports = ["internal"], userHandle }: SoftwareAuthenticatorOptions = {}) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    this.privateKey = privateKey;
    this.coseKey = encodeCoseKey(publicKey);
    this.credentialId = base64url(randomCredentialId());
    this.transports = transports;
    this.userHandle = userHandle;
  }

  /** Response to `navigator.credentials.create()`. */
  register(context: CeremonyContext): RegistrationResponseJSON {
    const clientDataJSON = buildClientData("webauthn.create", context);
    const authData = this.buildAuthData(context.rpId, {
      includeAttestedCredentialData: true,
    });
    const attestationObject = isoCBOR.encode(
      new Map<unknown, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]) as never,
    );

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: base64url(clientDataJSON),
        attestationObject: base64url(attestationObject),
        transports: this.transports as RegistrationResponseJSON["response"]["transports"],
      },
    };
  }

  /** Response to `navigator.credentials.get()`. */
  authenticate(context: CeremonyContext): AuthenticationResponseJSON {
    this.signCount += 1;
    const clientDataJSON = buildClientData("webauthn.get", context);
    const authData = this.buildAuthData(context.rpId, {
      includeAttestedCredentialData: false,
    });
    const signedData = concat(authData, sha256(clientDataJSON));

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: base64url(clientDataJSON),
        authenticatorData: base64url(authData),
        signature: base64url(this.sign(signedData)),
        ...(this.userHandle ? { userHandle: this.userHandle } : {}),
      },
    };
  }

  /** Simulates a cloned authenticator whose counter fails to advance. */
  rewindSignCount(to: number): void {
    this.signCount = to;
  }

  private buildAuthData(
    rpId: string,
    { includeAttestedCredentialData }: { includeAttestedCredentialData: boolean },
  ): Uint8Array {
    let flags = FLAG_USER_PRESENT | FLAG_USER_VERIFIED;
    if (includeAttestedCredentialData) flags |= FLAG_ATTESTED_CREDENTIAL_DATA;

    const header = concat(
      sha256(new TextEncoder().encode(rpId)),
      Uint8Array.of(flags),
      uint32(this.signCount),
    );
    if (!includeAttestedCredentialData) return header;

    const rawCredentialId = fromBase64url(this.credentialId);
    return concat(
      header,
      new Uint8Array(AAGUID_BYTES),
      uint16(rawCredentialId.byteLength),
      rawCredentialId,
      this.coseKey,
    );
  }

  private sign(data: Uint8Array): Uint8Array {
    // WebAuthn ES256 signatures are ASN.1 DER, which is Node's default output.
    const signer = createSign("SHA256");
    signer.update(data);
    signer.end();
    return new Uint8Array(signer.sign(this.privateKey));
  }
}

function encodeCoseKey(publicKey: KeyObject): Uint8Array {
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  return isoCBOR.encode(
    new Map<unknown, unknown>([
      [1, COSE_KTY_EC2],
      [3, COSE_ALG_ES256],
      [-1, COSE_CRV_P256],
      [-2, fromBase64url(jwk.x)],
      [-3, fromBase64url(jwk.y)],
    ]) as never,
  );
}

function buildClientData(
  type: "webauthn.create" | "webauthn.get",
  { challenge, origin }: CeremonyContext,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({ type, challenge, origin, crossOrigin: false }),
  );
}

function randomCredentialId(): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function uint16(value: number): Uint8Array {
  return Uint8Array.of((value >> 8) & 0xff, value & 0xff);
}

function uint32(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

export function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function fromBase64url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}
