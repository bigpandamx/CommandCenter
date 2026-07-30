import { test } from "node:test";
import assert from "node:assert/strict";
import { packageAndDistribute } from "../src/publishingService.js";
import type { PublishableIntelligence } from "../src/types.js";
import { FakeAnnouncementsRepository } from "../../Announcements/test/fakeRepository.js";

function buildItem(overrides: Partial<PublishableIntelligence> = {}): PublishableIntelligence {
  return {
    sourceType: "compliance",
    sourceId: "obligation-1",
    title: "Test Advisory",
    body: "Body text.",
    severity: "warning",
    organizationId: null,
    audience: "customers",
    ...overrides,
  };
}

test("packageAndDistribute creates a draft, never publishes directly", async () => {
  const announcementsRepo = new FakeAnnouncementsRepository();

  const result = await packageAndDistribute(announcementsRepo, buildItem(), "staff-1");

  assert.equal(result.status, "draft");
  assert.equal(result.publishedAt, null);
});

test("packageAndDistribute carries every field through unchanged", async () => {
  const announcementsRepo = new FakeAnnouncementsRepository();
  const item = buildItem({ title: "Threat Advisory: New Injection Pattern", body: "Details.", severity: "critical", organizationId: "org-1", audience: "customers" });

  const result = await packageAndDistribute(announcementsRepo, item, "staff-1");

  assert.equal(result.title, item.title);
  assert.equal(result.body, item.body);
  assert.equal(result.severity, "critical");
  assert.equal(result.organizationId, "org-1");
  assert.equal(result.audience, "customers");
});

test("packageAndDistribute attributes the draft to the initiating staff member, regardless of source domain", async () => {
  const announcementsRepo = new FakeAnnouncementsRepository();

  const complianceItem = await packageAndDistribute(announcementsRepo, buildItem({ sourceType: "compliance" }), "staff-1");
  const threatItem = await packageAndDistribute(announcementsRepo, buildItem({ sourceType: "threat_intelligence" }), "staff-2");

  assert.equal(complianceItem.createdByStaffId, "staff-1");
  assert.equal(threatItem.createdByStaffId, "staff-2");
});

test("packageAndDistribute is domain-agnostic -- items from different sourceTypes produce indistinguishable Announcement rows, both usable by the same Distribution Center UI", async () => {
  const announcementsRepo = new FakeAnnouncementsRepository();

  const complianceItem = await packageAndDistribute(announcementsRepo, buildItem({ sourceType: "compliance" }), "staff-1");
  const threatItem = await packageAndDistribute(announcementsRepo, buildItem({ sourceType: "threat_intelligence" }), "staff-1");

  // Neither result carries sourceType at all -- Announcement has no such field, confirming Publishing doesn't leak domain-specific concepts into the shared entity.
  assert.equal("sourceType" in complianceItem, false);
  assert.equal("sourceType" in threatItem, false);
  assert.deepEqual(Object.keys(complianceItem).sort(), Object.keys(threatItem).sort());
});

test("packageAndDistribute defaults organizationId null (broadcast) through to the created Announcement", async () => {
  const announcementsRepo = new FakeAnnouncementsRepository();

  const result = await packageAndDistribute(announcementsRepo, buildItem({ organizationId: null }), "staff-1");

  assert.equal(result.organizationId, null);
});
