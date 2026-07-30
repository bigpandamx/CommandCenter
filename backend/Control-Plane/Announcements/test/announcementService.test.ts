import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
  archiveAnnouncement,
  listActiveAnnouncementsFor,
  acknowledgeAnnouncement,
  listUnacknowledgedAnnouncementsForStaff,
  scheduleAnnouncementPublish,
  unscheduleAnnouncementPublish,
  publishDueScheduledAnnouncements,
  AnnouncementError,
} from "../src/announcementService.js";
import { FakeAnnouncementsRepository } from "./fakeRepository.js";

test("createAnnouncement always starts as a draft, never published implicitly", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "Maintenance", body: "Down at 2am", audience: "staff" }, "staff-1");
  assert.equal(a.status, "draft");
  assert.equal(a.publishedAt, null);
});

test("createAnnouncement defaults severity to info", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "staff-1");
  assert.equal(a.severity, "info");
});

test("createAnnouncement rejects an empty title or body", async () => {
  const repo = new FakeAnnouncementsRepository();
  await assert.rejects(
    () => createAnnouncement(repo, { title: "  ", body: "B", audience: "staff" }, "staff-1"),
    (err: unknown) => err instanceof AnnouncementError && err.code === "invalid_input",
  );
  await assert.rejects(
    () => createAnnouncement(repo, { title: "T", body: "  ", audience: "staff" }, "staff-1"),
    (err: unknown) => err instanceof AnnouncementError && err.code === "invalid_input",
  );
});

test("createAnnouncement rejects an expiresAt in the past", async () => {
  const repo = new FakeAnnouncementsRepository();
  const now = new Date("2026-07-21T00:00:00Z");
  await assert.rejects(
    () =>
      createAnnouncement(
        repo,
        { title: "T", body: "B", audience: "staff", expiresAt: new Date("2026-07-20T00:00:00Z") },
        "staff-1",
        now,
      ),
    (err: unknown) => err instanceof AnnouncementError && err.code === "invalid_input",
  );
});

test("publishAnnouncement transitions draft to published and stamps publishedAt", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "staff-1");
  const now = new Date("2026-07-21T12:00:00Z");

  const published = await publishAnnouncement(repo, a.id, now);

  assert.equal(published.status, "published");
  assert.equal(published.publishedAt?.toISOString(), now.toISOString());
});

test("publishAnnouncement rejects publishing an already-published announcement", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "staff-1");
  await publishAnnouncement(repo, a.id);

  await assert.rejects(
    () => publishAnnouncement(repo, a.id),
    (err: unknown) => err instanceof AnnouncementError && err.code === "invalid_status_transition",
  );
});

test("publishAnnouncement rejects publishing an archived announcement", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "staff-1");
  await archiveAnnouncement(repo, a.id);

  await assert.rejects(
    () => publishAnnouncement(repo, a.id),
    (err: unknown) => err instanceof AnnouncementError && err.code === "invalid_status_transition",
  );
});

test("publishAnnouncement throws not_found for an unknown id", async () => {
  const repo = new FakeAnnouncementsRepository();
  await assert.rejects(
    () => publishAnnouncement(repo, "ghost"),
    (err: unknown) => err instanceof AnnouncementError && err.code === "not_found",
  );
});

test("archiveAnnouncement works from draft (cancel something never published)", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "staff-1");
  const archived = await archiveAnnouncement(repo, a.id);
  assert.equal(archived.status, "archived");
});

test("archiveAnnouncement works from published (retire something live)", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "staff-1");
  await publishAnnouncement(repo, a.id);
  const archived = await archiveAnnouncement(repo, a.id);
  assert.equal(archived.status, "archived");
});

test("archiveAnnouncement rejects archiving an already-archived announcement", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "staff-1");
  await archiveAnnouncement(repo, a.id);

  await assert.rejects(
    () => archiveAnnouncement(repo, a.id),
    (err: unknown) => err instanceof AnnouncementError && err.code === "invalid_status_transition",
  );
});

test("updateAnnouncement can edit a draft", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "Old", body: "B", audience: "staff" }, "staff-1");
  const updated = await updateAnnouncement(repo, a.id, { title: "New" });
  assert.equal(updated.title, "New");
});

