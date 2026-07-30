import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDisplayId, parseDisplayId, generateDisplayId, IdentityError } from "../src/idGenerator.js";
import { FakeIdentityRepository } from "./fakeIdentityRepository.js";

test("formatDisplayId zero-pads to 8 digits", () => {
  assert.equal(formatDisplayId("TKT", 1), "TKT-00000001");
  assert.equal(formatDisplayId("ORG", 1234), "ORG-00001234");
});

test("formatDisplayId does not truncate a sequence that's already wider than the padding", () => {
  assert.equal(formatDisplayId("DEV", 123456789), "DEV-123456789");
});

test("formatDisplayId rejects zero, negative, and non-integer sequences", () => {
  assert.throws(() => formatDisplayId("TKT", 0), RangeError);
  assert.throws(() => formatDisplayId("TKT", -1), RangeError);
  assert.throws(() => formatDisplayId("TKT", 1.5), RangeError);
});

test("formatDisplayId accepts any 2-4 uppercase-letter kind, not just the suggested COMMON_KINDS list -- kind is open, not a closed registry", () => {
  assert.equal(formatDisplayId("WH", 1), "WH-00000001");
  assert.equal(formatDisplayId("XYZ", 1), "XYZ-00000001");
  assert.equal(formatDisplayId("FLAG", 1), "FLAG-00000001");
});

test("formatDisplayId/generateDisplayId reject a malformed kind", async () => {
  assert.throws(
    () => formatDisplayId("tkt", 1),
    (err: unknown) => err instanceof IdentityError && err.code === "invalid_kind",
  );
  assert.throws(() => formatDisplayId("T", 1), IdentityError);
  assert.throws(() => formatDisplayId("TOOLONG", 1), IdentityError);
  assert.throws(() => formatDisplayId("TK1", 1), IdentityError);

  const repo = new FakeIdentityRepository();
  await assert.rejects(
    () => generateDisplayId(repo, "tkt"),
    (err: unknown) => err instanceof IdentityError && err.code === "invalid_kind",
  );
});

test("parseDisplayId round-trips a well-formed id", () => {
  assert.deepEqual(parseDisplayId("TKT-00129283"), { kind: "TKT", sequence: 129283 });
});

test("parseDisplayId returns null for a malformed id rather than throwing", () => {
  assert.equal(parseDisplayId("not-an-id"), null);
  assert.equal(parseDisplayId("TKT129283"), null);
  assert.equal(parseDisplayId("tkt-00129283"), null, "lowercase kind should not match");
  assert.equal(parseDisplayId("TKT-abc"), null);
  assert.equal(parseDisplayId(""), null);
});

test("parseDisplayId accepts a well-formed id with a kind outside COMMON_KINDS -- it validates shape, not membership in a closed registry", () => {
  assert.deepEqual(parseDisplayId("XYZ-00000001"), { kind: "XYZ", sequence: 1 });
});

test("generateDisplayId claims sequential numbers per kind, starting at 1", async () => {
  const repo = new FakeIdentityRepository();
  assert.equal(await generateDisplayId(repo, "TKT"), "TKT-00000001");
  assert.equal(await generateDisplayId(repo, "TKT"), "TKT-00000002");
  assert.equal(await generateDisplayId(repo, "TKT"), "TKT-00000003");
});

test("generateDisplayId keeps separate counters per kind -- ORG and TKT don't share a sequence", async () => {
  const repo = new FakeIdentityRepository();
  assert.equal(await generateDisplayId(repo, "ORG"), "ORG-00000001");
  assert.equal(await generateDisplayId(repo, "TKT"), "TKT-00000001");
  assert.equal(await generateDisplayId(repo, "ORG"), "ORG-00000002");
});

test("generateDisplayId works for a kind never seen before, with no pre-registration -- the whole point of an open kind space", async () => {
  const repo = new FakeIdentityRepository();
  assert.equal(await generateDisplayId(repo, "FLAG"), "FLAG-00000001");
});

test("every generated id round-trips through parseDisplayId", async () => {
  const repo = new FakeIdentityRepository();
  const id = await generateDisplayId(repo, "AGT");
  assert.deepEqual(parseDisplayId(id), { kind: "AGT", sequence: 1 });
});
