import { test } from "node:test";
import assert from "node:assert/strict";
import { hashSecret, verifySecret, randomToken, generatePrefixedToken, parsePrefixedToken } from "../src/secretHashing.js";

test("hashSecret produces a hash that verifies against the original plaintext", () => {
  const hash = hashSecret("correct horse battery staple");
  assert.ok(verifySecret("correct horse battery staple", hash));
});

test("verifySecret rejects a wrong plaintext", () => {
  const hash = hashSecret("correct horse battery staple");
  assert.equal(verifySecret("wrong", hash), false);
});

test("hashSecret uses a random salt so identical plaintexts hash differently", () => {
  const h1 = hashSecret("same-value");
  const h2 = hashSecret("same-value");
  assert.notEqual(h1, h2);
});

test("verifySecret rejects a malformed stored hash without throwing", () => {
  assert.equal(verifySecret("anything", "not-a-valid-hash-format"), false);
});

test("randomToken produces distinct base64url tokens of expected rough length", () => {
  const t1 = randomToken(32);
  const t2 = randomToken(32);
  assert.notEqual(t1, t2);
  assert.match(t1, /^[A-Za-z0-9_-]+$/);
});

test("generatePrefixedToken + parsePrefixedToken round-trip the embedded id", () => {
  const id = "a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789";
  const token = generatePrefixedToken("svc", id, 32);
  assert.ok(token.startsWith(`svc_${id}_`));
  assert.equal(parsePrefixedToken(token, "svc"), id);
});

test("parsePrefixedToken correctly extracts the id even when the random secret portion itself contains underscores", () => {
  // Regression test for the exact bug found in staff session parsing:
  // a naive split("_") breaks here because base64url secrets can contain
  // "_". Run generatePrefixedToken enough times to reliably hit a secret
  // containing "_" at least once (base64url alphabet includes it).
  const id = "a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789";
  let sawUnderscoreInSecret = false;
  for (let i = 0; i < 200; i++) {
    const token = generatePrefixedToken("svc", id, 32);
    const secret = token.slice(`svc_${id}_`.length);
    if (secret.includes("_")) {
      sawUnderscoreInSecret = true;
      assert.equal(parsePrefixedToken(token, "svc"), id, `failed to parse token with underscore in secret: ${token}`);
    }
  }
  assert.ok(sawUnderscoreInSecret, "test didn't actually exercise the underscore-in-secret case -- increase iterations");
});

test("parsePrefixedToken returns null for a malformed token", () => {
  assert.equal(parsePrefixedToken("not-a-real-token", "svc"), null);
  assert.equal(parsePrefixedToken("svc_not-a-uuid_secret", "svc"), null);
});

test("parsePrefixedToken returns null when the prefix doesn't match", () => {
  const id = "a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789";
  const token = generatePrefixedToken("svc", id, 32);
  assert.equal(parsePrefixedToken(token, "sess"), null);
});