test("updateAnnouncement can edit a still-published announcement (fixing a typo after publishing is normal)", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "Old", body: "B", audience: "staff" }, "staff-1");
  await publishAnnouncement(repo, a.id);

  const updated = await updateAnnouncement(repo, a.id, { title: "Fixed typo" });
  assert.equal(updated.title, "Fixed typo");
  assert.equal(updated.status, "published", "editing must not revert publication status");
});

test("updateAnnouncement rejects editing an archived announcement", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "staff-1");
  await archiveAnnouncement(repo, a.id);

  await assert.rejects(
    () => updateAnnouncement(repo, a.id, { title: "Nope" }),
    (err: unknown) => err instanceof AnnouncementError && err.code === "invalid_status_transition",
  );
});

test("updateAnnouncement preserves fields not included in a partial update", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff", severity: "critical" }, "staff-1");
  const updated = await updateAnnouncement(repo, a.id, { title: "New title" });
  assert.equal(updated.severity, "critical", "severity should be untouched by a title-only update");
  assert.equal(updated.body, "B");
});

test("listActiveAnnouncementsFor returns only published, non-expired announcements matching the audience", async () => {
  const repo = new FakeAnnouncementsRepository();
  const now = new Date("2026-07-21T12:00:00Z");

  const staffDraft = await createAnnouncement(repo, { title: "Staff draft", body: "B", audience: "staff" }, "s1", now);
  const staffPublished = await createAnnouncement(repo, { title: "Staff live", body: "B", audience: "staff" }, "s1", now);
  await publishAnnouncement(repo, staffPublished.id, now);
  const customerPublished = await createAnnouncement(repo, { title: "Customer live", body: "B", audience: "customers" }, "s1", now);
  await publishAnnouncement(repo, customerPublished.id, now);

  void staffDraft;

  const staffView = await listActiveAnnouncementsFor(repo, "staff", now);
  assert.equal(staffView.length, 1);
  assert.equal(staffView[0]?.title, "Staff live");
});

test("listActiveAnnouncementsFor includes 'all'-audience announcements for both staff and customers", async () => {
  const repo = new FakeAnnouncementsRepository();
  const now = new Date("2026-07-21T12:00:00Z");
  const both = await createAnnouncement(repo, { title: "For everyone", body: "B", audience: "all" }, "s1", now);
  await publishAnnouncement(repo, both.id, now);

  const staffView = await listActiveAnnouncementsFor(repo, "staff", now);
  const customerView = await listActiveAnnouncementsFor(repo, "customers", now);
  assert.equal(staffView.length, 1);
  assert.equal(customerView.length, 1);
});

test("listActiveAnnouncementsFor excludes an announcement whose expiresAt has passed", async () => {
  const repo = new FakeAnnouncementsRepository();
  const publishTime = new Date("2026-07-01T00:00:00Z");
  const a = await createAnnouncement(
    repo,
    { title: "Expiring", body: "B", audience: "staff", expiresAt: new Date("2026-07-10T00:00:00Z") },
    "s1",
    publishTime,
  );
  await publishAnnouncement(repo, a.id, publishTime);

  const beforeExpiry = await listActiveAnnouncementsFor(repo, "staff", new Date("2026-07-05T00:00:00Z"));
  assert.equal(beforeExpiry.length, 1);

  const afterExpiry = await listActiveAnnouncementsFor(repo, "staff", new Date("2026-07-15T00:00:00Z"));
  assert.equal(afterExpiry.length, 0);
});

test("listActiveAnnouncementsFor does not cross audiences -- a customers-only announcement never appears in the staff view", async () => {
  const repo = new FakeAnnouncementsRepository();
  const now = new Date("2026-07-21T12:00:00Z");
  const customerOnly = await createAnnouncement(repo, { title: "Customer only", body: "B", audience: "customers" }, "s1", now);
  await publishAnnouncement(repo, customerOnly.id, now);

  const staffView = await listActiveAnnouncementsFor(repo, "staff", now);
  assert.equal(staffView.length, 0);
});

test("acknowledgeAnnouncement records that a staff member has seen an announcement", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "author-1");
  await publishAnnouncement(repo, a.id);

  await acknowledgeAnnouncement(repo, a.id, "staff-2");

  const ids = await repo.getAcknowledgedAnnouncementIds("staff-2");
  assert.ok(ids.has(a.id));
});

