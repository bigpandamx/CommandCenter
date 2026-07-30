import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ControlMatchingError, parseControlMatchResponse, matchObligationToControlLibrary } from "../src/controlMatching.js";
import { createControl, listControlsForObligation } from "../src/controlService.js";
import { FakeComplianceRepository } from "../test/fakeRepository.js";
import { registerComplianceSource } from "../src/sourceManagement.js";
import { ingestComplianceItems } from "../src/ingestion.js";
import { analyzeComplianceUpdate } from "../src/analysisService.js";
import { FakeAIProvider } from "../../../Customer-Connections/AIChat/test/fakeAIProvider.js";

async function seedObligation(repo: FakeComplianceRepository, description: string) {
  const ingestAiProvider = new FakeAIProvider();
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
  ingestAiProvider.nextResponse = {
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
  await analyzeComplianceUpdate(repo, ingestAiProvider, update.id);
  return (await repo.listObligationsForUpdate(update.id))[0]!;
}

function matchResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    matchedControlKeys: ["ai-transparency"],
    suggestedNewControl: null,
    reasoning: "This obligation is a disclosure requirement matching the existing AI Transparency control.",
    ...overrides,
  });
}

test("parseControlMatchResponse rejects malformed JSON", () => {
  assert.throws(
    () => parseControlMatchResponse("not json"),
    (err: unknown) => err instanceof ControlMatchingError && err.code === "invalid_ai_response",
  );
});

test("parseControlMatchResponse rejects a non-array matchedControlKeys", () => {
  assert.throws(
    () => parseControlMatchResponse(matchResponse({ matchedControlKeys: "ai-transparency" })),
    (err: unknown) => err instanceof ControlMatchingError && err.code === "invalid_ai_response",
  );
});

test("parseControlMatchResponse accepts a null suggestedNewControl and a populated one", () => {
  const withNull = parseControlMatchResponse(matchResponse());
  assert.equal(withNull.suggestedNewControl, null);

  const withNew = parseControlMatchResponse(
    matchResponse({ matchedControlKeys: [], suggestedNewControl: { code: "CTRL-003", name: "New Control", description: "x" } }),
  );
  assert.deepEqual(withNew.suggestedNewControl, { code: "CTRL-003", name: "New Control", description: "x" });
});

test("matchObligationToControlLibrary throws obligation_not_found for an unknown obligation", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  await assert.rejects(
    () => matchObligationToControlLibrary(repo, aiProvider, "ghost-obligation"),
    (err: unknown) => err instanceof ControlMatchingError && err.code === "obligation_not_found",
  );
});

test("the worked example: a matched obligation is auto-mapped with source 'ai'", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const obligation = await seedObligation(repo, "Disclose AI interaction (Colorado AI Act)");

  aiProvider.nextResponse = { content: matchResponse(), tokensUsed: 300, model: "claude-sonnet-5" };
  const result = await matchObligationToControlLibrary(repo, aiProvider, obligation.id);

  assert.equal(result.matchedControls.length, 1);
  assert.equal(result.matchedControls[0]!.key, "ai-transparency");
  assert.equal(result.suggestedNewControl, null);

  const applied = await listControlsForObligation(repo, obligation.id);
  assert.equal(applied.length, 1);
  assert.equal(applied[0]!.key, "ai-transparency");

  const promptSent = aiProvider.calls[0]![1]!.content;
  assert.ok(promptSent.includes("CTRL-001"));
  assert.ok(promptSent.includes("AI Transparency"));
});

test("a suggested new control is returned but NOT auto-created", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const obligation = await seedObligation(repo, "Conduct quarterly bias audits of AI models");

  aiProvider.nextResponse = {
    content: matchResponse({
      matchedControlKeys: [],
      suggestedNewControl: { code: "CTRL-003", name: "AI Bias Auditing", description: "Requires periodic bias audits of AI models" },
    }),
    tokensUsed: 300,
    model: "claude-sonnet-5",
  };

  const result = await matchObligationToControlLibrary(repo, aiProvider, obligation.id);

  assert.equal(result.matchedControls.length, 0);
  assert.deepEqual(result.suggestedNewControl, { code: "CTRL-003", name: "AI Bias Auditing", description: "Requires periodic bias audits of AI models" });

  assert.equal((await repo.listControls()).length, 0);
});

test("a hallucinated control key (not in the real library) is silently skipped, not thrown", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const obligation = await seedObligation(repo, "Disclose AI interaction");

  aiProvider.nextResponse = {
    content: matchResponse({ matchedControlKeys: ["ai-transparency", "a-key-that-does-not-exist"] }),
    tokensUsed: 300,
    model: "claude-sonnet-5",
  };

  const result = await matchObligationToControlLibrary(repo, aiProvider, obligation.id);
  assert.equal(result.matchedControls.length, 1);
  assert.equal(result.matchedControls[0]!.key, "ai-transparency");
});

test("an empty control library is presented to the model without crashing", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const obligation = await seedObligation(repo, "Disclose AI interaction");

  aiProvider.nextResponse = {
    content: matchResponse({ matchedControlKeys: [], suggestedNewControl: { code: "CTRL-001", name: "AI Transparency", description: "x" } }),
    tokensUsed: 300,
    model: "claude-sonnet-5",
  };

  const result = await matchObligationToControlLibrary(repo, aiProvider, obligation.id);
  assert.equal(result.matchedControls.length, 0);
  assert.ok(result.suggestedNewControl);

  const promptSent = aiProvider.calls[0]![1]!.content;
  assert.ok(promptSent.includes("empty"));
});
