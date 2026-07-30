import { randomUUID } from "node:crypto";
import type { AnnouncementsRepository } from "./repository.js";
import type {
  Announcement,
  AnnouncementAudience,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "./types.js";

export class AnnouncementError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "invalid_input" | "invalid_status_transition",
  ) {
    super(message);
    this.name = "AnnouncementError";
  }
}

const DEFAULT_SEVERITY = "info";

function validate(input: { title?: string; body?: string; expiresAt?: Date | null }, now: Date): void {
  if (input.title !== undefined && input.title.trim().length === 0) {
    throw new AnnouncementError("title must not be empty", "invalid_input");
  }
  if (input.body !== undefined && input.body.trim().length === 0) {
    throw new AnnouncementError("body must not be empty", "invalid_input");
  }
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
    throw new AnnouncementError("expiresAt must be in the future", "invalid_input");
  }
}

/** Always starts as a draft -- publishing is a separate, explicit step (publishAnnouncement), not something create does implicitly. A typo caught before anyone's seen it shouldn't require archiving and recreating. */
export async function createAnnouncement(
  repo: AnnouncementsRepository,
  input: CreateAnnouncementInput,
  createdByStaffId: string,
  now: Date = new Date(),
): Promise<Announcement> {
  validate(input, now);

  const announcement: Announcement = {
    id: randomUUID(),
    title: input.title.trim(),
    body: input.body.trim(),
    audience: input.audience,
    severity: input.severity ?? DEFAULT_SEVERITY,
    status: "draft",
    createdByStaffId,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    scheduledPublishAt: null,
    expiresAt: input.expiresAt ?? null,
    organizationId: input.organizationId ?? null,
  };

  await repo.createAnnouncement(announcement);
  return announcement;
}

async function getExistingOrThrow(repo: AnnouncementsRepository, id: string): Promise<Announcement> {
  const existing = await repo.getAnnouncementById(id);
  if (!existing) {
    throw new AnnouncementError(`Unknown announcement: ${id}`, "not_found");
  }
  return existing;
}

/** Editing is allowed for a draft OR a still-published announcement (fixing a typo after publishing is a normal, expected need) -- not for an archived one, since there's nothing left to correct a reader's view of. */
export async function updateAnnouncement(
  repo: AnnouncementsRepository,
  id: string,
  input: UpdateAnnouncementInput,
  now: Date = new Date(),
): Promise<Announcement> {
  const existing = await getExistingOrThrow(repo, id);
  if (existing.status === "archived") {
    throw new AnnouncementError("Cannot edit an archived announcement", "invalid_status_transition");
  }
  validate(input, now);

  const updated: Announcement = {
    ...existing,
    title: input.title !== undefined ? input.title.trim() : existing.title,
    body: input.body !== undefined ? input.body.trim() : existing.body,
    audience: input.audience ?? existing.audience,
    severity: input.severity ?? existing.severity,
    expiresAt: input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt,
    updatedAt: now,
  };
  await repo.updateAnnouncement(updated);
  return updated;
}

export async function publishAnnouncement(
  repo: AnnouncementsRepository,
  id: string,
  now: Date = new Date(),
): Promise<Announcement> {
  const existing = await getExistingOrThrow(repo, id);
  if (existing.status !== "draft") {
    throw new AnnouncementError(
      `Cannot publish an announcement that is currently "${existing.status}" -- only a draft can be published`,
      "invalid_status_transition",
    );
  }

  const updated: Announcement = { ...existing, status: "published", publishedAt: now, scheduledPublishAt: null, updatedAt: now };
  await repo.updateAnnouncement(updated);
  return updated;
}

/**
 * The Distribution Center's "Tomorrow" and "Schedule" options -- both
 * call this, differing only in what `publishAt` the UI computes ("same
 * time tomorrow" vs. whatever a staff member picked). Only valid for a
 * draft, same as publishAnnouncement itself -- there's nothing to
 * schedule for something already published or archived.
 */
export async function scheduleAnnouncementPublish(
  repo: AnnouncementsRepository,
  id: string,
  publishAt: Date,
  now: Date = new Date(),
): Promise<Announcement> {
  const existing = await getExistingOrThrow(repo, id);
  if (existing.status !== "draft") {
    throw new AnnouncementError(
      `Cannot schedule an announcement that is currently "${existing.status}" -- only a draft can be scheduled`,
      "invalid_status_transition",
    );
  }
  if (publishAt.getTime() <= now.getTime()) {
    throw new AnnouncementError("scheduledPublishAt must be in the future", "invalid_input");
  }

  const updated: Announcement = { ...existing, scheduledPublishAt: publishAt, updatedAt: now };
  await repo.updateAnnouncement(updated);
  return updated;
}

