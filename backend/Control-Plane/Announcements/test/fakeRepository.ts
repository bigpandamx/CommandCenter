import type { AnnouncementsRepository } from "../src/repository.js";
import type { Announcement, AnnouncementAudience, AnnouncementSearchQuery } from "../src/types.js";

export class FakeAnnouncementsRepository implements AnnouncementsRepository {
  announcements = new Map<string, Announcement>();
  acknowledgments = new Set<string>(); // key: `${announcementId}|${staffUserId}`

  async createAnnouncement(announcement: Announcement) {
    this.announcements.set(announcement.id, announcement);
  }

  async getAnnouncementById(id: string) {
    return this.announcements.get(id) ?? null;
  }

  async updateAnnouncement(announcement: Announcement) {
    this.announcements.set(announcement.id, announcement);
  }

  async searchAnnouncements(query: AnnouncementSearchQuery) {
    let matches = [...this.announcements.values()];
    if (query.status) matches = matches.filter((a) => a.status === query.status);
    if (query.audience) matches = matches.filter((a) => a.audience === query.audience);
    matches = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return query.limit ? matches.slice(0, query.limit) : matches;
  }

  async listActiveAnnouncements(audience: AnnouncementAudience, now: Date, since?: Date, organizationId?: string) {
    const matchesAudience = (a: Announcement) => a.audience === audience || a.audience === "all";
    const matchesOrg = (a: Announcement) =>
      a.organizationId === null || (organizationId !== undefined && a.organizationId === organizationId);
    return [...this.announcements.values()]
      .filter(
        (a) =>
          a.status === "published" &&
          matchesAudience(a) &&
          matchesOrg(a) &&
          (a.expiresAt === null || a.expiresAt.getTime() > now.getTime()) &&
          (since === undefined || (a.publishedAt !== null && a.publishedAt.getTime() >= since.getTime())),
      )
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  }

  async listDueScheduledAnnouncements(now: Date) {
    return [...this.announcements.values()].filter(
      (a) => a.status === "draft" && a.scheduledPublishAt !== null && a.scheduledPublishAt.getTime() <= now.getTime(),
    );
  }

  async acknowledgeAnnouncement(announcementId: string, staffUserId: string, _now: Date) {
    this.acknowledgments.add(`${announcementId}|${staffUserId}`);
  }

  async getAcknowledgedAnnouncementIds(staffUserId: string) {
    const ids = new Set<string>();
    for (const key of this.acknowledgments) {
      const [announcementId, forStaffId] = key.split("|");
      if (forStaffId === staffUserId && announcementId) ids.add(announcementId);
    }
    return ids;
  }
}
