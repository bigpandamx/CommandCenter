/**
 * Postgres implementation of Platform-Services/Identity's
 * IdentityRepository port. Same offline caveat as the other *.pg.ts
 * files in this folder: type-checked against pg's documented API, not
 * executed against a live database in this session.
 *
 * One statement claims the next value whether `kind` has been seen
 * before or not, with no separate "does this kind exist yet" check
 * (which would itself be a race under concurrent callers). The
 * arithmetic works out the same on both paths -- worth spelling out
 * since it's not obvious from the SQL alone:
 *   - Unseen kind: INSERT sets next_value = 2. Claimed value = 2 - 1 = 1.
 *   - Seen kind (currently N): ON CONFLICT UPDATE sets next_value =
 *     N + 1. Claimed value = (N + 1) - 1 = N -- i.e. exactly the value
 *     that was about to be handed out.
 * In both cases, claimed = the row's new stored next_value minus one.
 * Postgres row-level locking on the upserted row serializes concurrent
 * claims for the same kind, so two callers claiming DEV- at the same
 * instant can never receive the same number.
 */
import type { Pool } from "pg";
import type { IdentityRepository } from "../../../Platform-Services/Identity/src/identityRepository.js";

export class PgIdentityRepository implements IdentityRepository {
  constructor(private readonly pool: Pool) {}

  async nextSequenceValue(kind: string): Promise<number> {
    const { rows } = await this.pool.query(
      `INSERT INTO id_sequences (kind, next_value) VALUES ($1, 2)
       ON CONFLICT (kind) DO UPDATE SET next_value = id_sequences.next_value + 1
       RETURNING next_value`,
      [kind],
    );
    return Number(rows[0].next_value) - 1;
  }
}
