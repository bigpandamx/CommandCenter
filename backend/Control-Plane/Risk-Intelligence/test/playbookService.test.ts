import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PlaybookError,
  createPlaybook,
  listPlaybooks,
  updatePlaybook,
  updatePlaybookSteps,
  linkPlaybookToRiskFactor,
  unlinkPlaybookFromRiskFactor,
  listPlaybooksForRiskFactor,
  listRiskFactorsForPlaybook,
} from "../src/playbookService.js";
import { createRiskFactor } from "../src/riskFactorService.js";
import { FakeRiskIntelligenceRepository } from "./fakeRepository.js";

test("createPlaybook rejects an invalid key format", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => createPlaybook(repo, { key: "Vendor Outage!", name: "x", description: "x" }),
    (err: unknown) => err instanceof PlaybookError && err.code === "invalid_key",
  );
});

test("createPlaybook rejects a duplicate key", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createPlaybook(repo, { key: "vendor-outage-response", name: "x", description: "x" });
  await assert.rejects(
    () => createPlaybook(repo, { key: "vendor-outage-response", name: "Again", description: "x" }),
    (err: unknown) => err instanceof PlaybookError && err.code === "duplicate_key",
  );
});

test("createPlaybook defaults to an empty steps array -- a draft playbook is an ordinary state, not incomplete", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const playbook = await createPlaybook(repo, { key: "vendor-outage-response", name: "Vendor Outage Response", description: "x" });
  assert.deepEqual(playbook.steps, []);
});

test("createPlaybook accepts steps up front when provided", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const playbook = await createPlaybook(repo, {
    key: "vendor-outage-response",
    name: "Vendor Outage Response",
    description: "x",
    steps: [
      { title: "Notify affected customers", description: "Send a Risk Notice to every org affected by this vendor." },
      { title: "Activate backup provider", description: "Fail over to the secondary provider if one is configured." },
    ],
  });
  assert.equal(playbook.steps.length, 2);
  assert.equal(playbook.steps[0]?.title, "Notify affected customers");
});

// --- Steps: replaced as a unit, order preserved ---

test("updatePlaybookSteps replaces the whole steps array, preserving order", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createPlaybook(repo, {
    key: "vendor-outage-response",
    name: "x",
    description: "x",
    steps: [{ title: "Step 1", description: "x" }],
  });

  const updated = await updatePlaybookSteps(repo, "vendor-outage-response", [
    { title: "Notify customers", description: "x" },
    { title: "Failover", description: "x" },
    { title: "Post-mortem", description: "x" },
  ]);

  assert.deepEqual(updated.steps.map((s) => s.title), ["Notify customers", "Failover", "Post-mortem"]);
});

test("updatePlaybookSteps throws playbook_not_found for an unknown key", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => updatePlaybookSteps(repo, "ghost-playbook", []),
    (err: unknown) => err instanceof PlaybookError && err.code === "playbook_not_found",
  );
});

// --- Metadata updates ---

test("updatePlaybook updates name and description without touching steps", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createPlaybook(repo, {
    key: "vendor-outage-response",
    name: "Original Name",
    description: "Original description.",
    steps: [{ title: "Step 1", description: "x" }],
  });

  const updated = await updatePlaybook(repo, "vendor-outage-response", { name: "Vendor Outage Response Playbook" });

  assert.equal(updated.name, "Vendor Outage Response Playbook");
  assert.equal(updated.steps.length, 1, "updating metadata must not touch steps");
});

// --- Browsing ---

test("listPlaybooks orders by name", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await createPlaybook(repo, { key: "z-playbook", name: "Z Playbook", description: "x" });
  await createPlaybook(repo, { key: "a-playbook", name: "A Playbook", description: "x" });

  const playbooks = await listPlaybooks(repo);

  assert.deepEqual(playbooks.map((p) => p.key), ["a-playbook", "z-playbook"]);
});

// --- The load-bearing link: "is there a playbook for this kind of risk" ---

test("linkPlaybookToRiskFactor connects a playbook to a risk factor, retrievable both directions", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const playbook = await createPlaybook(repo, { key: "vendor-outage-response", name: "Vendor Outage Response", description: "x" });
  const factor = await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });

  await linkPlaybookToRiskFactor(repo, playbook.key, factor.key);

  const playbooksForFactor = await listPlaybooksForRiskFactor(repo, factor.key);
  const factorsForPlaybook = await listRiskFactorsForPlaybook(repo, playbook.key);

  assert.equal(playbooksForFactor.length, 1);
  assert.equal(playbooksForFactor[0]?.key, playbook.key);
  assert.equal(factorsForPlaybook.length, 1);
  assert.equal(factorsForPlaybook[0]?.key, factor.key);
});

test("a playbook can be linked to multiple risk factors -- e.g. a vendor outage playbook applies to both Vendor Risk and AI Risk", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const playbook = await createPlaybook(repo, { key: "vendor-outage-response", name: "Vendor Outage Response", description: "x" });
  const vendorRisk = await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });
  const aiRisk = await createRiskFactor(repo, { key: "ai-risk", name: "AI Risk", description: "x" });

  await linkPlaybookToRiskFactor(repo, playbook.key, vendorRisk.key);
  await linkPlaybookToRiskFactor(repo, playbook.key, aiRisk.key);

  const factors = await listRiskFactorsForPlaybook(repo, playbook.key);

  assert.equal(factors.length, 2);
});

test("a risk factor with no linked playbook returns an empty list, not an error -- an ordinary state, the same as an unclassified insight", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const factor = await createRiskFactor(repo, { key: "vendor-risk", name: "Vendor Risk", description: "x" });

  const playbooks = await listPlaybooksForRiskFactor(repo, factor.key);

  assert.deepEqual(playbooks, []);
});

test("unlinkPlaybookFromRiskFactor removes the link", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const playbook = await createPlaybook(repo, { key: "vendor-outage-response", name: "x", description: "x" });
  const factor = await createRiskFactor(repo, { key: "vendor-risk", name: "x", description: "x" });
  await linkPlaybookToRiskFactor(repo, playbook.key, factor.key);

  await unlinkPlaybookFromRiskFactor(repo, playbook.key, factor.key);

  const remaining = await listPlaybooksForRiskFactor(repo, factor.key);
  assert.deepEqual(remaining, []);
});

test("linkPlaybookToRiskFactor throws risk_factor_not_found for an unknown factor key", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const playbook = await createPlaybook(repo, { key: "vendor-outage-response", name: "x", description: "x" });

  await assert.rejects(
    () => linkPlaybookToRiskFactor(repo, playbook.key, "ghost-factor"),
    (err: unknown) => err instanceof PlaybookError && err.code === "risk_factor_not_found",
  );
});
