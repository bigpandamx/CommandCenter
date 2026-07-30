import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultTeamForCategory } from "../src/routing.js";

test("bug, technical_support, and feature_request route to engineering", () => {
  assert.equal(defaultTeamForCategory("bug"), "engineering");
  assert.equal(defaultTeamForCategory("technical_support"), "engineering");
  assert.equal(defaultTeamForCategory("feature_request"), "engineering");
});

test("billing, compliance, account, and other route to support", () => {
  assert.equal(defaultTeamForCategory("billing"), "support");
  assert.equal(defaultTeamForCategory("compliance"), "support");
  assert.equal(defaultTeamForCategory("account"), "support");
  assert.equal(defaultTeamForCategory("other"), "support");
});
