import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, isNewerVersion, resolveUpdate } from "../src/updateManifest.js";
import { FakeDesktopSyncRepository } from "./fakeRepository.js";

test("compareVersions orders major, then minor, then patch", () => {
  assert.ok(compareVersions("2.0.0", "1.9.9") > 0);
  assert.ok(compareVersions("1.10.0", "1.9.9") > 0);
  assert.ok(compareVersions("1.9.9", "1.9.10") < 0);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
});

test("compareVersions rejects malformed input", () => {
  assert.throws(() => compareVersions("2.0", "1.0.0"));
  assert.throws(() => compareVersions("v1.0.0", "1.0.0"));
});

test("isNewerVersion", () => {
  assert.equal(isNewerVersion("2.4.1", "2.4.0"), true);
  assert.equal(isNewerVersion("2.4.0", "2.4.0"), false);
  assert.equal(isNewerVersion("2.3.9", "2.4.0"), false);
});

test("resolveUpdate returns no update when no manifest exists for the channel/platform", async () => {
  const repo = new FakeDesktopSyncRepository();
  const result = await resolveUpdate(repo, {
    channel: "stable",
    platform: "windows",
    appVersion: "2.4.0",
  });
  assert.equal(result.updateAvailable, false);
  assert.equal(result.manifest, null);
});

test("resolveUpdate picks the newest matching manifest across multiple published versions", async () => {
  const repo = new FakeDesktopSyncRepository();
  repo.manifests.push(
    {
      version: "2.3.0",
      channel: "stable",
      platform: "windows",
      publishedAt: new Date("2026-01-01"),
      downloadUrl: "https://cdn.example.com/2.3.0",
      sha256: "aaa",
      minUpgradeFrom: null,
    },
    {
      version: "2.5.0",
      channel: "stable",
      platform: "windows",
      publishedAt: new Date("2026-03-01"),
      downloadUrl: "https://cdn.example.com/2.5.0",
      sha256: "ccc",
      minUpgradeFrom: null,
    },
    {
      version: "2.4.0",
      channel: "stable",
      platform: "windows",
      publishedAt: new Date("2026-02-01"),
      downloadUrl: "https://cdn.example.com/2.4.0",
      sha256: "bbb",
      minUpgradeFrom: null,
    },
    {
      // Different channel entirely -- must not be selected.
      version: "3.0.0",
      channel: "canary",
      platform: "windows",
      publishedAt: new Date("2026-04-01"),
      downloadUrl: "https://cdn.example.com/3.0.0",
      sha256: "ddd",
      minUpgradeFrom: null,
    },
  );

  const result = await resolveUpdate(repo, {
    channel: "stable",
    platform: "windows",
    appVersion: "2.0.0",
  });

  assert.equal(result.updateAvailable, true);
  assert.equal(result.manifest?.version, "2.5.0");
});

test("resolveUpdate reports no update when device is already on the latest version", async () => {
  const repo = new FakeDesktopSyncRepository();
  repo.manifests.push({
    version: "2.4.0",
    channel: "beta",
    platform: "macos",
    publishedAt: new Date("2026-01-01"),
    downloadUrl: "https://cdn.example.com/2.4.0",
    sha256: "aaa",
    minUpgradeFrom: null,
  });

  const result = await resolveUpdate(repo, {
    channel: "beta",
    platform: "macos",
    appVersion: "2.4.0",
  });

  assert.equal(result.updateAvailable, false);
});
