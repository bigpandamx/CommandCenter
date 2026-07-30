import assert from "node:assert/strict";
import { test } from "node:test";
import { EDGE_DEVICE_STATUS_VALUES } from "../../../Customer-Connections/Edge-Devices/src/types.js";
import {
  aegisToCommandCenterSubscriptionStatus,
  commandCenterToAegisSubscriptionStatus,
  EXPECTED_AEGIS_AGENT_STATUS_VALUES,
  type AegisSubscriptionStatus,
} from "../src/vocabulary.js";
import type { SubscriptionStatus as CommandCenterSubscriptionStatus } from "../src/billingTypes.js";

test("aegisToCommandCenterSubscriptionStatus translates the one genuine mismatch (trial -> trialing)", () => {
  assert.equal(aegisToCommandCenterSubscriptionStatus("trial"), "trialing");
});

test("commandCenterToAegisSubscriptionStatus translates it back the other way", () => {
  assert.equal(commandCenterToAegisSubscriptionStatus("trialing"), "trial");
});

test("every other status value is identical string-for-string in both directions", () => {
  const identical: Array<[AegisSubscriptionStatus, CommandCenterSubscriptionStatus]> = [
    ["active", "active"],
    ["past_due", "past_due"],
    ["suspended", "suspended"],
    ["cancelled", "cancelled"],
    ["expired", "expired"],
  ];
  for (const [aegis, commandCenter] of identical) {
    assert.equal(aegisToCommandCenterSubscriptionStatus(aegis), commandCenter);
    assert.equal(commandCenterToAegisSubscriptionStatus(commandCenter), aegis);
  }
});

test("the mapping round-trips cleanly in both directions for every value", () => {
  const allAegisStatuses: AegisSubscriptionStatus[] = ["trial", "active", "past_due", "suspended", "cancelled", "expired"];
  for (const status of allAegisStatuses) {
    const roundTripped = commandCenterToAegisSubscriptionStatus(aegisToCommandCenterSubscriptionStatus(status));
    assert.equal(roundTripped, status);
  }
});

test("DRIFT GUARD: Command Center's EdgeDeviceStatus values still match Aegis's AgentStatus values", () => {
  // These two enums were deliberately designed to be identical so an
  // enforcement agent's status can be forwarded as-is with no mapping
  // function (see vocabulary.ts's own doc comment on
  // EXPECTED_AEGIS_AGENT_STATUS_VALUES). If this test fails, either
  // Command Center's EdgeDeviceStatus or Aegis's AgentStatus changed
  // without the other -- go fix VOCABULARY.md and both sides together,
  // don't just update this constant to make the test pass.
  const actual = [...EDGE_DEVICE_STATUS_VALUES].sort();
  const expected = [...EXPECTED_AEGIS_AGENT_STATUS_VALUES].sort();
  assert.deepEqual(actual, expected);
});
