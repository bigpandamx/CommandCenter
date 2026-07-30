import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  computeSourceHealthSummary,
  computePendingReviewsSummary,
  computeTodaysImpactSummary,
  computePublishingQueueSummary,
  computeComplianceOperationsDashboard,
} from "../src/dashboardService.js";
import { FakeComplianceRepository } from "../../Compliance/test/fakeRepository.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";
import { FakeServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/test/fakeServiceCatalogRepository.js";
import { FakeBillingRepository } from "../../../Platform-Services/Subscriptions/test/fakeBillingRepository.js";
import { FakeAnnouncementsRepository } from "../../Announcements/test/fakeRepository.js";
import { registerComplianceSource, recordFetchOutcome } from "../../Compliance/src/sourceManagement.js";
import { ingestComplianceItems } from "../../Compliance/src/ingestion.js";
import { analyzeComplianceUpdate } from "../../Compliance/src/analysisService.js";
import { createAnnouncement } from "../../Announcements/src/announcementService.js";
import { FakeAIProvider } from "../../../Customer-Connections/AIChat/test/fakeAIProvider.js";
import type { Organization } from "../../../Customer-Connections/Desktop-Apps/src/types.js";

function buildOrg(overrides: Partial<Organization> = {}): Organization {
  return { id: randomUUID(), name: "Test Org", entitlementTier: "standard", createdAt: new Date(), ...overrides };
}

// --- computeSourceHealthSummary ---

test("computeSourceHealthSummary: a source that just succeeded is healthy", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const now = new Date("2026-07-27T09:00:00Z");
  const source = await registerComplianceSource(complianceRepo, {
    name: "Federal Register",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "json_api",
    url: "https://example.gov/api",
    scheduleIntervalMinutes: 60,
  });
  await recordFetchOutcome(complianceRepo, source.id, { status: "success" }, now);

  const summary = await computeSourceHealthSummary(complianceRepo, now);

  assert.equal(summary.length, 1);
  assert.equal(summary[0]?.status, "healthy");
});

test("computeSourceHealthSummary: a source whose last fetch errored is failed", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const now = new Date("2026-07-27T09:00:00Z");
  const source = await registerComplianceSource(complianceRepo, {
    name: "FTC RSS",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/rss",
  });
  await recordFetchOutcome(complianceRepo, source.id, { status: "error", error: "timeout" }, now);

  const summary = await computeSourceHealthSummary(complianceRepo, now);

  assert.equal(summary[0]?.status, "failed");
  assert.equal(summary[0]?.lastFetchError, "timeout");
});

test("computeSourceHealthSummary: a source never fetched at all is never_run", async () => {
  const complianceRepo = new FakeComplianceRepository();
  await registerComplianceSource(complianceRepo, {
    name: "NIST",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/nist",
  });

  const summary = await computeSourceHealthSummary(complianceRepo);

  assert.equal(summary[0]?.status, "never_run");
});

test("computeSourceHealthSummary: a source overdue past its own schedule (with tolerance) is delayed, not healthy", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const lastFetch = new Date("2026-07-27T00:00:00Z");
  const source = await registerComplianceSource(complianceRepo, {
    name: "EU AI Office",
    jurisdiction: "EU",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.eu/rss",
    scheduleIntervalMinutes: 60, // expected hourly
  });
  await recordFetchOutcome(complianceRepo, source.id, { status: "success" }, lastFetch);

  // 3 hours later -- well past 1.5x the 60-minute interval.
  const now = new Date("2026-07-27T03:00:00Z");
  const summary = await computeSourceHealthSummary(complianceRepo, now);

  assert.equal(summary[0]?.status, "delayed");
});

test("computeSourceHealthSummary: a source slightly late (within tolerance) still reads healthy, not delayed", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const lastFetch = new Date("2026-07-27T00:00:00Z");
  const source = await registerComplianceSource(complianceRepo, {
    name: "NIST",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/nist",
    scheduleIntervalMinutes: 60,
  });
  await recordFetchOutcome(complianceRepo, source.id, { status: "success" }, lastFetch);

  // 70 minutes later -- late, but within the 1.5x (90-minute) tolerance.
  const now = new Date("2026-07-27T01:10:00Z");
  const summary = await computeSourceHealthSummary(complianceRepo, now);

  assert.equal(summary[0]?.status, "healthy");
});

