import { test } from "node:test";
import assert from "node:assert/strict";
import { captureStartupInfo, computeDeploymentStatus } from "../src/deploymentStatus.js";

test("captureStartupInfo reports 'unknown' version when GIT_COMMIT_SHA isn't set, rather than fabricating one", () => {
  const original = process.env.GIT_COMMIT_SHA;
  delete process.env.GIT_COMMIT_SHA;

  const info = captureStartupInfo();

  assert.equal(info.version, "unknown");
  if (original !== undefined) process.env.GIT_COMMIT_SHA = original;
});

test("captureStartupInfo reports the real GIT_COMMIT_SHA when it's set", () => {
  const original = process.env.GIT_COMMIT_SHA;
  process.env.GIT_COMMIT_SHA = "abc1234";

  const info = captureStartupInfo();

  assert.equal(info.version, "abc1234");
  if (original === undefined) delete process.env.GIT_COMMIT_SHA;
  else process.env.GIT_COMMIT_SHA = original;
});

test("captureStartupInfo defaults environment to 'development' when NODE_ENV isn't set", () => {
  const original = process.env.NODE_ENV;
  delete process.env.NODE_ENV;

  const info = captureStartupInfo();

  assert.equal(info.environment, "development");
  if (original !== undefined) process.env.NODE_ENV = original;
});

test("captureStartupInfo reports the real running Node version", () => {
  const info = captureStartupInfo();

  assert.equal(info.nodeVersion, process.version);
});

test("computeDeploymentStatus computes real uptime from the captured startedAt", () => {
  const startupInfo = {
    version: "abc1234",
    environment: "production",
    nodeVersion: "v22.11.0",
    startedAt: new Date("2026-01-01T00:00:00Z"),
  };

  const status = computeDeploymentStatus(startupInfo, new Date("2026-01-01T01:00:00Z"));

  assert.equal(status.uptimeSeconds, 3600);
  assert.equal(status.version, "abc1234");
  assert.equal(status.environment, "production");
});

test("computeDeploymentStatus never reports negative uptime, even given a clock anomaly", () => {
  const startupInfo = {
    version: "abc1234",
    environment: "production",
    nodeVersion: "v22.11.0",
    startedAt: new Date("2026-01-01T01:00:00Z"),
  };

  const status = computeDeploymentStatus(startupInfo, new Date("2026-01-01T00:00:00Z")); // "now" before startedAt

  assert.equal(status.uptimeSeconds, 0);
});

test("computeDeploymentStatus reports zero uptime immediately at startup", () => {
  const now = new Date();
  const startupInfo = { version: "abc1234", environment: "production", nodeVersion: "v22.11.0", startedAt: now };

  const status = computeDeploymentStatus(startupInfo, now);

  assert.equal(status.uptimeSeconds, 0);
});
