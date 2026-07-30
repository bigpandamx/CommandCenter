/**
 * Postgres implementation of Platform-Services/Authentication's
 * ServiceAccountRepository port. Same offline caveat as every other
 * *.pg.ts file in this folder: type-checked against pg's documented API,
 * not executed against a live database in this session.
 */
import type { Pool } from "pg";
import type { ServiceAccountRepository } from "../../Authentication/src/serviceAccountRepository.js";
import type { ServiceAccount } from "../../Authentication/src/serviceAccountTypes.js";

export class PgServiceAccountRepository implements ServiceAccountRepository {
  constructor(private readonly pool: Pool) {}

  async createServiceAccount(account: ServiceAccount): Promise<void> {
    await this.pool.query(
      `INSERT INTO service_accounts
         (id, name, description, api_key_hash, scopes, status, last_used_at, created_at, revoked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        account.id,
        account.name,
        account.description,
        account.apiKeyHash,
        account.scopes,
        account.status,
        account.lastUsedAt,
        account.createdAt,
        account.revokedAt,
      ],
    );
  }

  async getServiceAccountById(id: string): Promise<ServiceAccount | null> {
    const { rows } = await this.pool.query(`SELECT * FROM service_accounts WHERE id = $1`, [id]);
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  async listServiceAccounts(): Promise<ServiceAccount[]> {
    const { rows } = await this.pool.query(`SELECT * FROM service_accounts ORDER BY created_at DESC`);
    return rows.map(mapAccount);
  }

  async updateServiceAccount(account: ServiceAccount): Promise<void> {
    await this.pool.query(
      `UPDATE service_accounts SET
         name = $2, description = $3, api_key_hash = $4, scopes = $5, status = $6,
         last_used_at = $7, revoked_at = $8
       WHERE id = $1`,
      [
        account.id,
        account.name,
        account.description,
        account.apiKeyHash,
        account.scopes,
        account.status,
        account.lastUsedAt,
        account.revokedAt,
      ],
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAccount(row: any): ServiceAccount {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    apiKeyHash: row.api_key_hash,
    scopes: row.scopes,
    status: row.status,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}
