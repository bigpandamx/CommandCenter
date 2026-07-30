import { hashSecret, randomToken, verifySecret } from "./secretHashing.js";

/**
 * Device API keys authenticate an enrolled Aegis desktop install to Command
 * Center on every check-in / telemetry / update call. Keys are shown to the
 * device exactly once (at enrollment) and stored server-side only as a
 * salted scrypt hash -- never in plaintext.
 *
 * Format of the printable key: "dk_<deviceId short>_<32 random bytes b64url>"
 * The prefix is not secret; it exists purely so leaked-credential scanners
 * (e.g. GitHub secret scanning) can pattern-match it, and so ops can eyeball
 * logs without decoding base64.
 */

const KEY_PREFIX = "dk";
const RANDOM_BYTES = 32;

export interface GeneratedDeviceKey {
  /** Plaintext key -- return this to the caller exactly once, never persist it. */
  plaintext: string;
  /** Salted hash safe to store in the database. */
  hash: string;
}

export function generateDeviceKey(deviceIdPrefix: string): GeneratedDeviceKey {
  const shortId = deviceIdPrefix.slice(0, 8);
  const secret = randomToken(RANDOM_BYTES);
  const plaintext = `${KEY_PREFIX}_${shortId}_${secret}`;
  return {
    plaintext,
    hash: hashDeviceKey(plaintext),
  };
}

export function hashDeviceKey(plaintextKey: string): string {
  return hashSecret(plaintextKey);
}

export function verifyDeviceKey(plaintextKey: string, storedHash: string): boolean {
  return verifySecret(plaintextKey, storedHash);
}

/** Basic shape check before hitting the DB -- rejects obviously-malformed keys cheaply. */
export function isWellFormedDeviceKey(candidate: string): boolean {
  return /^dk_[A-Za-z0-9_-]{6,10}_[A-Za-z0-9_-]{40,50}$/.test(candidate);
}

