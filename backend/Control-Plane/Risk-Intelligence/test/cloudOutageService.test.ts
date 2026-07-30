import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CloudOutageError,
  buildInsightFromOutage,
  reportOutage,
  resolveOutage,
  listOutages,
  assessOutageImpact,
  generateAndPublishOutageNotices,
} from "../src/cloudOutageService.js";
import { createBusinessAsset } from "../src/businessAssetService.js";
import { createAssetDependency } from "../src/assetDependencyService.js";
import { CROSS_INDUSTRY } from "../src/externalSignalIngestion.js";
import { FakeRiskIntelligenceRepository } from "./fakeRepository.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";
import { FakeAnnouncementsRepository } from "../../Announcements/test/fakeRepository.js";
import { signUpOrganization } from "../../Organizations/src/signup.js";
import type { CloudProviderOutage } from "../src/types.js";

function buildOutage(overrides: Partial<CloudProviderOutage> = {}): CloudProviderOutage {
  return {
    id: "outage-1",
    vendor: "openai",
    category: "ai",
    title: "Chat Completions API degraded",
    description: "OpenAI is reporting elevated error rates on the Chat Completions API.",
    severity: "critical",
    affectedServices: ["Chat Completions API"],
    startedAt: new Date(),
    isResolved: false,
    resolvedAt: null,
    sourceUrl: "https://status.openai.com/incidents/xyz",
    reportedByStaffId: "staff-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// --- buildInsightFromOutage (pure) ---

test("buildInsightFromOutage sets industry to the cross-industry sentinel, matching CVE/campaign insights", () => {
  const insight = buildInsightFromOutage(buildOutage());
  assert.equal(insight.industry, CROSS_INDUSTRY);
});

test("buildInsightFromOutage always sets confidence to 1.0 -- staff has directly confirmed this outage", () => {
  const insight = buildInsightFromOutage(buildOutage());
  assert.equal(insight.confidence, 1.0);
});

test("buildInsightFromOutage carries the outage's own severity through directly", () => {
  const insight = buildInsightFromOutage(buildOutage({ severity: "high" }));
  assert.equal(insight.severity, "high");
});

// --- reportOutage: creates both the outage AND its insight in one call ---

test("reportOutage creates both the outage record and its insight together", async () => {
  const repo = new FakeRiskIntelligenceRepository();

  const { outage, insight } = await reportOutage(repo, {
    vendor: "openai",
    category: "ai",
    title: "Chat Completions API degraded",
    description: "Elevated error rates.",
    severity: "critical",
    affectedServices: ["Chat Completions API"],
    startedAt: new Date(),
    reportedByStaffId: "staff-1",
  });

  assert.ok(outage.id);
  assert.equal(outage.isResolved, false);
  const storedInsight = await repo.getInsightById(insight.id);
  assert.ok(storedInsight, "the insight must actually be persisted, not just constructed");
});

test("reportOutage defaults isResolved to false and resolvedAt to null for a brand-new outage", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const { outage } = await reportOutage(repo, {
    vendor: "aws",
    category: "cloud",
    title: "EC2 degraded",
    description: "x",
    severity: "high",
    affectedServices: ["EC2"],
    startedAt: new Date(),
    reportedByStaffId: "staff-1",
  });

  assert.equal(outage.isResolved, false);
  assert.equal(outage.resolvedAt, null);
});

// --- resolveOutage ---

test("resolveOutage marks the outage resolved", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const { outage } = await reportOutage(repo, {
    vendor: "openai",
    category: "ai",
    title: "x",
    description: "x",
    severity: "critical",
    affectedServices: [],
    startedAt: new Date(),
    reportedByStaffId: "staff-1",
  });

  const resolved = await resolveOutage(repo, outage.id);

  assert.equal(resolved.isResolved, true);
  assert.ok(resolved.resolvedAt);
});

test("resolveOutage throws outage_not_found for an unknown id", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => resolveOutage(repo, "ghost-outage"),
    (err: unknown) => err instanceof CloudOutageError && err.code === "outage_not_found",
  );
});

// --- listOutages ---

test("listOutages filters by vendor and isResolved", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await reportOutage(repo, { vendor: "openai", category: "ai", title: "x", description: "x", severity: "critical", affectedServices: [], startedAt: new Date(), reportedByStaffId: "s" });
  const { outage: awsOutage } = await reportOutage(repo, { vendor: "aws", category: "cloud", title: "x", description: "x", severity: "high", affectedServices: [], startedAt: new Date(), reportedByStaffId: "s" });
  await resolveOutage(repo, awsOutage.id);

  const openaiOnly = await listOutages(repo, { vendor: "openai" });
  const unresolvedOnly = await listOutages(repo, { isResolved: false });

  assert.equal(openaiOnly.length, 1);
  assert.equal(unresolvedOnly.length, 1);
  assert.equal(unresolvedOnly[0]?.vendor, "openai");
});