test("acknowledgeAnnouncement is idempotent -- acknowledging twice doesn't error or duplicate", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "author-1");
  await publishAnnouncement(repo, a.id);

  await acknowledgeAnnouncement(repo, a.id, "staff-2");
  await acknowledgeAnnouncement(repo, a.id, "staff-2");

  const ids = await repo.getAcknowledgedAnnouncementIds("staff-2");
  assert.equal(ids.size, 1);
});

test("acknowledgeAnnouncement throws not_found for an unknown announcement", async () => {
  const repo = new FakeAnnouncementsRepository();
  await assert.rejects(
    () => acknowledgeAnnouncement(repo, "ghost", "staff-2"),
    (err: unknown) => err instanceof AnnouncementError && err.code === "not_found",
  );
});

test("acknowledgments are per-staff-member -- one staff acknowledging doesn't affect another's view", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "author-1");
  await publishAnnouncement(repo, a.id);

  await acknowledgeAnnouncement(repo, a.id, "staff-2");

  const staff2Ids = await repo.getAcknowledgedAnnouncementIds("staff-2");
  const staff3Ids = await repo.getAcknowledgedAnnouncementIds("staff-3");
  assert.ok(staff2Ids.has(a.id));
  assert.equal(staff3Ids.has(a.id), false);
});

test("listUnacknowledgedAnnouncementsForStaff excludes announcements this staff member has already dismissed", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a1 = await createAnnouncement(repo, { title: "First", body: "B", audience: "staff" }, "author-1");
  const a2 = await createAnnouncement(repo, { title: "Second", body: "B", audience: "staff" }, "author-1");
  await publishAnnouncement(repo, a1.id);
  await publishAnnouncement(repo, a2.id);

  await acknowledgeAnnouncement(repo, a1.id, "staff-2");

  const view = await listUnacknowledgedAnnouncementsForStaff(repo, "staff-2");
  assert.equal(view.length, 1);
  assert.equal(view[0]?.title, "Second");
});

test("listUnacknowledgedAnnouncementsForStaff shows an announcement to a staff member who hasn't seen it, even if another staff member has", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "staff" }, "author-1");
  await publishAnnouncement(repo, a.id);
  await acknowledgeAnnouncement(repo, a.id, "staff-2");

  const staff3View = await listUnacknowledgedAnnouncementsForStaff(repo, "staff-3");
  assert.equal(staff3View.length, 1, "staff-3 hasn't acknowledged this, so it should still show for them");
});

test("listActiveAnnouncementsFor's since cursor only returns announcements published at or after that time", async () => {
  const repo = new FakeAnnouncementsRepository();
  const older = await createAnnouncement(repo, { title: "Older", body: "B", audience: "customers" }, "author-1", new Date("2026-07-01T00:00:00Z"));
  await publishAnnouncement(repo, older.id, new Date("2026-07-01T00:00:00Z"));
  const newer = await createAnnouncement(repo, { title: "Newer", body: "B", audience: "customers" }, "author-1", new Date("2026-07-10T00:00:00Z"));
  await publishAnnouncement(repo, newer.id, new Date("2026-07-10T00:00:00Z"));

  const now = new Date("2026-07-21T00:00:00Z");
  const sinceResults = await listActiveAnnouncementsFor(repo, "customers", now, new Date("2026-07-05T00:00:00Z"));

  assert.equal(sinceResults.length, 1);
  assert.equal(sinceResults[0]?.title, "Newer");
});

test("listActiveAnnouncementsFor without a since cursor returns everything active, matching the existing behavior", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "customers" }, "author-1");
  await publishAnnouncement(repo, a.id);

  const results = await listActiveAnnouncementsFor(repo, "customers");
  assert.equal(results.length, 1);
});

// --- scheduleAnnouncementPublish / unscheduleAnnouncementPublish / publishDueScheduledAnnouncements ---

test("scheduleAnnouncementPublish sets scheduledPublishAt on a draft, without publishing it yet", async () => {
  const repo = new FakeAnnouncementsRepository();
  const now = new Date("2026-07-20T00:00:00Z");
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "customers" }, "author-1", now);

  const publishAt = new Date("2026-07-21T09:00:00Z");
  const scheduled = await scheduleAnnouncementPublish(repo, a.id, publishAt, now);

  assert.equal(scheduled.scheduledPublishAt?.getTime(), publishAt.getTime());
  assert.equal(scheduled.status, "draft", "scheduling doesn't publish -- it stays a draft until the schedule is due");
});

