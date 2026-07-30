import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  buildNoticeFromInsight,
  generateAndPublishRiskNotices,
  RiskNoticeError,
} from "../src/notificationGeneration.js";
import type { NetworkRiskInsight } from "../src/types.js";
import { FakeRiskIntelligenceRepository } from "./fakeRepository.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";
import { FakeAnnouncementsRepository } from "../../Announcements/test/fakeRepository.js";

function buildInsight(overrides: Partial<NetworkRiskInsight> = {}): NetworkRiskInsight {
  return {
    id: randomUUID(),
    industry: "technology",
    type: "anomaly",
    severity: "high",
    summary: "Risk signals spiking across the technology industry",
    explanation: "A 3x increase in deployment-failure signals was observed over the last 24 hours.",
    contributingFactors: {},
    recommendation: "Review recent deployment pipeline changes.",
    confidence: 0.85,
    linkedAggregateIds: [],
    isResolved: false,
    createdAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

async function seedOrgInIndustry(orgsRepo: FakeOrganizationsRepository, industry: string | null) {
  const orgId = randomUUID();
  await orgsRepo.createOrganization({ id: orgId, name: `Org ${orgId}`, entitlementTier: "standard", createdAt: new Date() });
  await orgsRepo.createProfile({
    organizationId: orgId,
    slug: orgId,
    primaryContactName: "Contact",
    primaryContactEmail: "contact@example.com",
    primaryContactPhone: null,
    industry,
    companySize: null,
    website: null,
    country: null,
    notes: null,
    cloudProviders: [],
    aiProviders: [],
    deviceTypes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return orgId;
}

// --- buildNoticeFromInsight (pure) ---

test("buildNoticeFromInsight rejects a resolved insight", () => {
  const insight = buildInsight({ isResolved: true });
  assert.throws(
    () => buildNoticeFromInsight(insight),
    (err: unknown) => err instanceof RiskNoticeError && err.code === "not_eligible",
  );
});

test("buildNoticeFromInsight rejects an insight below the confidence threshold", () => {
  const insight = buildInsight({ confidence: 0.5 });
  assert.throws(
    () => buildNoticeFromInsight(insight),
    (err: unknown) => err instanceof RiskNoticeError && err.code === "not_eligible",
  );
});

test("buildNoticeFromInsight accepts an unresolved, high-confidence insight", () => {
  const insight = buildInsight({ isResolved: false, confidence: 0.85 });
  const item = buildNoticeFromInsight(insight);
  assert.ok(item.title.includes("Risk Notice"));
  assert.equal(item.audience, "customers");
});

test("buildNoticeFromInsight maps InsightSeverity to AnnouncementSeverity correctly, including the high/medium collapse", () => {
  assert.equal(buildNoticeFromInsight(buildInsight({ severity: "critical" })).severity, "critical");
  assert.equal(buildNoticeFromInsight(buildInsight({ severity: "high" })).severity, "warning");
  assert.equal(buildNoticeFromInsight(buildInsight({ severity: "medium" })).severity, "warning");
  assert.equal(buildNoticeFromInsight(buildInsight({ severity: "low" })).severity, "info");
});

test("buildNoticeFromInsight's body includes the recommendation when present", () => {
  const item = buildNoticeFromInsight(buildInsight({ recommendation: "Review your deployment pipeline." }));
  assert.ok(item.body.includes("Review your deployment pipeline."));
});

// --- generateAndPublishRiskNotices ---

test("generateAndPublishRiskNotices creates one draft per organization in the insight's own industry", async () => {
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const insight = buildInsight({ industry: "technology" });
  await riskIntelRepo.createInsight(insight);

  const techOrg1 = await seedOrgInIndustry(orgsRepo, "technology");
  const techOrg2 = await seedOrgInIndustry(orgsRepo, "technology");
  await seedOrgInIndustry(orgsRepo, "healthcare"); // different industry -- should not receive a notice

  const announcements = await generateAndPublishRiskNotices(riskIntelRepo, orgsRepo, announcementsRepo, insight.id, "staff-1");

  assert.equal(announcements.length, 2);
  const notifiedOrgIds = new Set(announcements.map((a) => a.organizationId));
  assert.deepEqual(notifiedOrgIds, new Set([techOrg1, techOrg2]));
});

test("generateAndPublishRiskNotices excludes an org with no industry set at all -- deliberately, not a bug", async () => {
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const insight = buildInsight({ industry: "technology" });
  await riskIntelRepo.createInsight(insight);

  await seedOrgInIndustry(orgsRepo, null); // industry unset

  const announcements = await generateAndPublishRiskNotices(riskIntelRepo, orgsRepo, announcementsRepo, insight.id, "staff-1");

  assert.deepEqual(announcements, []);
});

test("generateAndPublishRiskNotices creates nothing when no organization matches the insight's industry", async () => {
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const insight = buildInsight({ industry: "technology" });
  await riskIntelRepo.createInsight(insight);
  await seedOrgInIndustry(orgsRepo, "healthcare");

  const announcements = await generateAndPublishRiskNotices(riskIntelRepo, orgsRepo, announcementsRepo, insight.id, "staff-1");

  assert.deepEqual(announcements, []);
});

test("generateAndPublishRiskNotices throws not_eligible for a resolved insight, and creates nothing", async () => {
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const insight = buildInsight({ isResolved: true });
  await riskIntelRepo.createInsight(insight);
  await seedOrgInIndustry(orgsRepo, insight.industry);

  await assert.rejects(
    () => generateAndPublishRiskNotices(riskIntelRepo, orgsRepo, announcementsRepo, insight.id, "staff-1"),
    (err: unknown) => err instanceof RiskNoticeError && err.code === "not_eligible",
  );
  const announcements = await announcementsRepo.searchAnnouncements({});
  assert.equal(announcements.length, 0);
});

test("generateAndPublishRiskNotices throws insight_not_found for an unknown insight id", async () => {
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();

  await assert.rejects(
    () => generateAndPublishRiskNotices(riskIntelRepo, orgsRepo, announcementsRepo, "ghost-insight", "staff-1"),
    (err: unknown) => err instanceof RiskNoticeError && err.code === "insight_not_found",
  );
});

test("each generated notice is scoped to its own organization, not a broadcast", async () => {
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const insight = buildInsight({ industry: "technology" });
  await riskIntelRepo.createInsight(insight);
  const orgId = await seedOrgInIndustry(orgsRepo, "technology");

  const [announcement] = await generateAndPublishRiskNotices(riskIntelRepo, orgsRepo, announcementsRepo, insight.id, "staff-1");

  assert.equal(announcement?.organizationId, orgId);
  assert.notEqual(announcement?.organizationId, null, "unlike a Threat Advisory, a Risk Notice is targeted, not broadcast");
});