// --- assessOutageImpact: the full realization of the original scenario ---

async function seedOrgWithVendorAndAsset(
  repo: FakeRiskIntelligenceRepository,
  orgsRepo: FakeOrganizationsRepository,
  name: string,
  aiProviders: string[],
  withDependency: boolean,
) {
  const { organization } = await signUpOrganization(orgsRepo, {
    organizationName: name,
    primaryContactName: "Contact",
    primaryContactEmail: `${name.toLowerCase().replace(/\s+/g, "-")}@example.com`,
    aiProviders,
  });
  if (withDependency) {
    const asset = await createBusinessAsset(repo, orgsRepo, {
      organizationId: organization.id,
      name: "AI Support Triage",
      description: "x",
      category: "system",
      criticality: "high",
    });
    await createAssetDependency(repo, {
      dependentAssetId: asset.id,
      targetType: "vendor",
      targetVendor: "openai",
      targetVendorCategory: "ai",
      description: "Relies on OpenAI for triage classification.",
      criticality: "high",
    });
  }
  return organization;
}

test("assessOutageImpact realizes the original scenario: a critical OpenAI outage resolves to specific orgs and specific affected assets", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();

  const orgWithDependency = await seedOrgWithVendorAndAsset(repo, orgsRepo, "Acme Corp", ["openai"], true);
  const orgUsingButNoDependencyMapped = await seedOrgWithVendorAndAsset(repo, orgsRepo, "Widget Co", ["openai"], false);
  await seedOrgWithVendorAndAsset(repo, orgsRepo, "Unrelated Co", ["anthropic"], false); // doesn't use OpenAI at all

  const { outage } = await reportOutage(repo, {
    vendor: "openai",
    category: "ai",
    title: "Chat Completions API degraded",
    description: "x",
    severity: "critical",
    affectedServices: ["Chat Completions API"],
    startedAt: new Date(),
    reportedByStaffId: "staff-1",
  });

  const impact = await assessOutageImpact(repo, orgsRepo, outage.id);

  // Both OpenAI-using orgs show up as affected organizations.
  assert.equal(impact.affectedOrganizations.length, 2);
  assert.deepEqual(
    new Set(impact.affectedOrganizations.map((o) => o.organizationId)),
    new Set([orgWithDependency.id, orgUsingButNoDependencyMapped.id]),
  );

  // Only the org with a recorded asset dependency shows up in the "what breaks" list.
  assert.equal(impact.affectedAssetsByOrganization.length, 1);
  assert.equal(impact.affectedAssetsByOrganization[0]?.organizationId, orgWithDependency.id);
  assert.equal(impact.affectedAssetsByOrganization[0]?.assets.length, 1);
  assert.equal(impact.affectedAssetsByOrganization[0]?.assets[0]?.directDependency?.description, "Relies on OpenAI for triage classification.");
  assert.equal(impact.affectedAssetsByOrganization[0]?.assets[0]?.depth, 1);
});

test("assessOutageImpact returns empty impact lists, not an error, when no organization uses the affected vendor", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  await seedOrgWithVendorAndAsset(repo, orgsRepo, "Unrelated Co", ["anthropic"], false);
  const { outage } = await reportOutage(repo, {
    vendor: "openai",
    category: "ai",
    title: "x",
    description: "x",
    severity: "critical",
    affectedServices: [],
    startedAt: new Date(),
    reportedByStaffId: "staff-1",
  });

  const impact = await assessOutageImpact(repo, orgsRepo, outage.id);

  assert.deepEqual(impact.affectedOrganizations, []);
  assert.deepEqual(impact.affectedAssetsByOrganization, []);
});

test("assessOutageImpact throws outage_not_found for an unknown outage id", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  await assert.rejects(
    () => assessOutageImpact(repo, orgsRepo, "ghost-outage"),
    (err: unknown) => err instanceof CloudOutageError && err.code === "outage_not_found",
  );
});

