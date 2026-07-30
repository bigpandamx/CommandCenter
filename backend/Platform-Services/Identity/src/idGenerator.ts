import type { IdentityRepository } from "./identityRepository.js";
import type { ParsedId } from "./types.js";

const SEQUENCE_WIDTH = 8;
/** 2-4 uppercase letters -- matches every kind in COMMON_KINDS, permissive enough for a future 2- or 4-letter prefix without needing this pattern touched. Runtime-validated, not a closed compile-time union -- see types.ts's module doc comment for why. */
const KIND_PATTERN = /^[A-Z]{2,4}$/;

export class IdentityError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_kind",
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

function assertValidKind(kind: string): void {
  if (!KIND_PATTERN.test(kind)) {
    throw new IdentityError(`Invalid id kind "${kind}" -- must be 2-4 uppercase letters (e.g. "TKT")`, "invalid_kind");
  }
}

/** Pure formatting -- given a kind and a sequence number you already have, produce e.g. "TKT-00129283". Separated from generateDisplayId so formatting logic is testable without a repository. */
export function formatDisplayId(kind: string, sequence: number): string {
  assertValidKind(kind);
  if (sequence < 1 || !Number.isInteger(sequence)) {
    throw new RangeError(`sequence must be a positive integer, got ${sequence}`);
  }
  return `${kind}-${String(sequence).padStart(SEQUENCE_WIDTH, "0")}`;
}

/**
 * Parses a display ID back into its kind and sequence. Returns null for
 * anything malformed rather than throwing -- callers (e.g. a staff
 * search box someone might paste a ticket number into) should treat an
 * invalid-looking ID as "not found," not a crash. Only validates the
 * ID's own shape (kind pattern + digits) -- it does NOT check whether
 * `kind` is a "known" one, since Identity no longer maintains a closed
 * registry of valid kinds (see types.ts).
 */
export function parseDisplayId(displayId: string): ParsedId | null {
  const match = /^([A-Z]{2,4})-(\d{8,})$/.exec(displayId);
  if (!match) return null;
  const [, kind, sequenceStr] = match;
  if (!kind) return null;
  return { kind, sequence: Number(sequenceStr) };
}

/** Atomically claims the next sequence value for `kind` and formats it. This is the one function real creation flows (createTicket, and eventually others) actually call. */
export async function generateDisplayId(repo: IdentityRepository, kind: string): Promise<string> {
  assertValidKind(kind);
  const sequence = await repo.nextSequenceValue(kind);
  return formatDisplayId(kind, sequence);
}
