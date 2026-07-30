import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateDeviceKey,
  hashDeviceKey,
  verifyDeviceKey,
  isWellFormedDeviceKey,
} from "../src/deviceAuth.js";

test("generateDeviceKey produces a plaintext key that verifies against its own hash", () => {
  const { plaintext, hash } = generateDeviceKey("abcdef12-3456");
  assert.ok(plaintext.startsWith("dk_abcdef12_"));
  assert.ok(verifyDeviceKey(plaintext, hash));
});

test("verifyDeviceKey rejects a wrong key", () => {
  const { hash } = generateDeviceKey("device-a");
  const other = generateDeviceKey("device-b");
  assert.equal(verifyDeviceKey(other.plaintext, hash), false);
});

test("verifyDeviceKey rejects a malformed stored hash gracefully instead of throwing", () => {
  assert.equal(verifyDeviceKey("dk_x_y", "not-a-real-hash"), false);
});

test("hashDeviceKey produces different hashes for the same input (random salt)", () => {
  const h1 = hashDeviceKey("same-plaintext-key");
  const h2 = hashDeviceKey("same-plaintext-key");
  assert.notEqual(h1, h2);
  assert.ok(verifyDeviceKey("same-plaintext-key", h1));
  assert.ok(verifyDeviceKey("same-plaintext-key", h2));
});

test("isWellFormedDeviceKey matches generated keys and rejects garbage", () => {
  const { plaintext } = generateDeviceKey("device-1");
  assert.ok(isWellFormedDeviceKey(plaintext));
  assert.equal(isWellFormedDeviceKey("not-a-key"), false);
  assert.equal(isWellFormedDeviceKey(""), false);
});
