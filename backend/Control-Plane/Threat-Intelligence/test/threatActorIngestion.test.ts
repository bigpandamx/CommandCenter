import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ThreatActorError,
  ingestThreatActors,
  createStaffThreatActor,
  listThreatActors,
  setThreatActorActive,
  setThreatActorGeography,
} from "../src/threatActorIngestion.js";
import type { ThreatActor } from "../src/types.js";
import { FakeThreatIntelRepository } from "../test/fakeRepository.js";

function buildActor(overrides: Partial<ThreatActor> = {}): ThreatActor {
  return {
    id: "",
    mitreGroupId: "G0016",
    name: "APT29",
    aliases: ["Cozy Bear"],
    description: "x",
    source: "mitre_attack",
    isActive: true,
    relatedPatternIds: null,
    originCountry: null,
    targetedCountries: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

test("ingestThreatActors inserts a new MITRE-sourced actor not previously seen", async () => {
  const repo = new FakeThreatIntelRepository();
  const summary = await ingestThreatActors(repo, [buildActor()]);

  assert.deepEqual(summary, { inserted: 1, updated: 0, failed: 0 });
  const actors = await listThreatActors(repo);
  assert.equal(actors.length, 1);
  assert.notEqual(actors[0]!.id, "");
});

test("re-ingesting the same mitreGroupId updates the existing row rather than creating a duplicate", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestThreatActors(repo, [buildActor({ description: "Old description" })]);
  const summary = await ingestThreatActors(repo, [buildActor({ description: "Updated description" })]);

  assert.deepEqual(summary, { inserted: 0, updated: 1, failed: 0 });
  const actors = await listThreatActors(repo);
  assert.equal(actors.length, 1);
  assert.equal(actors[0]!.description, "Updated description");
});

test("re-ingesting preserves a staff-set isActive/relatedPatternIds rather than overwriting them from the MITRE sync", async () => {
  const repo = new FakeThreatIntelRepository();
  const first = await ingestThreatActors(repo, [buildActor()]);
  assert.equal(first.inserted, 1);

  const actors = await listThreatActors(repo);
  await setThreatActorActive(repo, actors[0]!.id, false);

  await ingestThreatActors(repo, [buildActor({ description: "Refreshed from MITRE" })]);

  const afterResync = await listThreatActors(repo);
  assert.equal(afterResync[0]!.isActive, false, "a staff deactivation must survive a MITRE re-sync");
  assert.equal(afterResync[0]!.description, "Refreshed from MITRE", "the description itself is still refreshed from MITRE");
});

test("two actors with a null mitreGroupId are never matched against each other -- both insert as distinct rows", async () => {
  const repo = new FakeThreatIntelRepository();
  const summary = await ingestThreatActors(repo, [
    buildActor({ mitreGroupId: null, name: "Unknown Group A" }),
    buildActor({ mitreGroupId: null, name: "Unknown Group B" }),
  ]);

  assert.deepEqual(summary, { inserted: 2, updated: 0, failed: 0 });
});

test("ingestThreatActors is resilient to one bad item -- the rest of the batch still ingests", async () => {
  const repo = new FakeThreatIntelRepository();
  const good = buildActor({ mitreGroupId: "G0016" });
  const bad = buildActor({ mitreGroupId: "G0032" });

  const originalGet = repo.getThreatActorByMitreGroupId.bind(repo);
  repo.getThreatActorByMitreGroupId = async (id: string) => {
    if (id === "G0032") throw new Error("simulated failure");
    return originalGet(id);
  };

  const summary = await ingestThreatActors(repo, [good, bad]);
  assert.equal(summary.inserted, 1);
  assert.equal(summary.failed, 1);
});

test("createStaffThreatActor always sets source to staff_curated with a null mitreGroupId", async () => {
  const repo = new FakeThreatIntelRepository();
  const actor = await createStaffThreatActor(repo, { name: "Locally Observed Group", description: "Seen in our own incident response." });

  assert.equal(actor.source, "staff_curated");
  assert.equal(actor.mitreGroupId, null);
  assert.equal(actor.isActive, true);
});

test("createStaffThreatActor accepts optional aliases and relatedPatternIds, defaulting to null when omitted", async () => {
  const repo = new FakeThreatIntelRepository();
  const withExtras = await createStaffThreatActor(repo, {
    name: "x",
    description: "x",
    aliases: ["Alias One"],
    relatedPatternIds: ["pattern-1"],
  });
  const withoutExtras = await createStaffThreatActor(repo, { name: "y", description: "x" });

  assert.deepEqual(withExtras.aliases, ["Alias One"]);
  assert.deepEqual(withExtras.relatedPatternIds, ["pattern-1"]);
  assert.equal(withoutExtras.aliases, null);
  assert.equal(withoutExtras.relatedPatternIds, null);
});

test("listThreatActors filters by source, isActive, and text (matching name or alias)", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestThreatActors(repo, [buildActor({ mitreGroupId: "G0016", name: "APT29", aliases: ["Cozy Bear"] })]);
  await createStaffThreatActor(repo, { name: "Local Group", description: "x" });

  const mitreOnly = await listThreatActors(repo, { source: "mitre_attack" });
  assert.equal(mitreOnly.length, 1);
  assert.equal(mitreOnly[0]!.name, "APT29");

  const byAlias = await listThreatActors(repo, { text: "cozy" });
  assert.equal(byAlias.length, 1);
  assert.equal(byAlias[0]!.name, "APT29");
});

