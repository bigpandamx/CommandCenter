import type { Announcement, AnnouncementAudience, AnnouncementSearchQuery } from "./types.js";

export interface AnnouncementsRepository {
  createAnnouncement(announcement: Announcement): Promise<void>;
  getAnnouncementById(id: string): Promise<Announcement | null>;
  updateAnnouncement(announcement: Announcement): Promise<void>;
  searchAnnouncements(query: AnnouncementSearchQuery): Promise<Announcement[]>;
  /** Published, not-yet-expired announcements visible to the given audience -- "staff" sees audience in {staff, all}; "customers" sees {customers, all}. The read path actually used by the admin portal banner and Aegis's distribution pull. `since`, when given, further restricts to announcements published at or after that time -- the efficient-polling cursor matching Compliance's and Threat-Intelligence's distribution endpoints, so a caller checking in periodically only gets what's new since it last asked. `organizationId`, when given, ALSO includes announcements scoped to that specific org (in addition to true broadcasts) -- omitted, only broadcasts are returned, which is what the general admin-portal banner wants (it shouldn't show one-off org-targeted alerts mixed into a general view). */
  listActiveAnnouncements(audience: AnnouncementAudience, now: Date, since?: Date, organizationId?: string): Promise<Announcement[]>;
  /** Drafts with a scheduledPublishAt at or before `now` -- a real, indexed query (see the migration's partial index), not searchAnnouncements({status: "draft"}) filtered in application code, since that would fetch every draft regardless of schedule to find the handful actually due. */
  listDueScheduledAnnouncements(now: Date): Promise<Announcement[]>;

  acknowledgeAnnouncement(announcementId: string, staffUserId: string, now: Date): Promise<void>;
  /** All announcement ids this staff member has acknowledged -- used to filter the banner's "unacknowledged" view. */
  getAcknowledgedAnnouncementIds(staffUserId: string): Promise<Set<string>>;
}
