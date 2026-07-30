import { test } from "node:test";
import assert from "node:assert/strict";
import { getCustomerGeographicFootprint, getGeographicThreatMatches } from "../src/geographicIntelligence.js";
import { createStaffThreatActor, setThreatActorGeography } from "../src/threatActorIngestion.js";
import { createStaffCampaign, setCampaignGeography } from "../src/campaignIngestion.js";
import { FakeThreatIntelRepository } from "../test/fakeRepository.js";
import { signUpOrganization } from "../../Organizations/src/signup.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";

test("getCustomerGeographicFootprint counts organizations per disclosed country", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  await signUpOrganization(orgsRepo, { organizationName: "Acme US 1", primaryContactName: "x", primaryContactEmail: "a@x.example", country: "United States" });
  await signUpOrganization(orgsRepo, { organizationName: "Acme US 2", primaryContactName: "x", primaryContactEmail: "b@x.example", country: "United States" });
  await signUpOrganization(orgsRepo, { organizationName: "Acme DE", primaryContactName: "x", primaryContactEmail: "c@x.example", country: "Germany" });

  const footprint = await getCustomerGeographicFootprint(orgsRepo);
  assert.equal(footprint.length, 2);
  assert.deepEqual(footprint[0], { country: "United States", organizationCount: 2 }, "sorted descending by count");
  assert.deepEqual(footprint[1], { country: "Germany", organizationCount: 1 });
});

test("getCustomerGeographicFootprint excludes organizations with no country on file -- not counted as an 'unknown' bucket", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  await signUpOrganization(orgsRepo, { organizationName: "No Country Corp", primaryContactName: "x", primaryContactEmail: "a@x.example" });
  await signUpOrganization(orgsRepo, { organizationName: "Has Country Corp", primaryContactName: "x", primaryContactEmail: "b@x.example", country: "Japan" });

  const footprint = await getCustomerGeographicFootprint(orgsRepo);
  assert.equal(footprint.length, 1);
  assert.equal(footprint[0]?.country, "Japan");
});

test("getGeographicThreatMatches resolves originating and targeting actors/campaigns independently for a country with customers", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  const threatRepo = new FakeThreatIntelRepository();
  await signUpOrganization(orgsRepo, { organizationName: "Acme US", primaryContactName: "x", primaryContactEmail: "a@x.example", country: "United States" });

  const originatingActor = await createStaffThreatActor(threatRepo, { name: "Originates From US", description: "x" });
  await setThreatActorGeography(threatRepo, originatingActor.id, { originCountry: "United States" });

  const targetingActor = await createStaffThreatActor(threatRepo, { name: "Targets US", description: "x" });
  await setThreatActorGeography(threatRepo, targetingActor.id, { targetedCountries: ["United States", "Canada"] });

  const originatingCampaign = await createStaffCampaign(threatRepo, { name: "Campaign From US", description: "x" });
  await setCampaignGeography(threatRepo, originatingCampaign.id, { originCountry: "United States" });

  const matches = await getGeographicThreatMatches(orgsRepo, threatRepo);
  assert.equal(matches.length, 1);
  const [usMatch] = matches;
  assert.equal(usMatch!.country, "United States");
  assert.equal(usMatch!.organizationCount, 1);
  assert.deepEqual(
    usMatch!.originatingActors.map((a) => a.name),
    ["Originates From US"],
  );
  assert.deepEqual(
    usMatch!.targetingActors.map((a) => a.name),
    ["Targets US"],
  );
  assert.deepEqual(
    usMatch!.originatingCampaigns.map((c) => c.name),
    ["Campaign From US"],
  );
  assert.deepEqual(usMatch!.targetingCampaigns, []);
});

test("the actual point of this cross-reference: matches case-insensitively, a real honest text match not a validated hierarchy", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  const threatRepo = new FakeThreatIntelRepository();
  await signUpOrganization(orgsRepo, { organizationName: "Acme", primaryContactName: "x", primaryContactEmail: "a@x.example", country: "united states" });

  const actor = await createStaffThreatActor(threatRepo, { name: "x", description: "x" });
  await setThreatActorGeography(threatRepo, actor.id, { originCountry: "UNITED STATES" });

  const matches = await getGeographicThreatMatches(orgsRepo, threatRepo);
  assert.equal(matches[0]?.originatingActors.length, 1, "differing case on both sides still matches");
});

test("a threat actor with no geography tagged at all doesn't appear in any country's match -- an honest reflection of what staff haven't tagged, not a bug", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  const threatRepo = new FakeThreatIntelRepository();
  await signUpOrganization(orgsRepo, { organizationName: "Acme", primaryContactName: "x", primaryContactEmail: "a@x.example", country: "France" });
  await createStaffThreatActor(threatRepo, { name: "Untagged Actor", description: "x" });

  const matches = await getGeographicThreatMatches(orgsRepo, threatRepo);
  assert.equal(matches[0]?.originatingActors.length, 0);
  assert.equal(matches[0]?.targetingActors.length, 0);
});

test("getGeographicThreatMatches returns an empty array when no organization has a disclosed country -- not an error", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  const threatRepo = new FakeThreatIntelRepository();
  await signUpOrganization(orgsRepo, { organizationName: "Acme", primaryContactName: "x", primaryContactEmail: "a@x.example" });

  const matches = await getGeographicThreatMatches(orgsRepo, threatRepo);
  assert.deepEqual(matches, []);
});
