export interface IdentityRepository {
  /** Atomically returns the next sequence value for a given kind, starting at 1. Must be safe under concurrent callers -- two devices enrolling at the same instant must never receive the same DEV- number. `kind` is free-form (see types.ts) -- the repository doesn't need to know a kind in advance to serve it; an UPSERT-style atomic increment initializes an unseen kind's counter to 1 on first use rather than requiring it to be pre-declared. */
  nextSequenceValue(kind: string): Promise<number>;
}
