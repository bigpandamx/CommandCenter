import { test } from "node:test";
import assert from "node:assert/strict";
import { TechniqueError, ingestTechniques, listTechniques, setTechniqueActive } from "../src/techniqueIngestion.js";
import type { Technique } from "../src/types.js";
import { FakeThreatIntelRepository } from "../test/fakeRepository.js";

function buildTechnique(overrides: Partial<Technique> = {}): Technique {
  return {
    id: "",
    mitreTechniqueId: "T1566",
    name: "Phishing",
    description: "x",
    tactics: ["initial-access"],
    isSubtechnique: false,
    parentMitreTechniqueId: null,
    platforms: ["Windows"],
    usedByActorMitreGroupIds: ["G0016"],
    usedByCampaignMitreCampaignIds: null,
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

test("ingestTechniques inserts a new MITRE-sourced technique not previously seen", async () => {
  const repo = new FakeThreatIntelRepository();
  const summary = await ingestTechniques(repo, [buildTechnique()]);

  assert.deepEqual(summary, { inserted: 1, updated: 0, failed: 0 });
  const techniques = await listTechniques(repo);
  assert.equal(techniques.length, 1);
  assert.notEqual(techniques[0]!.id, "");
});

test("re-ingesting the same mitreTechniqueId updates the existing row rather than creating a duplicate", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestTechniques(repo, [buildTechnique({ description: "Old description" })]);
  const summary = await ingestTechniques(repo, [buildTechnique({ description: "Updated description" })]);

  assert.deepEqual(summary, { inserted: 0, updated: 1, failed: 0 });
  const techniques = await listTechniques(repo);
  assert.equal(techniques.length, 1);
  assert.equal(techniques[0]!.description, "Updated description");
});

test("the actual point of this ingestion's own design: isActive is preserved across re-sync, but both usage-attribution fields are refreshed from the incoming MITRE data", async () => {
  const repo = new FakeThreatIntelRepository();
  const inserted = await ingestTechniques(repo, [buildTechnique({ usedByActorMitreGroupIds: null, usedByCampaignMitreCampaignIds: null })]);
  assert.equal(inserted.inserted, 1);

  const [stored] = await listTechniques(repo);
  await setTechniqueActive(repo, stored!.id, false);

  const resynced = await ingestTechniques(
    repo,
    [buildTechnique({ usedByActorMitreGroupIds: ["G0016"], usedByCampaignMitreCampaignIds: ["C0024"] })],
  );
  assert.equal(resynced.updated, 1);

  const [afterResync] = await listTechniques(repo);
  assert.equal(afterResync!.isActive, false, "the staff decision survives the re-sync");
  assert.deepEqual(afterResync!.usedByActorMitreGroupIds, ["G0016"], "actor usage refreshes from MITRE's own data, unlike isActive");
  assert.deepEqual(afterResync!.usedByCampaignMitreCampaignIds, ["C0024"], "campaign usage refreshes from MITRE's own data too");
});

test("a technique with a null mitreTechniqueId is always treated as new -- never matched against an existing null-id row", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestTechniques(repo, [buildTechnique({ mitreTechniqueId: null, name: "First unnamed technique" })]);
  const summary = await ingestTechniques(repo, [buildTechnique({ mitreTechniqueId: null, name: "Second unnamed technique" })]);

  assert.equal(summary.inserted, 1);
  const techniques = await listTechniques(repo);
  assert.equal(techniques.length, 2);
});

test("ingestTechniques is resilient to one bad item -- the rest of the batch still ingests, tracked as failed not thrown", async () => {
  const repo = new FakeThreatIntelRepository();
  const goodOne = buildTechnique({ mitreTechniqueId: "T1001" });
  const goodTwo = buildTechnique({ mitreTechniqueId: "T1002" });

  const originalGet = repo.getTechniqueByMitreTechniqueId.bind(repo);
  repo.getTechniqueByMitreTechniqueId = async (id: string) => {
    if (id === "T1002") throw new Error("simulated failure");
    return originalGet(id);
  };

  const summary = await ingestTechniques(repo, [goodOne, goodTwo]);
  assert.equal(summary.inserted, 1);
  assert.equal(summary.failed, 1);
});

test("listTechniques filters by tactic, isSubtechnique, isActive, and text", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestTechniques(repo, [
    buildTechnique({ mitreTechniqueId: "T1566", name: "Phishing", tactics: ["initial-access"], isSubtechnique: false }),
    buildTechnique({ mitreTechniqueId: "T1566.001", name: "Spearphishing Attachment", tactics: ["initial-access"], isSubtechnique: true, parentMitreTechniqueId: "T1566" }),
    buildTechnique({ mitreTechniqueId: "T1055", name: "Process Injection", tactics: ["defense-evasion", "privilege-escalation"], isSubtechnique: false }),
  ]);

  const initialAccess = await listTechniques(repo, { tactic: "initial-access" });
  assert.equal(initialAccess.length, 2);

  const topLevelOnly = await listTechniques(repo, { tactic: "initial-access", isSubtechnique: false });
  assert.equal(topLevelOnly.length, 1);
  assert.equal(topLevelOnly[0]!.name, "Phishing");

  const textSearch = await listTechniques(repo, { text: "injection" });
  assert.equal(textSearch.length, 1);
  assert.equal(textSearch[0]!.name, "Process Injection");
});

test("setTechniqueActive throws technique_not_found for an unknown id", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => setTechniqueActive(repo, "ghost-technique", false),
    (err: unknown) => err instanceof TechniqueError && err.code === "technique_not_found",
  );
});