test("computeSourceHealthSummary excludes manual sources entirely -- they have no fetch cycle to be healthy or delayed about", async () => {
  const complianceRepo = new FakeComplianceRepository();
  await registerComplianceSource(complianceRepo, {
    name: "State Regulator (manual)",
    jurisdiction: "US-CA",
    frameworkTags: [],
    sourceType: "manual",
    url: "https://example.ca.gov",
  });

  const summary = await computeSourceHealthSummary(complianceRepo);

  assert.deepEqual(summary, []);
});

test("computeSourceHealthSummary excludes deactivated sources -- turned off on purpose, not unhealthy", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const source = await registerComplianceSource(complianceRepo, {
    name: "Retired Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/retired",
  });
  await complianceRepo.updateSource({ ...source, isActive: false });

  const summary = await computeSourceHealthSummary(complianceRepo);

  assert.deepEqual(summary, []);
});

// --- computePendingReviewsSummary ---

async function seedObligationWithConfidence(
  complianceRepo: FakeComplianceRepository,
  aiProvider: FakeAIProvider,
  confidence: number,
  externalId: string,
) {
  const source = await registerComplianceSource(complianceRepo, {
    name: `Source ${externalId}`,
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: `https://example.gov/${externalId}.xml`,
  });
  await ingestComplianceItems(complianceRepo, source, [
    { externalId, title: "Rule", summary: "s", url: `https://example.gov/${externalId}`, publishedAt: null },
  ]);
  const update = (await complianceRepo.getUpdateBySourceAndExternalId(source.id, externalId))!;
  aiProvider.nextResponse = {
    content: JSON.stringify({
      isAiRelated: true,
      enforceability: "enforceable",
      country: "US",
      state: null,
      industries: [],
      topics: [],
      summary: "s",
      riskLevel: "medium",
      actionItems: [],
      keywords: [],
      obligations: [
        { description: "Do the thing", obligationType: "assessment", industries: [], deadlineDescription: null, confidence },
      ],
    }),
    tokensUsed: 100,
    model: "claude-sonnet-5",
  };
  await analyzeComplianceUpdate(complianceRepo, aiProvider, update.id);
  return update;
}

test("computePendingReviewsSummary counts new regulations, pending obligations, and low-confidence items correctly", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();

  await seedObligationWithConfidence(complianceRepo, aiProvider, 30, "a"); // low confidence
  await seedObligationWithConfidence(complianceRepo, aiProvider, 90, "b"); // high confidence

  const summary = await computePendingReviewsSummary(complianceRepo);

  assert.equal(summary.aiExtractions, 2, "both obligations are pending_review by default");
  assert.equal(summary.lowConfidenceItems, 1, "only the 30-confidence one is below the 50 threshold");
});

test("computePendingReviewsSummary does not count an approved obligation as pending", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const update = await seedObligationWithConfidence(complianceRepo, aiProvider, 20, "a");
  const [obligation] = await complianceRepo.listObligationsForUpdate(update.id);
  await complianceRepo.updateObligation({ ...obligation!, status: "approved" });

  const summary = await computePendingReviewsSummary(complianceRepo);

  assert.equal(summary.aiExtractions, 0);
  assert.equal(summary.lowConfidenceItems, 0, "an approved obligation shouldn't still show as needing a second look");
});

// --- computePublishingQueueSummary ---

test("computePublishingQueueSummary splits unscheduled alerts, scheduled items, and general drafts correctly", async () => {
  const announcementsRepo = new FakeAnnouncementsRepository();

  // Unscheduled alert (org-targeted) -- ready to publish.
  await createAnnouncement(announcementsRepo, { title: "Alert", body: "b", audience: "customers", organizationId: "org-1" }, "staff-1");
  // Scheduled alert.
  const scheduledAlert = await createAnnouncement(
    announcementsRepo,
    { title: "Scheduled Alert", body: "b", audience: "customers", organizationId: "org-2" },
    "staff-1",
  );
  await announcementsRepo.updateAnnouncement({ ...scheduledAlert, scheduledPublishAt: new Date("2099-01-01T00:00:00Z") });
  // Unscheduled general announcement -- a plain draft.
  await createAnnouncement(announcementsRepo, { title: "General", body: "b", audience: "customers" }, "staff-1");

  const summary = await computePublishingQueueSummary(announcementsRepo);

  assert.equal(summary.readyToPublish, 1);
  assert.equal(summary.scheduled, 1);
  assert.equal(summary.drafts, 1);
});

