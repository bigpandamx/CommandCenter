import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ComplianceControlError,
  createControl,
  listControls,
  mapObligationToControl,
  unmapObligationFromControl,
  listControlsForObligation,
  listObligationsForControl,
} from "../src/controlService.js";
import { FakeComplianceRepository } from "../test/fakeRepository.js";
import { registerComplianceSource } from "../src/sourceManagement.js";
import { ingestComplianceItems } from "../src/ingestion.js";
import { analyzeComplianceUpdate } from "../src/analysisService.js";
import { FakeAIProvider } from "../../../Customer-Connections/AIChat/test/fakeAIProvider.js";

async function seedObligation(repo: FakeComplianceRepository, description: string) {
  const aiProvider = new FakeAIProvider();
  const source = await registerComplianceSource(repo, {
    name: `Source for ${description}`,
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: `https://example.gov/${randomUUID()}.xml`,
  });
  await ingestComplianceItems(repo, source, [
    { externalId: "a", title: "Doc", summary: "s", url: `https://example.gov/${randomUUID()}`, publishedAt: null, country: "US", state: null },
  ]);
  const update = (await repo.getUpdateBySourceAndExternalId(source.id, "a"))!;
  aiProvider.nextResponse = {
    content: JSON.stringify({
      isAiRelated: true,
      enforceability: "enforceable",
      country: "US",
      state: null,
      industries: [],
      topics: [],
      summary: "s",
      riskLevel: "medium",
      actionItems: [],
      keywords: [],
      obligations: [{ description, obligationType: "disclosure", industries: [], deadlineDescription: null }],
    }),
    tokensUsed: 100,
    model: "claude-sonnet-5",
  };
  await analyzeComplianceUpdate(repo, aiProvider, update.id);
  return (await repo.listObligationsForUpdate(update.id))[0]!;
}

test("createControl rejects an invalid key format", async () => {
  const repo = new FakeComplianceRepository();
  await assert.rejects(
    () => createControl(repo, { key: "AI Transparency!", code: "CTRL-001", name: "x", description: "x" }),
    (err: unknown) => err instanceof ComplianceControlError && err.code === "invalid_key",
  );
});

test("createControl rejects a duplicate key", async () => {
  const repo = new FakeComplianceRepository();
  await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  await assert.rejects(
    () => createControl(repo, { key: "ai-transparency", code: "CTRL-002", name: "Again", description: "x" }),
    (err: unknown) => err instanceof ComplianceControlError && err.code === "duplicate_key",
  );
});

test("mapObligationToControl throws control_not_found / obligation_not_found appropriately", async () => {
  const repo = new FakeComplianceRepository();
  const control = await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const obligation = await seedObligation(repo, "Must disclose AI use");

  await assert.rejects(
    () => mapObligationToControl(repo, obligation.id, "ghost-control"),
    (err: unknown) => err instanceof ComplianceControlError && err.code === "control_not_found",
  );
  await assert.rejects(
    () => mapObligationToControl(repo, "ghost-obligation", control.key),
    (err: unknown) => err instanceof ComplianceControlError && err.code === "obligation_not_found",
  );
});

test("the worked example: multiple obligations from different sources all map to the same canonical control", async () => {
  const repo = new FakeComplianceRepository();
  const control = await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });

  const euObligation = await seedObligation(repo, "Disclose AI interaction (EU AI Act)");
  const ftcObligation = await seedObligation(repo, "Disclose AI interaction (FTC Guidance)");
  const coObligation = await seedObligation(repo, "Disclose AI interaction (Colorado AI Act)");

  await mapObligationToControl(repo, euObligation.id, control.key);
  await mapObligationToControl(repo, ftcObligation.id, control.key);
  await mapObligationToControl(repo, coObligation.id, control.key);

  const obligations = await listObligationsForControl(repo, control.key);
  assert.equal(obligations.length, 3);
  assert.deepEqual(
    new Set(obligations.map((o) => o.description)),
    new Set(["Disclose AI interaction (EU AI Act)", "Disclose AI interaction (FTC Guidance)", "Disclose AI interaction (Colorado AI Act)"]),
  );
});

test("an obligation can map to more than one control -- the mapping is many-to-many", async () => {
  const repo = new FakeComplianceRepository();
  const transparency = await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const auditLogging = await createControl(repo, { key: "ai-audit-logging", code: "CTRL-002", name: "AI Audit Logging", description: "x" });
  const obligation = await seedObligation(repo, "Document and retain AI decision logic for audit");

  await mapObligationToControl(repo, obligation.id, transparency.key);
  await mapObligationToControl(repo, obligation.id, auditLogging.key);

  const controls = await listControlsForObligation(repo, obligation.id);
  assert.equal(controls.length, 2);
  assert.deepEqual(new Set(controls.map((c) => c.key)), new Set(["ai-transparency", "ai-audit-logging"]));
});

test("unmapObligationFromControl removes the mapping", async () => {
  const repo = new FakeComplianceRepository();
  const control = await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const obligation = await seedObligation(repo, "Must disclose AI use");

  await mapObligationToControl(repo, obligation.id, control.key);
  assert.equal((await listControlsForObligation(repo, obligation.id)).length, 1);

  await unmapObligationFromControl(repo, obligation.id, control.key);
  assert.equal((await listControlsForObligation(repo, obligation.id)).length, 0);
});

test("listControls orders by code", async () => {
  const repo = new FakeComplianceRepository();
  await createControl(repo, { key: "ai-audit-logging", code: "CTRL-002", name: "AI Audit Logging", description: "x" });
  await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });

  const controls = await listControls(repo);
  assert.deepEqual(controls.map((c) => c.code), ["CTRL-001", "CTRL-002"]);
});
