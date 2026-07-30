import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RiskKnowledgeError,
  createRiskKnowledgeEntry,
  listRiskKnowledgeEntries,
  listMitigations,
  updateRiskKnowledgeEntry,
} from "../src/riskKnowledgeService.js";
import { FakeRiskIntelligenceRepository } from "./fakeRepository.js";

test("createRiskKnowledgeEntry rejects an invalid key format", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => createRiskKnowledgeEntry(repo, { category: "threat_type", key: "Prompt Injection!", name: "x", description: "x" }),
    (err: unknown) => err instanceof RiskKnowledgeError && err.code === "invalid_key",
  );
});

// --- treatmentType required/forbidden rule ---

test("a 'treatment' entry requires a treatmentType", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => createRiskKnowledgeEntry(repo, { category: "treatment", key: "rotate-credentials", name: "x", description: "x" }),
    (err: unknown) => err instanceof RiskKnowledgeError && err.code === "treatment_type_required",
  );
});

test("a non-'treatment' entry rejects a treatmentType -- it shouldn't be able to carry one at all", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => createRiskKnowledgeEntry(repo, { category: "threat_type", key: "prompt-injection", name: "x", description: "x", treatmentType: "mitigate" }),
    (err: unknown) => err instanceof RiskKnowledgeError && err.code === "treatment_type_not_applicable",
  );
});

test("a 'treatment' entry with a valid treatmentType is created successfully", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const entry = await createRiskKnowledgeEntry(repo, {
    category: "treatment",
    key: "rotate-credentials",
    name: "Rotate API Credentials",
    description: "Rotate any credentials potentially exposed by the incident.",
    treatmentType: "mitigate",
  });

  assert.equal(entry.treatmentType, "mitigate");
});

// --- Category namespacing: key unique per category, not globally ---

test("the same key can exist under two different categories without colliding", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskKnowledgeEntry(repo, { category: "threat_type", key: "vendor-outage", name: "Vendor Outage", description: "x" });

  // Same key, different category -- should NOT throw duplicate_key.
  const riskType = await createRiskKnowledgeEntry(repo, { category: "risk_type", key: "vendor-outage", name: "Vendor Outage Risk", description: "x" });

  assert.equal(riskType.category, "risk_type");
});

test("createRiskKnowledgeEntry rejects a genuine duplicate -- same category, same key", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskKnowledgeEntry(repo, { category: "threat_type", key: "prompt-injection", name: "x", description: "x" });

  await assert.rejects(
    () => createRiskKnowledgeEntry(repo, { category: "threat_type", key: "prompt-injection", name: "Again", description: "x" }),
    (err: unknown) => err instanceof RiskKnowledgeError && err.code === "duplicate_key",
  );
});

// --- Browsing ---

test("listRiskKnowledgeEntries only returns entries in the requested category", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskKnowledgeEntry(repo, { category: "threat_type", key: "prompt-injection", name: "Prompt Injection", description: "x" });
  await createRiskKnowledgeEntry(repo, { category: "industry", key: "agriculture", name: "Agriculture", description: "x" });

  const threatTypes = await listRiskKnowledgeEntries(repo, "threat_type");

  assert.equal(threatTypes.length, 1);
  assert.equal(threatTypes[0]?.key, "prompt-injection");
});

test("listRiskKnowledgeEntries orders by name", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskKnowledgeEntry(repo, { category: "industry", key: "z", name: "Z Industry", description: "x" });
  await createRiskKnowledgeEntry(repo, { category: "industry", key: "a", name: "A Industry", description: "x" });

  const entries = await listRiskKnowledgeEntries(repo, "industry");

  assert.deepEqual(entries.map((e) => e.key), ["a", "z"]);
});

// --- "Mitigations" as a filtered view of treatment entries, not a separate category ---

test("listMitigations returns only treatment entries with treatmentType 'mitigate'", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskKnowledgeEntry(repo, { category: "treatment", key: "rotate-credentials", name: "Rotate Credentials", description: "x", treatmentType: "mitigate" });
  await createRiskKnowledgeEntry(repo, { category: "treatment", key: "purchase-insurance", name: "Purchase Insurance", description: "x", treatmentType: "transfer" });
  await createRiskKnowledgeEntry(repo, { category: "treatment", key: "accept-as-is", name: "Accept As-Is", description: "x", treatmentType: "accept" });

  const mitigations = await listMitigations(repo);

  assert.equal(mitigations.length, 1);
  assert.equal(mitigations[0]?.key, "rotate-credentials");
});

test("listMitigations returns an empty array when no mitigate-type entries exist yet -- not an error", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskKnowledgeEntry(repo, { category: "treatment", key: "purchase-insurance", name: "Purchase Insurance", description: "x", treatmentType: "transfer" });

  const mitigations = await listMitigations(repo);

  assert.deepEqual(mitigations, []);
});

// --- Updates ---

test("updateRiskKnowledgeEntry updates name and description in place", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createRiskKnowledgeEntry(repo, { category: "industry", key: "agriculture", name: "Agriculture", description: "Original description." });

  const updated = await updateRiskKnowledgeEntry(repo, "industry", "agriculture", { description: "Refined description." });

  assert.equal(updated.description, "Refined description.");
  assert.equal(updated.name, "Agriculture", "an omitted field stays unchanged");
});

test("updateRiskKnowledgeEntry throws entry_not_found for an unknown category/key pair", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => updateRiskKnowledgeEntry(repo, "industry", "ghost-industry", { description: "x" }),
    (err: unknown) => err instanceof RiskKnowledgeError && err.code === "entry_not_found",
  );
});
