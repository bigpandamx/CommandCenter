import type { Pool } from "pg";
import type { AnnouncementsRepository } from "../../../Control-Plane/Announcements/src/repository.js";
import type { Announcement, AnnouncementAudience, AnnouncementSearchQuery } from "../../../Control-Plane/Announcements/src/types.js";

export class PgAnnouncementsRepository implements AnnouncementsRepository {
  constructor(private readonly pool: Pool) {}

  async createAnnouncement(announcement: Announcement): Promise<void> {
    await this.pool.query(
      `INSERT INTO announcements
         (id, title, body, audience, severity, status, created_by_staff_id, created_at, updated_at, published_at, expires_at, organization_id, scheduled_publish_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        announcement.id,
        announcement.title,
        announcement.body,
        announcement.audience,
        announcement.severity,
        announcement.status,
        announcement.createdByStaffId,
        announcement.createdAt,
        announcement.updatedAt,
        announcement.publishedAt,
        announcement.expiresAt,
        announcement.organizationId,
        announcement.scheduledPublishAt,
      ],
    );
  }

  async getAnnouncementById(id: string): Promise<Announcement | null> {
    const { rows } = await this.pool.query(`SELECT * FROM announcements WHERE id = $1`, [id]);
    return rows[0] ? mapAnnouncement(rows[0]) : null;
  }

  async updateAnnouncement(announcement: Announcement): Promise<void> {
    await this.pool.query(
      `UPDATE announcements SET
         title = $2, body = $3, audience = $4, severity = $5, status = $6,
         updated_at = $7, published_at = $8, expires_at = $9, scheduled_publish_at = $10
       WHERE id = $1`,
      [
        announcement.id,
        announcement.title,
        announcement.body,
        announcement.audience,
        announcement.severity,
        announcement.status,
        announcement.updatedAt,
        announcement.publishedAt,
        announcement.expiresAt,
        announcement.scheduledPublishAt,
      ],
    );
  }

  async searchAnnouncements(query: AnnouncementSearchQuery): Promise<Announcement[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }
    if (query.audience) {
      params.push(query.audience);
      conditions.push(`audience = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 100;
    params.push(limit);
    const { rows } = await this.pool.query(
      `SELECT * FROM announcements ${whereClause} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapAnnouncement);
  }

  async listActiveAnnouncements(audience: AnnouncementAudience, now: Date, since?: Date, organizationId?: string): Promise<Announcement[]> {
    const params: unknown[] = [audience, now];
    let sinceClause = "";
    if (since) {
      params.push(since);
      sinceClause = `AND published_at >= $${params.length}`;
    }
    let orgClause = "AND organization_id IS NULL";
    if (organizationId !== undefined) {
      params.push(organizationId);
      orgClause = `AND (organization_id IS NULL OR organization_id = $${params.length})`;
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM announcements
       WHERE status = 'published'
         AND (audience = $1 OR audience = 'all')
         AND (expires_at IS NULL OR expires_at > $2)
         ${sinceClause}
         ${orgClause}
       ORDER BY published_at DESC`,
      params,
    );
    return rows.map(mapAnnouncement);
  }

  async listDueScheduledAnnouncements(now: Date): Promise<Announcement[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM announcements
       WHERE status = 'draft' AND scheduled_publish_at IS NOT NULL AND scheduled_publish_at <= $1
       ORDER BY scheduled_publish_at ASC`,
      [now],
    );
    return rows.map(mapAnnouncement);
  }

  async acknowledgeAnnouncement(announcementId: string, staffUserId: string, now: Date): Promise<void> {
    await this.pool.query(
      `INSERT INTO announcement_acknowledgments (announcement_id, staff_user_id, acknowledged_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (announcement_id, staff_user_id) DO NOTHING`,
      [announcementId, staffUserId, now],
    );
  }

  async getAcknowledgedAnnouncementIds(staffUserId: string): Promise<Set<string>> {
    const { rows } = await this.pool.query(
      `SELECT announcement_id FROM announcement_acknowledgments WHERE staff_user_id = $1`,
      [staffUserId],
    );
    return new Set(rows.map((r) => r.announcement_id as string));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAnnouncement(row: any): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    severity: row.severity,
    status: row.status,
    createdByStaffId: row.created_by_staff_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    organizationId: row.organization_id,
    scheduledPublishAt: row.scheduled_publish_at,
  };
}