test("assessOutageImpact surfaces the full multi-hop cascade, not just directly-dependent assets", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const org = await seedOrgWithVendorAndAsset(repo, orgsRepo, "Acme Corp", ["openai"], true);

  // Find the asset that was created with a direct OpenAI dependency, and add a
  // second asset that depends on IT -- one hop further downstream from the vendor.
  const directAssets = await repo.listBusinessAssetsForOrganization(org.id);
  const directAsset = directAssets[0]!;
  const downstreamAsset = await createBusinessAsset(repo, orgsRepo, {
    organizationId: org.id,
    name: "Ticket Router",
    description: "x",
    category: "system",
    criticality: "medium",
  });
  await createAssetDependency(repo, {
    dependentAssetId: downstreamAsset.id,
    targetType: "asset",
    targetAssetId: directAsset.id,
    description: "Routes tickets based on triage output.",
    criticality: "medium",
  });

  const { outage } = await reportOutage(repo, {
    vendor: "openai",
    category: "ai",
    title: "x",
    description: "x",
    severity: "critical",
    affectedServices: [],
    startedAt: new Date(),
    reportedByStaffId: "staff-1",
  });

  const impact = await assessOutageImpact(repo, orgsRepo, outage.id);

  const orgAssets = impact.affectedAssetsByOrganization.find((a) => a.organizationId === org.id);
  assert.equal(orgAssets?.assets.length, 2, "both the directly-dependent asset and its downstream dependent should be included");
  const downstream = orgAssets?.assets.find((a) => a.assetId === downstreamAsset.id);
  assert.equal(downstream?.depth, 2);
  assert.equal(downstream?.directDependency, null, "a transitively-affected asset has no direct dependency record of its own describing the outage's vendor");
});

// --- generateAndPublishOutageNotices: closing the distribution gap outages alone can close ---

test("generateAndPublishOutageNotices creates one announcement per organization that uses the affected vendor", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const orgA = await seedOrgWithVendorAndAsset(repo, orgsRepo, "Acme Corp", ["openai"], true);
  const orgB = await seedOrgWithVendorAndAsset(repo, orgsRepo, "Widget Co", ["openai"], false);
  await seedOrgWithVendorAndAsset(repo, orgsRepo, "Unrelated Co", ["anthropic"], false);

  const { outage } = await reportOutage(repo, {
    vendor: "openai",
    category: "ai",
    title: "Chat Completions API degraded",
    description: "Elevated error rates on the Chat Completions API.",
    severity: "critical",
    affectedServices: ["Chat Completions API"],
    startedAt: new Date(),
    reportedByStaffId: "staff-1",
  });

  const announcements = await generateAndPublishOutageNotices(repo, orgsRepo, announcementsRepo, outage.id, "staff-1");

  assert.equal(announcements.length, 2);
  assert.deepEqual(new Set(announcements.map((a) => a.organizationId)), new Set([orgA.id, orgB.id]));
});

test("generateAndPublishOutageNotices reaches an org that uses the vendor but has no mapped asset dependency -- the same breadth Risk Notices already applies for industry matching", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const orgWithoutMappedDependency = await seedOrgWithVendorAndAsset(repo, orgsRepo, "Widget Co", ["openai"], false);

  const { outage } = await reportOutage(repo, {
    vendor: "openai",
    category: "ai",
    title: "x",
    description: "x",
    severity: "critical",
    affectedServices: [],
    startedAt: new Date(),
    reportedByStaffId: "staff-1",
  });

  const announcements = await generateAndPublishOutageNotices(repo, orgsRepo, announcementsRepo, outage.id, "staff-1");

  assert.equal(announcements.length, 1);
  assert.equal(announcements[0]?.organizationId, orgWithoutMappedDependency.id);
});

test("generateAndPublishOutageNotices creates nothing when no organization uses the affected vendor", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  await seedOrgWithVendorAndAsset(repo, orgsRepo, "Unrelated Co", ["anthropic"], false);

  const { outage } = await reportOutage(repo, {
    vendor: "openai",
    category: "ai",
    title: "x",
    description: "x",
    severity: "critical",
    affectedServices: [],
    startedAt: new Date(),
    reportedByStaffId: "staff-1",
  });

  const announcements = await generateAndPublishOutageNotices(repo, orgsRepo, announcementsRepo, outage.id, "staff-1");

  assert.deepEqual(announcements, []);
});

test("generateAndPublishOutageNotices throws outage_not_found for an unknown outage id", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();

  await assert.rejects(
    () => generateAndPublishOutageNotices(repo, orgsRepo, announcementsRepo, "ghost-outage", "staff-1"),
    (err: unknown) => err instanceof CloudOutageError && err.code === "outage_not_found",
  );
});

test("generateAndPublishOutageNotices maps severity to announcement severity the same way Risk Notices already does (critical stays critical, high/medium collapse to warning, low becomes info)", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  await seedOrgWithVendorAndAsset(repo, orgsRepo, "Acme Corp", ["openai"], false);

  const { outage } = await reportOutage(repo, {
    vendor: "openai",
    category: "ai",
    title: "x",
    description: "x",
    severity: "high",
    affectedServices: [],
    startedAt: new Date(),
    reportedByStaffId: "staff-1",
  });

  const [announcement] = await generateAndPublishOutageNotices(repo, orgsRepo, announcementsRepo, outage.id, "staff-1");

  assert.equal(announcement?.severity, "warning");
});
