/**
 * HTTP-layer route tests -- deliberately the first of their kind in
 * this codebase. Every other test here calls domain functions directly
 * against fake repositories, which is real, thorough coverage of
 * business logic, but cannot detect a route that was never registered
 * at all: GET /v1/service/announcements/active had a full doc comment,
 * a real implementation (listActiveAnnouncementsFor), and genuine
 * domain-level test coverage (Control-Plane/ImpactAssessment/test/
 * distribution.test.ts's "full loop" test) -- and still didn't exist as
 * an actual endpoint, because the app.get() call registering it was
 * simply never written. Found only by grepping for the registration
 * itself during a routine verification pass, not by any test.
 *
 * This file is a targeted fix for that one gap, not a new general
 * testing paradigm adopted across the codebase -- see CUTOVER.md for
 * that distinction stated plainly, so it doesn't read as either a
 * one-off nobody thought about again or a silent policy change nobody
 * agreed to.
 *
 * This sandbox has no outbound network access and cannot npm install
 * fastify -- the whole apps/api layer has only ever been type-checked
 * here, never executed (same pre-existing constraint documented
 * throughout Platform-Services/Databases's *.pg.ts files). A real
 * environment running `npm install` will have fastify and should get
 * genuine execution, not a test that's silently, permanently skipped
 * -- so fastify is imported dynamically and checked for at runtime,
 * with every test below skipping (not failing) if it's unavailable,
 * rather than a static top-level import that would hard-crash the
 * whole file before a single test could even register.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestVulnerabilities } from "../../Control-Plane/Threat-Intelligence/src/vulnerabilityIngestion.js";
import { createStaffThreatActor } from "../../Control-Plane/Threat-Intelligence/src/threatActorIngestion.js";
import type { Vulnerability } from "../../Control-Plane/Threat-Intelligence/src/types.js";

let fastifyAvailable = true;
let fastifyFactory: (() => import("fastify").FastifyInstance) | undefined;
try {
  const mod = await import("fastify");
  fastifyFactory = mod.default;
} catch {
  fastifyAvailable = false;
}
const t = fastifyAvailable ? test : test.skip;

if (!fastifyAvailable) {
  console.log(
    "SKIPPING serviceApiRoutes.test.ts: fastify is not installed in this environment (no network access to fetch it). Run `npm install` in an environment with registry access to execute these for real.",
  );
}

async function buildApp() {
  const { registerServiceApiRoutes } = await import("../../api/src/routes/serviceApi.js");
  const { createServiceAccount } = await import("../../Platform-Services/Authentication/src/serviceAccountService.js");
  const { FakeServiceAccountRepository } = await import("../../Platform-Services/Authentication/test/fakeServiceAccountRepository.js");
  const { FakeComplianceRepository } = await import("../../Control-Plane/Compliance/test/fakeRepository.js");
  const { FakeOrganizationsRepository } = await import("../../Control-Plane/Organizations/test/fakeRepository.js");
  const { FakeTicketsRepository } = await import("../../Control-Plane/Tickets/test/fakeRepository.js");
  const { FakeIdentityRepository } = await import("../../Platform-Services/Identity/test/fakeIdentityRepository.js");
  const { FakeThreatIntelRepository } = await import("../../Control-Plane/Threat-Intelligence/test/fakeRepository.js");
  const { FakeAnnouncementsRepository } = await import("../../Control-Plane/Announcements/test/fakeRepository.js");
  const { FakeBillingRepository } = await import("../../Platform-Services/Subscriptions/test/fakeBillingRepository.js");
  const { FakeFeatureFlagsRepository } = await import("../../Platform-Services/FeatureFlags/test/fakeFeatureFlagsRepository.js");
  const { FakeEventsRepository } = await import("../../Platform-Services/Events/test/fakeEventsRepository.js");
  const { FakeFleetOperationsRepository } = await import("../../Control-Plane/FleetOperations/test/fakeRepository.js");

  const app = fastifyFactory!();
  const serviceAccountRepo = new FakeServiceAccountRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const threatIntelRepo = new FakeThreatIntelRepository();

  registerServiceApiRoutes(
    app,
    new FakeComplianceRepository(),
    new FakeOrganizationsRepository(),
    new FakeTicketsRepository(),
    new FakeIdentityRepository(),
    threatIntelRepo,
    serviceAccountRepo,
    announcementsRepo,
    new FakeBillingRepository(),
    null,
    new FakeFeatureFlagsRepository(),
    new FakeEventsRepository(),
    new FakeFleetOperationsRepository(),
  );

  const { apiKey } = await createServiceAccount(serviceAccountRepo, {
    name: "Test Aegis Instance",
    scopes: ["announcements:read", "threat_intel:read"],
  });

  return {
    app,
    apiKey,
    announcementsRepo,
    threatIntelRepo,
    createAnnouncement: (await import("../../Control-Plane/Announcements/src/announcementService.js")).createAnnouncement,
    publishAnnouncement: (await import("../../Control-Plane/Announcements/src/announcementService.js")).publishAnnouncement,
  };
}

t("GET /v1/service/announcements/active is actually registered and reachable", async () => {
  const { app, apiKey } = await buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/v1/service/announcements/active",
    headers: { authorization: `Bearer ${apiKey}` },
  });

  assert.equal(response.statusCode, 200, "the route must exist at all -- this is what was missing");
  const body = response.json() as { announcements: unknown[] };
  assert.deepEqual(body.announcements, []);
});

t("GET /v1/service/announcements/active requires a valid bearer token", async () => {
  const { app } = await buildApp();

  const response = await app.inject({ method: "GET", url: "/v1/service/announcements/active" });

  assert.equal(response.statusCode, 401);
});

t("GET /v1/service/announcements/active returns a published broadcast", async () => {
  const { app, apiKey, announcementsRepo, createAnnouncement, publishAnnouncement } = await buildApp();
  const announcement = await createAnnouncement(
    announcementsRepo,
    { title: "Scheduled maintenance", body: "Body.", audience: "customers", severity: "info" },
    "staff-1",
  );
  await publishAnnouncement(announcementsRepo, announcement.id);

  const response = await app.inject({
    method: "GET",
    url: "/v1/service/announcements/active",
    headers: { authorization: `Bearer ${apiKey}` },
  });

  const body = response.json() as { announcements: { id: string }[] };
  assert.equal(body.announcements.length, 1);
  assert.equal(body.announcements[0]?.id, announcement.id);
});

t("GET /v1/service/announcements/active?organizationId=X includes that org's targeted announcements alongside broadcasts", async () => {
  const { app, apiKey, announcementsRepo, createAnnouncement, publishAnnouncement } = await buildApp();
  const orgId = "11111111-1111-1111-1111-111111111111";
  const targeted = await createAnnouncement(
    announcementsRepo,
    { title: "Compliance Impact: Some Rule", body: "Body.", audience: "customers", severity: "warning", organizationId: orgId },
    "staff-1",
  );
  await publishAnnouncement(announcementsRepo, targeted.id);

  const forThatOrg = await app.inject({
    method: "GET",
    url: `/v1/service/announcements/active?organizationId=${orgId}`,
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const forNoOrg = await app.inject({
    method: "GET",
    url: "/v1/service/announcements/active",
    headers: { authorization: `Bearer ${apiKey}` },
  });

  const forThatOrgBody = forThatOrg.json() as { announcements: unknown[] };
  const forNoOrgBody = forNoOrg.json() as { announcements: unknown[] };
  assert.equal(forThatOrgBody.announcements.length, 1, "the org-targeted announcement should show up when querying for that org");
  assert.equal(forNoOrgBody.announcements.length, 0, "but not in the general broadcast-only pull, matching listActiveAnnouncementsFor's own contract");
});

function vulnInput(overrides: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: "",
    cveId: "CVE-2024-00001",
    vulnStatus: "Analyzed",
    description: "x",
    cvssVersion: "3.1",
    cvssBaseScore: 7.5,
    cvssBaseSeverity: "high",
    cvssVectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
    weaknesses: null,
    affectedProducts: null,
    referenceUrls: null,
    isKnownExploited: false,
    kevAddedAt: null,
    kevDueDate: null,
    kevRequiredAction: null,
    kevVulnerabilityName: null,
    publishedAt: new Date("2024-01-01T00:00:00Z"),
    lastModifiedAt: new Date("2024-01-01T00:00:00Z"),
    ingestedAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

t("GET /v1/service/threat-intelligence/vulnerabilities is actually registered and reachable, requires a valid bearer token", async () => {
  const { app, apiKey, threatIntelRepo } = await buildApp();
  await ingestVulnerabilities(threatIntelRepo, [vulnInput()]);

  const authed = await app.inject({
    method: "GET",
    url: "/v1/service/threat-intelligence/vulnerabilities",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  assert.equal(authed.statusCode, 200, "the route must exist at all -- the same gap class this file exists to catch");
  const body = authed.json() as { vulnerabilities: { cveId: string }[] };
  assert.equal(body.vulnerabilities.length, 1);
  assert.equal(body.vulnerabilities[0]?.cveId, "CVE-2024-00001");

  const unauthed = await app.inject({ method: "GET", url: "/v1/service/threat-intelligence/vulnerabilities" });
  assert.equal(unauthed.statusCode, 401);
});

t("GET /v1/service/threat-intelligence/threat-actors is actually registered and reachable, requires a valid bearer token", async () => {
  const { app, apiKey, threatIntelRepo } = await buildApp();
  await createStaffThreatActor(threatIntelRepo, { name: "Emerald Serpent", description: "x" });

  const authed = await app.inject({
    method: "GET",
    url: "/v1/service/threat-intelligence/threat-actors",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  assert.equal(authed.statusCode, 200, "the route must exist at all -- the same gap class this file exists to catch");
  const body = authed.json() as { actors: { name: string }[] };
  assert.equal(body.actors.length, 1);
  assert.equal(body.actors[0]?.name, "Emerald Serpent");

  const unauthed = await app.inject({ method: "GET", url: "/v1/service/threat-intelligence/threat-actors" });
  assert.equal(unauthed.statusCode, 401);
});
