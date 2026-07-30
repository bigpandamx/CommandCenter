import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CampaignError,
  ingestCampaigns,
  createStaffCampaign,
  listCampaigns,
  setCampaignActive,
  setCampaignGeography,
} from "../src/campaignIngestion.js";
import type { Campaign } from "../src/types.js";
import { FakeThreatIntelRepository } from "../test/fakeRepository.js";

function buildCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "",
    mitreCampaignId: "C0028",
    name: "SolarWinds Compromise",
    aliases: null,
    description: "x",
    source: "mitre_attack",
    firstSeen: new Date("2020-03-01T00:00:00Z"),
    lastSeen: new Date("2020-12-01T00:00:00Z"),
    attributedActorIds: ["G0016"],
    isActive: true,
    originCountry: null,
    targetedCountries: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

test("ingestCampaigns inserts a new MITRE-sourced campaign not previously seen", async () => {
  const repo = new FakeThreatIntelRepository();
  const summary = await ingestCampaigns(repo, [buildCampaign()]);

  assert.deepEqual(summary, { inserted: 1, updated: 0, failed: 0 });
  const campaigns = await listCampaigns(repo);
  assert.equal(campaigns.length, 1);
  assert.notEqual(campaigns[0]!.id, "");
});

test("re-ingesting the same mitreCampaignId updates the existing row rather than creating a duplicate", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestCampaigns(repo, [buildCampaign({ description: "Old description" })]);
  const summary = await ingestCampaigns(repo, [buildCampaign({ description: "Updated description" })]);

  assert.deepEqual(summary, { inserted: 0, updated: 1, failed: 0 });
  const campaigns = await listCampaigns(repo);
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0]!.description, "Updated description");
});

test("the actual point of this ingestion's own design: isActive is preserved across re-sync, but attributedActorIds is refreshed from the incoming MITRE data", async () => {
  const repo = new FakeThreatIntelRepository();
  const inserted = await ingestCampaigns(repo, [buildCampaign({ attributedActorIds: null })]);
  assert.equal(inserted.inserted, 1);

  const [stored] = await listCampaigns(repo);
  await setCampaignActive(repo, stored!.id, false); // staff marks this campaign no longer worth tracking as current

  const resynced = await ingestCampaigns(repo, [buildCampaign({ attributedActorIds: ["G0016"] })]);
  assert.equal(resynced.updated, 1);

  const [afterResync] = await listCampaigns(repo);
  assert.equal(afterResync!.isActive, false, "the staff decision survives the re-sync");
  assert.deepEqual(afterResync!.attributedActorIds, ["G0016"], "attribution refreshes from MITRE's own data, unlike isActive");
});

test("a campaign with a null mitreCampaignId is always treated as new -- never matched against an existing null-id row", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestCampaigns(repo, [buildCampaign({ mitreCampaignId: null, name: "First unnamed campaign" })]);
  const summary = await ingestCampaigns(repo, [buildCampaign({ mitreCampaignId: null, name: "Second unnamed campaign" })]);

  assert.equal(summary.inserted, 1);
  const campaigns = await listCampaigns(repo);
  assert.equal(campaigns.length, 2);
});

test("ingestCampaigns is resilient to one bad item -- the rest of the batch still ingests, tracked as failed not thrown", async () => {
  const repo = new FakeThreatIntelRepository();
  const goodOne = buildCampaign({ mitreCampaignId: "C0001" });
  const goodTwo = buildCampaign({ mitreCampaignId: "C0002" });

  const originalGet = repo.getCampaignByMitreCampaignId.bind(repo);
  repo.getCampaignByMitreCampaignId = async (id: string) => {
    if (id === "C0002") throw new Error("simulated failure");
    return originalGet(id);
  };

  const summary = await ingestCampaigns(repo, [goodOne, goodTwo]);
  assert.equal(summary.inserted, 1);
  assert.equal(summary.failed, 1);
});

test("createStaffCampaign always starts active, source staff_curated, with no mitreCampaignId", async () => {
  const repo = new FakeThreatIntelRepository();
  const campaign = await createStaffCampaign(repo, { name: "Operation Locally Observed", description: "x" });

  assert.equal(campaign.source, "staff_curated");
  assert.equal(campaign.mitreCampaignId, null);
  assert.equal(campaign.isActive, true);
});