test("computePublishingQueueSummary doesn't count a published announcement in any bucket", async () => {
  const announcementsRepo = new FakeAnnouncementsRepository();
  const a = await createAnnouncement(announcementsRepo, { title: "T", body: "b", audience: "customers" }, "staff-1");
  await announcementsRepo.updateAnnouncement({ ...a, status: "published", publishedAt: new Date() });

  const summary = await computePublishingQueueSummary(announcementsRepo);

  assert.deepEqual(summary, { readyToPublish: 0, scheduled: 0, drafts: 0 });
});

// --- computeTodaysImpactSummary ---

test("computeTodaysImpactSummary counts distinct regulations by risk level, and unions affected orgs", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();
  const now = new Date("2026-07-27T12:00:00Z");

  const org = buildOrg({ id: "org-1" });
  await orgsRepo.createOrganization(org);
  await orgsRepo.createProfile({
    organizationId: org.id,
    slug: "org-1",
    primaryContactName: "Jane",
    primaryContactEmail: "jane@example.com",
    primaryContactPhone: null,
    industry: "healthcare",
    companySize: null,
    website: null,
    country: "US",
    notes: null,
    cloudProviders: [],
    aiProviders: [],
    deviceTypes: [],
    createdAt: now,
    updatedAt: now,
  });

  const source = await registerComplianceSource(complianceRepo, {
    name: "Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/rss",
  });
  await ingestComplianceItems(complianceRepo, source, [
    { externalId: "a", title: "Rule", summary: "s", url: "https://example.gov/a", publishedAt: null, country: "US" },
  ], now);
  const update = (await complianceRepo.getUpdateBySourceAndExternalId(source.id, "a"))!;
  aiProvider.nextResponse = {
    content: JSON.stringify({
      isAiRelated: true,
      enforceability: "enforceable",
      country: "US",
      state: null,
      industries: ["healthcare"],
      topics: [],
      summary: "s",
      riskLevel: "critical",
      actionItems: [],
      keywords: [],
      obligations: [{ description: "Do it", obligationType: "assessment", industries: ["healthcare"], deadlineDescription: null }],
    }),
    tokensUsed: 100,
    model: "claude-sonnet-5",
  };
  await analyzeComplianceUpdate(complianceRepo, aiProvider, update.id, now);

  const summary = await computeTodaysImpactSummary(complianceRepo, orgsRepo, catalogRepo, billingRepo, now);

  assert.equal(summary.criticalAlerts, 1);
  assert.equal(summary.mediumAlerts, 0);
  assert.equal(summary.organizationsAffected, 1);
});

test("computeTodaysImpactSummary excludes regulations ingested on a prior day", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();

  const yesterday = new Date("2026-07-26T12:00:00Z");
  const source = await registerComplianceSource(complianceRepo, {
    name: "Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/rss",
  });
  await ingestComplianceItems(
    complianceRepo,
    source,
    [{ externalId: "a", title: "Old Rule", summary: "s", url: "https://example.gov/a", publishedAt: null }],
    yesterday,
  );

  const today = new Date("2026-07-27T09:00:00Z");
  const summary = await computeTodaysImpactSummary(complianceRepo, orgsRepo, catalogRepo, billingRepo, today);

  assert.equal(summary.criticalAlerts, 0);
  assert.equal(summary.mediumAlerts, 0);
  assert.equal(summary.organizationsAffected, 0);
});

// --- computeComplianceOperationsDashboard ---

test("computeComplianceOperationsDashboard composes all four sections into one result", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const now = new Date("2026-07-27T09:00:00Z");

  const dashboard = await computeComplianceOperationsDashboard(complianceRepo, orgsRepo, catalogRepo, billingRepo, announcementsRepo, now);

  assert.equal(dashboard.generatedAt.getTime(), now.getTime());
  assert.deepEqual(dashboard.sources, []);
  assert.deepEqual(dashboard.pendingReviews, { newRegulations: 0, aiExtractions: 0, lowConfidenceItems: 0 });
  assert.deepEqual(dashboard.todaysImpact, { organizationsAffected: 0, criticalAlerts: 0, mediumAlerts: 0 });
  assert.deepEqual(dashboard.publishingQueue, { readyToPublish: 0, scheduled: 0, drafts: 0 });
});
