/**
 * Postgres implementation of Platform-Services/FeatureFlags's
 * FeatureFlagsRepository port. Same offline caveat as the other *.pg.ts
 * files in this folder: type-checked against pg's documented API, not
 * executed against a live database in this session.
 */
import type { Pool } from "pg";
import type { FeatureFlagsRepository } from "../../FeatureFlags/src/repository.js";
import type { FeatureFlag } from "../../FeatureFlags/src/types.js";

export class PgFeatureFlagsRepository implements FeatureFlagsRepository {
  constructor(private readonly pool: Pool) {}

  async createFlag(flag: FeatureFlag): Promise<void> {
    await this.pool.query(
      `INSERT INTO feature_flags (id, key, description, enabled, rollout_percentage, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [flag.id, flag.key, flag.description, flag.enabled, flag.rolloutPercentage, flag.createdAt, flag.updatedAt],
    );
  }

  async getFlagByKey(key: string): Promise<FeatureFlag | null> {
    const { rows } = await this.pool.query(`SELECT * FROM feature_flags WHERE key = $1`, [key]);
    return rows[0] ? mapFlag(rows[0]) : null;
  }

  async listFlags(): Promise<FeatureFlag[]> {
    const { rows } = await this.pool.query(`SELECT * FROM feature_flags ORDER BY key`);
    return rows.map(mapFlag);
  }

  async updateFlag(flag: FeatureFlag): Promise<void> {
    await this.pool.query(
      `UPDATE feature_flags
          SET description = $2, enabled = $3, rollout_percentage = $4, updated_at = $5
        WHERE id = $1`,
      [flag.id, flag.description, flag.enabled, flag.rolloutPercentage, flag.updatedAt],
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFlag(row: any): FeatureFlag {
  return {
    id: row.id,
    key: row.key,
    description: row.description,
    enabled: row.enabled,
    rolloutPercentage: row.rollout_percentage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
