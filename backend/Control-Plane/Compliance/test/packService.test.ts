import { test } from "node:test";
import assert from "node:assert/strict";
import { CompliancePackError, createPack, listPacks, addControlToPack, removeControlFromPack, listControlsForPack } from "../src/packService.js";
import { createControl } from "../src/controlService.js";
import { FakeComplianceRepository } from "../test/fakeRepository.js";

test("createPack rejects an invalid key format", async () => {
  const repo = new FakeComplianceRepository();
  await assert.rejects(
    () => createPack(repo, { key: "AI Chat Pack!", name: "x", description: "x" }),
    (err: unknown) => err instanceof CompliancePackError && err.code === "invalid_key",
  );
});

test("createPack rejects a duplicate key", async () => {
  const repo = new FakeComplianceRepository();
  await createPack(repo, { key: "ai-chat-pack", name: "AI Chat Pack", description: "x" });
  await assert.rejects(
    () => createPack(repo, { key: "ai-chat-pack", name: "Again", description: "x" }),
    (err: unknown) => err instanceof CompliancePackError && err.code === "duplicate_key",
  );
});

test("createPack defaults requiredProductKeys to empty when omitted", async () => {
  const repo = new FakeComplianceRepository();
  const pack = await createPack(repo, { key: "unscoped-pack", name: "Unscoped", description: "x" });
  assert.deepEqual(pack.requiredProductKeys, []);
});

test("createPack stores the given requiredProductKeys", async () => {
  const repo = new FakeComplianceRepository();
  const pack = await createPack(repo, { key: "ai-chat-pack", name: "AI Chat Pack", description: "x", requiredProductKeys: ["ai-chat", "voice-ai"] });
  assert.deepEqual(pack.requiredProductKeys, ["ai-chat", "voice-ai"]);
});

test("addControlToPack throws pack_not_found / control_not_found appropriately", async () => {
  const repo = new FakeComplianceRepository();
  const pack = await createPack(repo, { key: "ai-chat-pack", name: "AI Chat Pack", description: "x" });
  const control = await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });

  await assert.rejects(
    () => addControlToPack(repo, "ghost-pack", control.key),
    (err: unknown) => err instanceof CompliancePackError && err.code === "pack_not_found",
  );
  await assert.rejects(
    () => addControlToPack(repo, pack.key, "ghost-control"),
    (err: unknown) => err instanceof CompliancePackError && err.code === "control_not_found",
  );
});

test("the worked example: a pack bundles multiple controls, listed and removable", async () => {
  const repo = new FakeComplianceRepository();
  const pack = await createPack(repo, { key: "ai-chat-pack", name: "AI Chat Compliance Pack", description: "x", requiredProductKeys: ["ai-chat"] });
  const transparency = await createControl(repo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const auditLogging = await createControl(repo, { key: "ai-audit-logging", code: "CTRL-002", name: "AI Audit Logging", description: "x" });

  await addControlToPack(repo, pack.key, transparency.key);
  await addControlToPack(repo, pack.key, auditLogging.key);

  const controls = await listControlsForPack(repo, pack.key);
  assert.equal(controls.length, 2);
  assert.deepEqual(new Set(controls.map((c) => c.key)), new Set(["ai-transparency", "ai-audit-logging"]));

  await removeControlFromPack(repo, pack.key, transparency.key);
  const afterRemoval = await listControlsForPack(repo, pack.key);
  assert.equal(afterRemoval.length, 1);
  assert.equal(afterRemoval[0]!.key, "ai-audit-logging");
});

test("a control can belong to more than one pack", async () => {
  const repo = new FakeComplianceRepository();
  const chatPack = await createPack(repo, { key: "ai-chat-pack", name: "AI Chat Pack", description: "x", requiredProductKeys: ["ai-chat"] });
  const voicePack = await createPack(repo, { key: "voice-ai-pack", name: "Voice AI Pack", description: "x", requiredProductKeys: ["voice-ai"] });
  const auditLogging = await createControl(repo, { key: "ai-audit-logging", code: "CTRL-002", name: "AI Audit Logging", description: "x" });

  await addControlToPack(repo, chatPack.key, auditLogging.key);
  await addControlToPack(repo, voicePack.key, auditLogging.key);

  assert.equal((await listControlsForPack(repo, chatPack.key)).length, 1);
  assert.equal((await listControlsForPack(repo, voicePack.key)).length, 1);
});

test("listPacks orders by name", async () => {
  const repo = new FakeComplianceRepository();
  await createPack(repo, { key: "voice-pack", name: "Voice AI Pack", description: "x" });
  await createPack(repo, { key: "chat-pack", name: "AI Chat Pack", description: "x" });

  const packs = await listPacks(repo);
  assert.deepEqual(packs.map((p) => p.key), ["chat-pack", "voice-pack"]);
});
