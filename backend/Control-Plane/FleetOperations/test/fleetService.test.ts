import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ingestHeartbeat, computeFleetSummary, FleetOperationsError } from "../src/fleetService.js";
import { FakeFleetOperationsRepository } from "./fakeRepository.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";
import type { Organization } from "../../../Customer-Connections/Desktop-Apps/src/types.js";
import type { FleetHeartbeatInput } from "../src/types.js";

function buildOrg(overrides: Partial<Organization> = {}): Organization {
  return { id: randomUUID(), name: "Test Org", entitlementTier: "standard", createdAt: new Date(), ...overrides };
}

function buildHeartbeatInput(overrides: Partial<FleetHeartbeatInput> = {}): FleetHeartbeatInput {
  return {
    version: "2.4.1",
    installedModules: ["compliance-monitor"],
    licenseState: "active",
    healthScore: 95,
    failedJobCount: 0,
    pendingMigrationCount: 0,
    ...overrides,
  };
}

// --- ingestHeartbeat ---

test("ingestHeartbeat records a heartbeat for a real organization", async () => {
  const fleetRepo = new FakeFleetOperationsRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const org = buildOrg();
  await orgsRepo.createOrganization(org);

  const heartbeat = await ingestHeartbeat(fleetRepo, orgsRepo, org.id, buildHeartbeatInput());

  assert.equal(heartbeat.organizationId, org.id);
  assert.equal(heartbeat.version, "2.4.1");
  assert.equal(fleetRepo.heartbeats.length, 1);
});

test("ingestHeartbeat throws organization_not_found for an unknown org, and never records anything", async () => {
  const fleetRepo = new FakeFleetOperationsRepository();
  const orgsRepo = new FakeOrganizationsRepository();

  await assert.rejects(
    () => ingestHeartbeat(fleetRepo, orgsRepo, "ghost-org", buildHeartbeatInput()),
    (err: unknown) => err instanceof FleetOperationsError && err.code === "organization_not_found",
  );
  assert.equal(fleetRepo.heartbeats.length, 0);
});

test("ingestHeartbeat rejects a healthScore outside 0-100", async () => {
  const fleetRepo = new FakeFleetOperationsRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const org = buildOrg();
  await orgsRepo.createOrganization(org);

  await assert.rejects(
    () => ingestHeartbeat(fleetRepo, orgsRepo, org.id, buildHeartbeatInput({ healthScore: 150 })),
    (err: unknown) => err instanceof FleetOperationsError && err.code === "invalid_health_score",
  );
  await assert.rejects(
    () => ingestHeartbeat(fleetRepo, orgsRepo, org.id, buildHeartbeatInput({ healthScore: -1 })),
    (err: unknown) => err instanceof FleetOperationsError && err.code === "invalid_health_score",
  );
  await assert.rejects(
    () => ingestHeartbeat(fleetRepo, orgsRepo, org.id, buildHeartbeatInput({ healthScore: NaN })),
    (err: unknown) => err instanceof FleetOperationsError && err.code === "invalid_health_score",
  );
});

test("ingestHeartbeat accepts the boundary values 0 and 100", async () => {
  const fleetRepo = new FakeFleetOperationsRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const org = buildOrg();
  await orgsRepo.createOrganization(org);

  await ingestHeartbeat(fleetRepo, orgsRepo, org.id, buildHeartbeatInput({ healthScore: 0 }));
  await ingestHeartbeat(fleetRepo, orgsRepo, org.id, buildHeartbeatInput({ healthScore: 100 }));

  assert.equal(fleetRepo.heartbeats.length, 2);
});

test("ingestHeartbeat does not overwrite a prior heartbeat -- each is its own row", async () => {
  const fleetRepo = new FakeFleetOperationsRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const org = buildOrg();
  await orgsRepo.createOrganization(org);

  await ingestHeartbeat(fleetRepo, orgsRepo, org.id, buildHeartbeatInput({ version: "2.4.0" }));
  await ingestHeartbeat(fleetRepo, orgsRepo, org.id, buildHeartbeatInput({ version: "2.4.1" }));

  assert.equal(fleetRepo.heartbeats.length, 2);
  const history = await fleetRepo.listHeartbeatHistoryForOrg(org.id);
  assert.equal(history.length, 2);
});

// --- computeFleetSummary ---

test("computeFleetSummary reports one summary per organization, using each org's most recent heartbeat", async () => {
  const fleetRepo = new FakeFleetOperationsRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const orgA = buildOrg();
  const orgB = buildOrg();
  await orgsRepo.createOrganization(orgA);
  await orgsRepo.createOrganization(orgB);

  await ingestHeartbeat(fleetRepo, orgsRepo, orgA.id, buildHeartbeatInput({ version: "1.0.0" }), new Date("2026-01-01T00:00:00Z"));
  await ingestHeartbeat(fleetRepo, orgsRepo, orgA.id, buildHeartbeatInput({ version: "1.1.0" }), new Date("2026-01-02T00:00:00Z"));
  await ingestHeartbeat(fleetRepo, orgsRepo, orgB.id, buildHeartbeatInput({ version: "2.0.0" }), new Date("2026-01-01T00:00:00Z"));

  const summary = await computeFleetSummary(fleetRepo, new Date("2026-01-02T00:05:00Z"));

  assert.equal(summary.length, 2);
  const orgASummary = summary.find((s) => s.organizationId === orgA.id)!;
  assert.equal(orgASummary.latestHeartbeat.version, "1.1.0", "should use the most recent heartbeat, not the first");
});

test("computeFleetSummary marks an instance stale when its last heartbeat exceeds the threshold", async () => {
  const fleetRepo = new FakeFleetOperationsRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const org = buildOrg();
  await orgsRepo.createOrganization(org);
  await ingestHeartbeat(fleetRepo, orgsRepo, org.id, buildHeartbeatInput(), new Date("2026-01-01T00:00:00Z"));

  const summary = await computeFleetSummary(fleetRepo, new Date("2026-01-01T00:30:00Z"), 15 * 60 * 1000);

  assert.equal(summary[0]?.stale, true);
});

test("computeFleetSummary marks an instance NOT stale when its last heartbeat is within the threshold", async () => {
  const fleetRepo = new FakeFleetOperationsRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const org = buildOrg();
  await orgsRepo.createOrganization(org);
  await ingestHeartbeat(fleetRepo, orgsRepo, org.id, buildHeartbeatInput(), new Date("2026-01-01T00:00:00Z"));

  const summary = await computeFleetSummary(fleetRepo, new Date("2026-01-01T00:05:00Z"), 15 * 60 * 1000);

  assert.equal(summary[0]?.stale, false);
});

test("computeFleetSummary respects a custom stale threshold, not just the default", async () => {
  const fleetRepo = new FakeFleetOperationsRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const org = buildOrg();
  await orgsRepo.createOrganization(org);
  await ingestHeartbeat(fleetRepo, orgsRepo, org.id, buildHeartbeatInput(), new Date("2026-01-01T00:00:00Z"));

  // 10 minutes elapsed, with a 5-minute threshold -- should be stale even though it's within the DEFAULT 15-minute threshold.
  const summary = await computeFleetSummary(fleetRepo, new Date("2026-01-01T00:10:00Z"), 5 * 60 * 1000);

  assert.equal(summary[0]?.stale, true);
});

test("computeFleetSummary returns an empty array when no org has ever reported in", async () => {
  const fleetRepo = new FakeFleetOperationsRepository();

  const summary = await computeFleetSummary(fleetRepo);

  assert.deepEqual(summary, []);
});
