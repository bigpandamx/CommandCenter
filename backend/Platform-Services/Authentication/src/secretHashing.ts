import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Generic salted-scrypt hash/verify, used for anything that needs "store a
 * hash, verify a plaintext against it, never store the plaintext" -- device
 * API keys, staff passwords, staff session tokens. Do not reimplement this
 * per-domain; the domain-specific modules (deviceAuth.ts, staffAuth.ts)
 * should call into this one.
 */

const SCRYPT_KEYLEN = 64;

export function hashSecret(plaintext: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plaintext, salt, SCRYPT_KEYLEN);
  // Store salt alongside the hash so verification doesn't need a separate column.
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifySecret(plaintext: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const saltHex = parts[1] as string;
  const hashHex = parts[2] as string;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plaintext, salt, expected.length);

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function toBase64Url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function randomToken(byteLength: number): string {
  return toBase64Url(randomBytes(byteLength));
}

/**
 * Generates and parses tokens of the shape `<prefix>_<uuid>_<secret>` --
 * the pattern used by staff sessions (sess_...) and, as of this module,
 * service account keys (svc_...). Embedding the UUID lets a caller look
 * up the owning record directly instead of needing a secondary index.
 *
 * parsePrefixedToken is anchored on the UUID's fixed shape rather than a
 * naive split("_") -- the random secret portion is base64url, which can
 * itself contain "_", so a plain split can silently misparse a valid
 * token. This exact bug was found and fixed in staff session parsing
 * earlier in this project; extracting it here means every future
 * prefixed-token format gets the fix for free instead of re-risking it.
 */
export function generatePrefixedToken(
  prefix: string,
  id: string,
  secretByteLength: number,
): string {
  return `${prefix}_${id}_${randomToken(secretByteLength)}`;
}

export function parsePrefixedToken(token: string, prefix: string): string | null {
  const pattern = new RegExp(
    `^${prefix}_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(.+)$`,
  );
  const match = pattern.exec(token);
  return match ? (match[1] as string) : null;
}