/** The Distribution Center's "Draft" option, when applied to something already scheduled -- reverts to a plain, unscheduled draft. Idempotent: clearing a schedule that isn't set is a no-op, not an error, same reasoning as acknowledgeAnnouncement's own idempotency. */
export async function unscheduleAnnouncementPublish(
  repo: AnnouncementsRepository,
  id: string,
  now: Date = new Date(),
): Promise<Announcement> {
  const existing = await getExistingOrThrow(repo, id);
  if (existing.scheduledPublishAt === null) {
    return existing;
  }
  const updated: Announcement = { ...existing, scheduledPublishAt: null, updatedAt: now };
  await repo.updateAnnouncement(updated);
  return updated;
}

/**
 * Intended to run periodically (e.g. every few minutes) -- not built
 * as an actual live cron/timer here, same "not yet done" tier as
 * Compliance's own runComplianceIngestion and the telemetry retention
 * job. Whoever deploys this just needs to call
 * publishDueScheduledAnnouncements(repo) on a schedule; a staff-facing
 * manual trigger route also exists (POST /v1/admin/announcements/publish-due)
 * for use before that's wired up, or to force an immediate check.
 *
 * One failure doesn't stop the batch -- same "a stuck record shouldn't
 * block everything else due" reasoning as
 * analyzeUnanalyzedUpdates/distributeObligationImpact.
 */
export interface ScheduledPublishResult {
  announcementId: string;
  status: "published" | "error";
  error: string | null;
}

export async function publishDueScheduledAnnouncements(
  repo: AnnouncementsRepository,
  now: Date = new Date(),
): Promise<ScheduledPublishResult[]> {
  const due = await repo.listDueScheduledAnnouncements(now);
  const results: ScheduledPublishResult[] = [];
  for (const announcement of due) {
    try {
      await publishAnnouncement(repo, announcement.id, now);
      results.push({ announcementId: announcement.id, status: "published", error: null });
    } catch (err) {
      results.push({
        announcementId: announcement.id,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

/** Archiving is valid from draft (cancel something that was never published) or published (retire something live) -- not from archived again. */
export async function archiveAnnouncement(
  repo: AnnouncementsRepository,
  id: string,
  now: Date = new Date(),
): Promise<Announcement> {
  const existing = await getExistingOrThrow(repo, id);
  if (existing.status === "archived") {
    throw new AnnouncementError("Announcement is already archived", "invalid_status_transition");
  }

  const updated: Announcement = { ...existing, status: "archived", updatedAt: now };
  await repo.updateAnnouncement(updated);
  return updated;
}

export async function listActiveAnnouncementsFor(
  repo: AnnouncementsRepository,
  audience: AnnouncementAudience,
  now: Date = new Date(),
  since?: Date,
  organizationId?: string,
): Promise<Announcement[]> {
  return repo.listActiveAnnouncements(audience, now, since, organizationId);
}

/**
 * Idempotent -- acknowledging something already acknowledged is a
 * no-op, not an error. A staff member re-loading a page and the client
 * firing the dismiss request twice (a slow network retry, a double
 * click) shouldn't need special handling on the caller's part.
 */
export async function acknowledgeAnnouncement(
  repo: AnnouncementsRepository,
  announcementId: string,
  staffUserId: string,
  now: Date = new Date(),
): Promise<void> {
  const existing = await getExistingOrThrow(repo, announcementId);
  void existing; // confirms the announcement actually exists before recording an ack against it
  await repo.acknowledgeAnnouncement(announcementId, staffUserId, now);
}

/**
 * What the admin-portal banner actually renders: active staff-audience
 * announcements this specific staff member hasn't dismissed yet. Not
 * the same as listActiveAnnouncementsFor("staff", now) -- that returns
 * every active staff announcement regardless of who's already seen it.
 */
export async function listUnacknowledgedAnnouncementsForStaff(
  repo: AnnouncementsRepository,
  staffUserId: string,
  now: Date = new Date(),
): Promise<Announcement[]> {
  const [active, acknowledgedIds] = await Promise.all([
    repo.listActiveAnnouncements("staff", now),
    repo.getAcknowledgedAnnouncementIds(staffUserId),
  ]);
  return active.filter((a) => !acknowledgedIds.has(a.id));
}