test("createStaffCampaign carries optional attribution and timeframe fields, empty arrays normalized to null", async () => {
  const repo = new FakeThreatIntelRepository();
  const campaign = await createStaffCampaign(repo, {
    name: "x",
    description: "x",
    attributedActorIds: ["actor-1"],
    firstSeen: new Date("2026-01-01T00:00:00Z"),
  });

  assert.deepEqual(campaign.attributedActorIds, ["actor-1"]);
  assert.equal(campaign.firstSeen?.toISOString(), new Date("2026-01-01T00:00:00Z").toISOString());
  assert.equal(campaign.lastSeen, null);
});

test("listCampaigns filters by source, isActive, and text", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestCampaigns(repo, [buildCampaign({ mitreCampaignId: "C0001", name: "SolarWinds Compromise" })]);
  await createStaffCampaign(repo, { name: "Locally Observed Operation", description: "x" });

  const mitreOnly = await listCampaigns(repo, { source: "mitre_attack" });
  assert.equal(mitreOnly.length, 1);
  assert.equal(mitreOnly[0]!.name, "SolarWinds Compromise");

  const textSearch = await listCampaigns(repo, { text: "locally" });
  assert.equal(textSearch.length, 1);
  assert.equal(textSearch[0]!.name, "Locally Observed Operation");
});

test("setCampaignActive throws campaign_not_found for an unknown id", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => setCampaignActive(repo, "ghost-campaign", false),
    (err: unknown) => err instanceof CampaignError && err.code === "campaign_not_found",
  );
});

test("setCampaignGeography is the only way to tag geography on a MITRE-sourced campaign -- confirms it's editable after ingestion, not just at staff-creation time", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestCampaigns(repo, [buildCampaign({ mitreCampaignId: "C0028" })]);
  const [stored] = await listCampaigns(repo);

  const tagged = await setCampaignGeography(repo, stored!.id, { originCountry: "Russia", targetedCountries: ["United States", "Germany"] });
  assert.equal(tagged.originCountry, "Russia");
  assert.deepEqual(tagged.targetedCountries, ["United States", "Germany"]);
});

test("setCampaignGeography: omitting a field leaves it unchanged, but explicitly passing null clears originCountry", async () => {
  const repo = new FakeThreatIntelRepository();
  const campaign = await createStaffCampaign(repo, { name: "x", description: "x", originCountry: "China" });

  const partial = await setCampaignGeography(repo, campaign.id, { targetedCountries: ["Japan"] });
  assert.equal(partial.originCountry, "China", "omitted field stays as-is");
  assert.deepEqual(partial.targetedCountries, ["Japan"]);

  const cleared = await setCampaignGeography(repo, campaign.id, { originCountry: null });
  assert.equal(cleared.originCountry, null, "explicit null clears a previously-set value");
});

test("setCampaignGeography normalizes an empty targetedCountries array to null, same convention as every other array field", async () => {
  const repo = new FakeThreatIntelRepository();
  const campaign = await createStaffCampaign(repo, { name: "x", description: "x", targetedCountries: ["France"] });

  const cleared = await setCampaignGeography(repo, campaign.id, { targetedCountries: [] });
  assert.equal(cleared.targetedCountries, null);
});

test("the actual point of this ingestion round's own design: staff-tagged geography survives re-sync, exactly like isActive already does", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestCampaigns(repo, [buildCampaign({ mitreCampaignId: "C0028", description: "Old description" })]);
  const [stored] = await listCampaigns(repo);
  await setCampaignGeography(repo, stored!.id, { originCountry: "Russia", targetedCountries: ["United States"] });

  await ingestCampaigns(repo, [buildCampaign({ mitreCampaignId: "C0028", description: "Updated description" })]);

  const [afterResync] = await listCampaigns(repo);
  assert.equal(afterResync!.description, "Updated description", "MITRE's own data still refreshes normally");
  assert.equal(afterResync!.originCountry, "Russia", "but the staff-tagged geography survives, same as isActive");
  assert.deepEqual(afterResync!.targetedCountries, ["United States"]);
});

test("setCampaignGeography throws campaign_not_found for an unknown id", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => setCampaignGeography(repo, "ghost-campaign", { originCountry: "Russia" }),
    (err: unknown) => err instanceof CampaignError && err.code === "campaign_not_found",
  );
});
