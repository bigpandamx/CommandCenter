/**
 * Postgres implementation of Platform-Services/Authentication's
 * StaffAuthRepository port. Backed by staff_users / staff_sessions from
 * 0002_staff_auth.sql. Same offline caveat as the other *.pg.ts files in
 * this folder: type-checked against pg's documented API, not executed
 * against a live database in this session.
 */
import type { Pool } from "pg";
import type { StaffAuthRepository } from "../../Authentication/src/staffAuthRepository.js";
import type { StaffSession, StaffUser } from "../../Authentication/src/staffTypes.js";

export class PgStaffAuthRepository implements StaffAuthRepository {
  constructor(private readonly pool: Pool) {}

  async createStaffUser(user: StaffUser): Promise<void> {
    await this.pool.query(
      `INSERT INTO staff_users (id, email, password_hash, role, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.email, user.passwordHash, user.role, user.status, user.createdAt],
    );
  }

  async getStaffUserByEmail(email: string): Promise<StaffUser | null> {
    const { rows } = await this.pool.query(
      `SELECT id, email, password_hash, role, status, created_at
         FROM staff_users
        WHERE email = $1`,
      [email],
    );
    return rows[0] ? mapStaffUser(rows[0]) : null;
  }

  async getStaffUserById(id: string): Promise<StaffUser | null> {
    const { rows } = await this.pool.query(
      `SELECT id, email, password_hash, role, status, created_at
         FROM staff_users
        WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapStaffUser(rows[0]) : null;
  }

  async listStaffUsers(): Promise<StaffUser[]> {
    const { rows } = await this.pool.query(
      `SELECT id, email, password_hash, role, status, created_at FROM staff_users ORDER BY created_at DESC`,
    );
    return rows.map(mapStaffUser);
  }

  async setStaffUserStatus(id: string, status: StaffUser["status"]): Promise<void> {
    await this.pool.query(`UPDATE staff_users SET status = $2 WHERE id = $1`, [id, status]);
  }

  async createSession(session: StaffSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO staff_sessions (id, staff_user_id, token_hash, created_at, expires_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        session.id,
        session.staffUserId,
        session.tokenHash,
        session.createdAt,
        session.expiresAt,
        session.revokedAt,
      ],
    );
  }

  async getSessionById(id: string): Promise<StaffSession | null> {
    const { rows } = await this.pool.query(
      `SELECT id, staff_user_id, token_hash, created_at, expires_at, revoked_at
         FROM staff_sessions
        WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async revokeSession(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE staff_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
      [id],
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStaffUser(row: any): StaffUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSession(row: any): StaffSession {
  return {
    id: row.id,
    staffUserId: row.staff_user_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}
