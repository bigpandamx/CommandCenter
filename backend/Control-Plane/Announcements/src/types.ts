/**
 * Staff-authored broadcast announcements, scoped by audience. Genuinely
 * new -- Aegis's own `Notification` model (backend/app/models/notification.py)
 * is per-user, per-org (a personal inbox: "your model was flagged"),
 * correctly staying in Aegis. Nothing in Aegis is a broadcast/banner
 * system, so there's nothing to migrate or adapt here, unlike most of
 * what's been built this session.
 *
 * Two audiences share one model rather than being two separate features,
 * because the lifecycle (draft -> published -> archived, optional
 * expiry) and the authoring flow are identical regardless of who sees
 * the result -- only the read-side filtering differs:
 *   - "staff": shown in the admin portal only (e.g. "compliance
 *     ingestion will be down for maintenance", "new agent capability
 *     added").
 *   - "customers": meant for eventual distribution to Aegis, for
 *     Aegis's own UI to show org users (e.g. "new threat pattern
 *     detected", "scheduled maintenance"). The distribution endpoint is
 *     built this round (mirroring Compliance's updates-distribution
 *     pattern); nothing in Aegis calls it yet, same "Command Center's
 *     side is ready, Aegis-side wiring is separate" situation as
 *     everything else cross-service this session.
 *   - "all": both.
 */

export type AnnouncementAudience = "staff" | "customers" | "all";
export type AnnouncementSeverity = "info" | "warning" | "critical";
export type AnnouncementStatus = "draft" | "published" | "archived";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  severity: AnnouncementSeverity;
  status: AnnouncementStatus;
  createdByStaffId: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  /** Set by scheduleAnnouncementPublish, cleared by publishAnnouncement/unscheduleAnnouncementPublish -- when a draft should auto-publish. Null means no schedule: either never scheduled, or already published/archived. A schedule only ever applies to a draft; a published or archived announcement has no meaningful "publish later" left to do. */
  scheduledPublishAt: Date | null;
  /** Optional -- an announcement with no expiry stays active until archived. */
  expiresAt: Date | null;
  /**
   * Null means a true broadcast to the given audience, exactly as
   * before this field existed. Non-null scopes this specific
   * announcement to one organization, in addition to its audience
   * filter -- what Impact Assessment's Distribution stage uses to
   * create alerts that reach only the organizations an obligation
   * actually affects, not every "customers"-audience reader. Not part
   * of UpdateAnnouncementInput -- who this was created for isn't
   * meant to be re-targeted after the fact via a generic edit.
   */
  organizationId: string | null;
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  severity?: AnnouncementSeverity;
  expiresAt?: Date | null;
  organizationId?: string | null;
}

export interface UpdateAnnouncementInput {
  title?: string;
  body?: string;
  audience?: AnnouncementAudience;
  severity?: AnnouncementSeverity;
  expiresAt?: Date | null;
}

export interface AnnouncementSearchQuery {
  status?: AnnouncementStatus;
  audience?: AnnouncementAudience;
  limit?: number;
}

/**
 * A staff member has seen and dismissed a given announcement in the
 * admin-portal banner. Deliberately staff-only: the "customers"
 * audience is read by Aegis's backend on behalf of its own org users,
 * who aren't staff identities Command Center has any record of --
 * per-user read/dismiss tracking for that audience is Aegis's own
 * concern, matching how Aegis already owns its own Notification model
 * for exactly this kind of per-user state.
 */
export interface AnnouncementAcknowledgment {
  announcementId: string;
  staffUserId: string;
  acknowledgedAt: Date;
}
