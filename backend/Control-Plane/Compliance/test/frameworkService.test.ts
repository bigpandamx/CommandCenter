import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ComplianceFrameworkError,
  createFramework,
  listFrameworks,
  addControlToFramework,
  removeControlFromFramework,
  listControlsForFramework,
  computeFrameworkCoverage,
} from "../src/frameworkService.js";
import { createControl, mapObligationToControl } from "../src/controlService.js";
import { FakeComplianceRepository } from "../test/fakeRepository.js";

test("createFramework rejects an invalid key format", async () => {
  const repo = new FakeComplianceRepository();
  await assert.rejects(
    () => createFramework(repo, { key: "ISO 42001!", name: "x", description: "x" }),
    (err: unknown) => err instanceof ComplianceFrameworkError && err.code === "invalid_key",
  );
});

test("createFramework rejects a duplicate key", async () => {
  const repo = new FakeComplianceRepository();
  await createFramework(repo, { key: "iso-42001", name: "ISO/IEC 42001:2023", description: "x" });
  await assert.rejects(
    () => createFramework(repo, { key: "iso-42001", name: "Again", description: "x" }),
    (err: unknown) => err instanceof ComplianceFrameworkError && err.code === "duplicate_key",
  );
});

test("addControlToFramework throws framework_not_found / control_not_found appropriately", async () => {
  const repo = new FakeComplianceRepository();
  const framework = await createFramework(repo, { key: "iso-42001", name: "ISO/IEC 42001:2023", description: "x" });
  const control = await createControl(repo, { key: "ai-transparency", code: "CTRL-AI-001", name: "AI Transparency", description: "x" });

  await assert.rejects(
    () => addControlToFramework(repo, "ghost-framework", control.key),
    (err: unknown) => err instanceof ComplianceFrameworkError && err.code === "framework_not_found",
  );
  await assert.rejects(
    () => addControlToFramework(repo, framework.key, "ghost-control"),
    (err: unknown) => err instanceof ComplianceFrameworkError && err.code === "control_not_found",
  );
});

test("the worked example: a framework requires multiple controls, listed and removable", async () => {
  const repo = new FakeComplianceRepository();
  const framework = await createFramework(repo, { key: "iso-42001", name: "ISO/IEC 42001:2023", description: "x" });
  const transparency = await createControl(repo, { key: "ai-transparency", code: "CTRL-AI-001", name: "AI Transparency", description: "x" });
  const riskMgmt = await createControl(repo, { key: "ai-risk-management", code: "CTRL-AI-002", name: "AI Risk Management", description: "x" });

  await addControlToFramework(repo, framework.key, transparency.key);
  await addControlToFramework(repo, framework.key, riskMgmt.key);

  const controls = await listControlsForFramework(repo, framework.key);
  assert.equal(controls.length, 2);
  assert.deepEqual(new Set(controls.map((c) => c.key)), new Set(["ai-transparency", "ai-risk-management"]));

  await removeControlFromFramework(repo, framework.key, transparency.key);
  const afterRemoval = await listControlsForFramework(repo, framework.key);
  assert.equal(afterRemoval.length, 1);
  assert.equal(afterRemoval[0]!.key, "ai-risk-management");
});

test("a control can satisfy more than one framework -- e.g. AI Transparency mapping onto both NIST AI RMF and the EU AI Act", async () => {
  const repo = new FakeComplianceRepository();
  const nist = await createFramework(repo, { key: "nist-ai-rmf", name: "NIST AI RMF", description: "x" });
  const euAiAct = await createFramework(repo, { key: "eu-ai-act", name: "EU AI Act", description: "x" });
  const transparency = await createControl(repo, { key: "ai-transparency", code: "CTRL-AI-001", name: "AI Transparency", description: "x" });

  await addControlToFramework(repo, nist.key, transparency.key);
  await addControlToFramework(repo, euAiAct.key, transparency.key);

  assert.equal((await listControlsForFramework(repo, nist.key)).length, 1);
  assert.equal((await listControlsForFramework(repo, euAiAct.key)).length, 1);
});

test("listFrameworks orders by name", async () => {
  const repo = new FakeComplianceRepository();
  await createFramework(repo, { key: "soc-2", name: "SOC 2", description: "x" });
  await createFramework(repo, { key: "hipaa", name: "HIPAA", description: "x" });

  const frameworks = await listFrameworks(repo);
  assert.deepEqual(frameworks.map((f) => f.key), ["hipaa", "soc-2"]);
});

// --- computeFrameworkCoverage ---

test("computeFrameworkCoverage reports zero for a framework with no required controls at all", async () => {
  const repo = new FakeComplianceRepository();
  const framework = await createFramework(repo, { key: "iso-42001", name: "ISO/IEC 42001:2023", description: "x" });

  const coverage = await computeFrameworkCoverage(repo, framework.key);

  assert.equal(coverage.requiredControlCount, 0);
  assert.equal(coverage.controlsWithMappedObligations, 0);
});

test("computeFrameworkCoverage counts only controls that have at least one real obligation mapped, not just required controls", async () => {
  const repo = new FakeComplianceRepository();
  const framework = await createFramework(repo, { key: "iso-42001", name: "ISO/IEC 42001:2023", description: "x" });
  const backed = await createControl(repo, { key: "ai-transparency", code: "CTRL-AI-001", name: "AI Transparency", description: "x" });
  const bareShell = await createControl(repo, { key: "ai-risk-management", code: "CTRL-AI-002", name: "AI Risk Management", description: "x" });
  await addControlToFramework(repo, framework.key, backed.key);
  await addControlToFramework(repo, framework.key, bareShell.key);

  // A real obligation, mapped to `backed` only -- `bareShell` stays a
  // required control with no actual regulatory analysis behind it.
  await repo.replaceObligationsForUpdate("update-1", [
    {
      id: "obligation-1",
      updateId: "update-1",
      description: "Disclose AI use",
      obligationType: "disclosure",
      industries: [],
      deadlineDescription: null,
      deadlineDate: null,
      confidence: null,
      status: "pending_review",
      mergedIntoObligationId: null,
      createdAt: new Date(),
    },
  ]);
  await mapObligationToControl(repo, "obligation-1", backed.key);

  const coverage = await computeFrameworkCoverage(repo, framework.key);

  assert.equal(coverage.requiredControlCount, 2, "both controls are still required by the framework");
  assert.equal(coverage.controlsWithMappedObligations, 1, "only the control with a real obligation mapped counts as backed");
});

test("computeFrameworkCoverage throws framework_not_found for an unknown key", async () => {
  const repo = new FakeComplianceRepository();

  await assert.rejects(
    () => computeFrameworkCoverage(repo, "ghost-framework"),
    (err: unknown) => err instanceof ComplianceFrameworkError && err.code === "framework_not_found",
  );
});
