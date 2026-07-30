import { createAnnouncement } from "../../Announcements/src/announcementService.js";
import type { AnnouncementsRepository } from "../../Announcements/src/repository.js";
import type { Announcement } from "../../Announcements/src/types.js";
import type { PublishableIntelligence } from "./types.js";

/**
 * The one call every analysis domain makes. Creates a draft -- never
 * published directly -- same "publishing is a separate, explicit step"
 * discipline createAnnouncement itself already enforces, now guaranteed
 * for every domain that routes through here rather than re-decided per
 * domain. A staff member reviews and decides Publish Immediately /
 * Tomorrow / Schedule / stay Draft via the existing Distribution Center
 * UI -- unchanged by this module, since Publishing produces exactly
 * the same Announcement rows Distribution Center already knows how to
 * show.
 *
 * createdByStaffId is required even for system-triggered publishing
 * (e.g. a scheduled sweep, an automated advisory-generation run) --
 * matching Compliance's own distributeObligationImpact convention:
 * attribution is who INITIATED the action (clicked "Distribute,"
 * clicked "Generate Advisory"), not a claim that a human wrote the
 * content by hand.
 */
export async function packageAndDistribute(
  announcementsRepo: AnnouncementsRepository,
  item: PublishableIntelligence,
  createdByStaffId: string,
  now: Date = new Date(),
): Promise<Announcement> {
  return createAnnouncement(
    announcementsRepo,
    {
      title: item.title,
      body: item.body,
      severity: item.severity,
      audience: item.audience,
      organizationId: item.organizationId,
    },
    createdByStaffId,
    now,
  );
}