test("scheduleAnnouncementPublish rejects a publishAt in the past", async () => {
  const repo = new FakeAnnouncementsRepository();
  const now = new Date("2026-07-20T00:00:00Z");
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "customers" }, "author-1", now);

  await assert.rejects(
    () => scheduleAnnouncementPublish(repo, a.id, new Date("2026-07-19T00:00:00Z"), now),
    (err: unknown) => err instanceof AnnouncementError && err.code === "invalid_input",
  );
});

test("scheduleAnnouncementPublish rejects scheduling something already published", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "customers" }, "author-1");
  await publishAnnouncement(repo, a.id);

  await assert.rejects(
    () => scheduleAnnouncementPublish(repo, a.id, new Date("2099-01-01T00:00:00Z")),
    (err: unknown) => err instanceof AnnouncementError && err.code === "invalid_status_transition",
  );
});

test("unscheduleAnnouncementPublish reverts a scheduled draft back to a plain, unscheduled draft", async () => {
  const repo = new FakeAnnouncementsRepository();
  const now = new Date("2026-07-20T00:00:00Z");
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "customers" }, "author-1", now);
  await scheduleAnnouncementPublish(repo, a.id, new Date("2026-07-21T09:00:00Z"), now);

  const unscheduled = await unscheduleAnnouncementPublish(repo, a.id);

  assert.equal(unscheduled.scheduledPublishAt, null);
  assert.equal(unscheduled.status, "draft");
});

test("unscheduleAnnouncementPublish is idempotent -- clearing an already-unscheduled draft is a no-op, not an error", async () => {
  const repo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "customers" }, "author-1");

  const result = await unscheduleAnnouncementPublish(repo, a.id);

  assert.equal(result.scheduledPublishAt, null);
});

test("publishAnnouncement clears any existing schedule when publishing immediately", async () => {
  const repo = new FakeAnnouncementsRepository();
  const now = new Date("2026-07-20T00:00:00Z");
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "customers" }, "author-1", now);
  await scheduleAnnouncementPublish(repo, a.id, new Date("2026-07-21T09:00:00Z"), now);

  const published = await publishAnnouncement(repo, a.id, now);

  assert.equal(published.scheduledPublishAt, null);
  assert.equal(published.status, "published");
});

test("publishDueScheduledAnnouncements publishes only drafts whose schedule has actually arrived", async () => {
  const repo = new FakeAnnouncementsRepository();
  const createdAt = new Date("2026-07-20T00:00:00Z");
  const due = await createAnnouncement(repo, { title: "Due", body: "B", audience: "customers" }, "author-1", createdAt);
  const notYetDue = await createAnnouncement(repo, { title: "Not yet", body: "B", audience: "customers" }, "author-1", createdAt);
  await scheduleAnnouncementPublish(repo, due.id, new Date("2026-07-21T09:00:00Z"), createdAt);
  await scheduleAnnouncementPublish(repo, notYetDue.id, new Date("2026-07-25T09:00:00Z"), createdAt);

  const results = await publishDueScheduledAnnouncements(repo, new Date("2026-07-21T09:00:01Z"));

  assert.equal(results.length, 1);
  assert.equal(results[0]?.announcementId, due.id);
  assert.equal(results[0]?.status, "published");
  const dueRefetched = await repo.getAnnouncementById(due.id);
  assert.equal(dueRefetched?.status, "published");
  const notYetDueRefetched = await repo.getAnnouncementById(notYetDue.id);
  assert.equal(notYetDueRefetched?.status, "draft", "an announcement scheduled for the future must not be published early");
});

test("publishDueScheduledAnnouncements ignores drafts with no schedule at all", async () => {
  const repo = new FakeAnnouncementsRepository();
  await createAnnouncement(repo, { title: "Never scheduled", body: "B", audience: "customers" }, "author-1");

  const results = await publishDueScheduledAnnouncements(repo, new Date("2099-01-01T00:00:00Z"));

  assert.deepEqual(results, []);
});

test("publishDueScheduledAnnouncements returns an empty array when nothing is due", async () => {
  const repo = new FakeAnnouncementsRepository();
  const now = new Date("2026-07-20T00:00:00Z");
  const a = await createAnnouncement(repo, { title: "T", body: "B", audience: "customers" }, "author-1", now);
  await scheduleAnnouncementPublish(repo, a.id, new Date("2099-01-01T00:00:00Z"), now);

  const results = await publishDueScheduledAnnouncements(repo, now);

  assert.deepEqual(results, []);
});