test("setThreatActorActive throws actor_not_found for an unknown id", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => setThreatActorActive(repo, "ghost-actor", false),
    (err: unknown) => err instanceof ThreatActorError && err.code === "actor_not_found",
  );
});

test("setThreatActorGeography is the only way to tag geography on a MITRE-sourced actor -- confirms it's editable after ingestion, not just at staff-creation time", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestThreatActors(repo, [buildActor({ mitreGroupId: "G0016" })]);
  const [stored] = await listThreatActors(repo);

  const tagged = await setThreatActorGeography(repo, stored!.id, { originCountry: "Russia", targetedCountries: ["United States", "Germany"] });
  assert.equal(tagged.originCountry, "Russia");
  assert.deepEqual(tagged.targetedCountries, ["United States", "Germany"]);
});

test("setThreatActorGeography: omitting a field leaves it unchanged, but explicitly passing null clears originCountry", async () => {
  const repo = new FakeThreatIntelRepository();
  const actor = await createStaffThreatActor(repo, { name: "x", description: "x", originCountry: "China" });

  const partial = await setThreatActorGeography(repo, actor.id, { targetedCountries: ["Japan"] });
  assert.equal(partial.originCountry, "China", "omitted field stays as-is");
  assert.deepEqual(partial.targetedCountries, ["Japan"]);

  const cleared = await setThreatActorGeography(repo, actor.id, { originCountry: null });
  assert.equal(cleared.originCountry, null, "explicit null clears a previously-set value");
});

test("setThreatActorGeography normalizes an empty targetedCountries array to null, same convention as every other array field", async () => {
  const repo = new FakeThreatIntelRepository();
  const actor = await createStaffThreatActor(repo, { name: "x", description: "x", targetedCountries: ["France"] });

  const cleared = await setThreatActorGeography(repo, actor.id, { targetedCountries: [] });
  assert.equal(cleared.targetedCountries, null);
});

test("the actual point of this ingestion round's own design: staff-tagged geography survives re-sync, exactly like isActive already does", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestThreatActors(repo, [buildActor({ mitreGroupId: "G0016", description: "Old description" })]);
  const [stored] = await listThreatActors(repo);
  await setThreatActorGeography(repo, stored!.id, { originCountry: "Russia", targetedCountries: ["United States"] });

  await ingestThreatActors(repo, [buildActor({ mitreGroupId: "G0016", description: "Updated description" })]);

  const [afterResync] = await listThreatActors(repo);
  assert.equal(afterResync!.description, "Updated description", "MITRE's own data still refreshes normally");
  assert.equal(afterResync!.originCountry, "Russia", "but the staff-tagged geography survives, same as isActive");
  assert.deepEqual(afterResync!.targetedCountries, ["United States"]);
});

test("setThreatActorGeography throws actor_not_found for an unknown id", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => setThreatActorGeography(repo, "ghost-actor", { originCountry: "Russia" }),
    (err: unknown) => err instanceof ThreatActorError && err.code === "actor_not_found",
  );
});
