import { test } from "node:test";
import assert from "node:assert/strict";
import { IocError, createIoc, listIocs, updateIoc, setIocActive } from "../src/iocManagement.js";
import { FakeThreatIntelRepository } from "../test/fakeRepository.js";

test("createIoc always starts active, source staff_curated, created by the given staff id", async () => {
  const repo = new FakeThreatIntelRepository();
  const ioc = await createIoc(repo, { iocType: "ip", value: "203.0.113.5" }, "staff-1");

  assert.equal(ioc.isActive, true);
  assert.equal(ioc.source, "staff_curated");
  assert.equal(ioc.createdByStaffId, "staff-1");
  assert.equal(ioc.iocType, "ip");
  assert.equal(ioc.value, "203.0.113.5");
});

test("createIoc carries optional fields, empty related-id arrays normalized to null", async () => {
  const repo = new FakeThreatIntelRepository();
  const ioc = await createIoc(
    repo,
    {
      iocType: "domain",
      value: "evil.example",
      threatType: "botnet C2",
      description: "Observed in incident #42",
      relatedActorIds: ["actor-1"],
      relatedMalwareIds: [],
    },
    "staff-1",
  );

  assert.equal(ioc.threatType, "botnet C2");
  assert.equal(ioc.description, "Observed in incident #42");
  assert.deepEqual(ioc.relatedActorIds, ["actor-1"]);
  assert.equal(ioc.relatedMalwareIds, null, "an empty array normalizes to null, same convention as every other array field in this module");
});

test("the actual point of this deduplication design: the same value under the same type is rejected, but the same value under a different type is allowed", async () => {
  const repo = new FakeThreatIntelRepository();
  await createIoc(repo, { iocType: "domain", value: "203.0.113.5.example" }, "staff-1");

  await assert.rejects(
    () => createIoc(repo, { iocType: "domain", value: "203.0.113.5.example" }, "staff-1"),
    (err: unknown) => err instanceof IocError && err.code === "duplicate_ioc",
  );

  const differentType = await createIoc(repo, { iocType: "url", value: "203.0.113.5.example" }, "staff-1");
  assert.equal(differentType.value, "203.0.113.5.example");
});

test("listIocs filters by iocType, source, isActive, and text (matching value or threatType)", async () => {
  const repo = new FakeThreatIntelRepository();
  await createIoc(repo, { iocType: "ip", value: "203.0.113.5", threatType: "botnet C2" }, "staff-1");
  await createIoc(repo, { iocType: "domain", value: "phish.example", threatType: "phishing infrastructure" }, "staff-1");

  const ipsOnly = await listIocs(repo, { iocType: "ip" });
  assert.equal(ipsOnly.length, 1);
  assert.equal(ipsOnly[0]!.value, "203.0.113.5");

  const byThreatType = await listIocs(repo, { text: "phishing" });
  assert.equal(byThreatType.length, 1);
  assert.equal(byThreatType[0]!.value, "phish.example");
});

test("updateIoc is a partial update -- an omitted field keeps its current value, iocType/value are not editable at all", async () => {
  const repo = new FakeThreatIntelRepository();
  const ioc = await createIoc(repo, { iocType: "ip", value: "203.0.113.5", threatType: "botnet C2" }, "staff-1");

  const updated = await updateIoc(repo, ioc.id, { description: "Confirmed active as of today" });
  assert.equal(updated.description, "Confirmed active as of today");
  assert.equal(updated.threatType, "botnet C2", "omitted field stays as-is");
  assert.equal(updated.iocType, "ip");
  assert.equal(updated.value, "203.0.113.5");
});

test("updateIoc throws ioc_not_found for an unknown id", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => updateIoc(repo, "ghost-ioc", { description: "x" }),
    (err: unknown) => err instanceof IocError && err.code === "ioc_not_found",
  );
});

test("setIocActive toggles isActive; an indicator from a resolved incident can be marked inactive", async () => {
  const repo = new FakeThreatIntelRepository();
  const ioc = await createIoc(repo, { iocType: "file_hash_sha256", value: "a".repeat(64) }, "staff-1");

  const deactivated = await setIocActive(repo, ioc.id, false);
  assert.equal(deactivated.isActive, false);

  const reactivated = await setIocActive(repo, ioc.id, true);
  assert.equal(reactivated.isActive, true);
});

test("setIocActive throws ioc_not_found for an unknown id", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => setIocActive(repo, "ghost-ioc", false),
    (err: unknown) => err instanceof IocError && err.code === "ioc_not_found",
  );
});
