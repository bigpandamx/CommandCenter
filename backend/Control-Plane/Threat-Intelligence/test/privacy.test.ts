import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateOrgHash,
  applyDifferentialPrivacy,
  applyCountNoise,
  EPSILON_BY_ANONYMIZATION_LEVEL,
} from "../src/privacy.js";

test("generateOrgHash is deterministic for the same org id and salt", () => {
  const h1 = generateOrgHash("org-1", "salt-a");
  const h2 = generateOrgHash("org-1", "salt-a");
  assert.equal(h1, h2);
});

test("generateOrgHash produces a 64-character hex string (SHA-256)", () => {
  const hash = generateOrgHash("org-1", "salt-a");
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("generateOrgHash differs for different org ids with the same salt", () => {
  assert.notEqual(generateOrgHash("org-1", "salt-a"), generateOrgHash("org-2", "salt-a"));
});

test("generateOrgHash differs for the same org id under different salts (unlinkable across salt rotation)", () => {
  assert.notEqual(generateOrgHash("org-1", "salt-a"), generateOrgHash("org-1", "salt-b"));
});

test("applyDifferentialPrivacy never returns negative, even under many trials with large potential negative noise", () => {
  for (let i = 0; i < 2000; i++) {
    const result = applyDifferentialPrivacy(0, 0.5, 1.0); // low epsilon = high noise magnitude, starting from 0
    assert.ok(result >= 0, `got negative value: ${result}`);
  }
});

test("applyDifferentialPrivacy is centered on the true value across many samples (statistical, generous tolerance)", () => {
  const trueValue = 100;
  const samples = 5000;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    sum += applyDifferentialPrivacy(trueValue, 1.0, 1.0);
  }
  const mean = sum / samples;
  // Laplace noise is zero-mean before clamping; clamping at 0 only ever
  // pulls the mean upward (never down), so mean should be >= trueValue
  // minus a small margin, and not wildly above it either.
  assert.ok(mean > trueValue - 5 && mean < trueValue + 5, `mean ${mean} not close to ${trueValue}`);
});

test("applyDifferentialPrivacy produces more noise (higher variance) at lower epsilon than higher epsilon", () => {
  const trueValue = 100;
  const samples = 3000;

  function meanAbsoluteDeviation(epsilon: number): number {
    let totalDeviation = 0;
    for (let i = 0; i < samples; i++) {
      totalDeviation += Math.abs(applyDifferentialPrivacy(trueValue, epsilon, 1.0) - trueValue);
    }
    return totalDeviation / samples;
  }

  const highPrivacyDeviation = meanAbsoluteDeviation(EPSILON_BY_ANONYMIZATION_LEVEL.high); // epsilon 0.5 -- more noise
  const lowPrivacyDeviation = meanAbsoluteDeviation(EPSILON_BY_ANONYMIZATION_LEVEL.low); // epsilon 2.0 -- less noise

  assert.ok(
    highPrivacyDeviation > lowPrivacyDeviation,
    `expected 'high' anonymization (epsilon=0.5) to have more noise than 'low' (epsilon=2.0), got ${highPrivacyDeviation} vs ${lowPrivacyDeviation}`,
  );
});

test("applyCountNoise always returns a non-negative integer", () => {
  for (let i = 0; i < 500; i++) {
    const result = applyCountNoise(10, 1.0);
    assert.ok(Number.isInteger(result));
    assert.ok(result >= 0);
  }
});

test("EPSILON_BY_ANONYMIZATION_LEVEL matches Aegis's exact epsilon_map values", () => {
  assert.equal(EPSILON_BY_ANONYMIZATION_LEVEL.high, 0.5);
  assert.equal(EPSILON_BY_ANONYMIZATION_LEVEL.medium, 1.0);
  assert.equal(EPSILON_BY_ANONYMIZATION_LEVEL.low, 2.0);
});
