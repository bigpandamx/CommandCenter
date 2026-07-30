import { test } from "node:test";
import assert from "node:assert/strict";
import { roleHasPermission, assertPermission, ForbiddenError, ALL_PERMISSIONS } from "../src/rbac.js";

test("viewer can read orgs but not create or mutate them", () => {
  assert.equal(roleHasPermission("viewer", "org:read"), true);
  assert.equal(roleHasPermission("viewer", "org:create"), false);
  assert.equal(roleHasPermission("viewer", "org:set_entitlement"), false);
  assert.equal(roleHasPermission("viewer", "enrollment_token:issue"), false);
});

test("operator can issue/revoke tokens and create orgs but not change entitlement tier or manage staff", () => {
  assert.equal(roleHasPermission("operator", "enrollment_token:issue"), true);
  assert.equal(roleHasPermission("operator", "enrollment_token:revoke"), true);
  assert.equal(roleHasPermission("operator", "org:create"), true);
  assert.equal(roleHasPermission("operator", "org:set_entitlement"), false);
  assert.equal(roleHasPermission("operator", "staff:manage"), false);
});

test("admin has every permission", () => {
  const permissions = [
    "org:read",
    "org:create",
    "org:set_entitlement",
    "enrollment_token:issue",
    "enrollment_token:revoke",
    "staff:read",
    "staff:manage",
    "billing:read",
    "billing:manage",
    "compliance:read",
    "compliance:manage",
    "service_account:manage",
    "ticket:read",
    "ticket:create",
    "ticket:manage",
    "threat_intel:read",
    "threat_intel:manage",
    "threat_intel:report",
    "risk_intel:read",
    "risk_intel:manage",
    "agents:read",
    "agents:manage",
    "announcements:read",
    "announcements:manage",
    "ai_chat:read",
  ] as const;
  for (const p of permissions) {
    assert.equal(roleHasPermission("admin", p), true);
  }
});

test("viewer can read announcements but not create/publish/archive them", () => {
  assert.equal(roleHasPermission("viewer", "announcements:read"), true);
  assert.equal(roleHasPermission("viewer", "announcements:manage"), false);
  assert.equal(roleHasPermission("operator", "announcements:manage"), true);
  assert.equal(roleHasPermission("admin", "announcements:manage"), true);
});

test("viewer can read agent tasks/stats but not submit or process them", () => {
  assert.equal(roleHasPermission("viewer", "agents:read"), true);
  assert.equal(roleHasPermission("viewer", "agents:manage"), false);
  assert.equal(roleHasPermission("operator", "agents:manage"), true);
  assert.equal(roleHasPermission("admin", "agents:manage"), true);
});

test("viewer can read risk intelligence insights but not trigger generation or resolve them", () => {
  assert.equal(roleHasPermission("viewer", "risk_intel:read"), true);
  assert.equal(roleHasPermission("viewer", "risk_intel:manage"), false);
  assert.equal(roleHasPermission("operator", "risk_intel:manage"), true);
  assert.equal(roleHasPermission("admin", "risk_intel:manage"), true);
});

test("threat_intel:report is granted to operator/admin (needed for a service account's narrow reporting scope), same as manage", () => {
  assert.equal(roleHasPermission("viewer", "threat_intel:report"), false);
  assert.equal(roleHasPermission("operator", "threat_intel:report"), true);
  assert.equal(roleHasPermission("admin", "threat_intel:report"), true);
});

test("viewer can read threat intel but not manage it; operator and admin can do both", () => {
  assert.equal(roleHasPermission("viewer", "threat_intel:read"), true);
  assert.equal(roleHasPermission("viewer", "threat_intel:manage"), false);
  assert.equal(roleHasPermission("operator", "threat_intel:manage"), true);
  assert.equal(roleHasPermission("admin", "threat_intel:manage"), true);
});

test("staff:read is available to every role, but staff:manage stays admin-only", () => {
  assert.equal(roleHasPermission("viewer", "staff:read"), true);
  assert.equal(roleHasPermission("viewer", "staff:manage"), false);
  assert.equal(roleHasPermission("operator", "staff:read"), true);
  assert.equal(roleHasPermission("operator", "staff:manage"), false);
  assert.equal(roleHasPermission("admin", "staff:read"), true);
  assert.equal(roleHasPermission("admin", "staff:manage"), true);
});

test("viewer can read tickets but not create or manage them; operator and admin can do all three", () => {
  assert.equal(roleHasPermission("viewer", "ticket:read"), true);
  assert.equal(roleHasPermission("viewer", "ticket:create"), false);
  assert.equal(roleHasPermission("viewer", "ticket:manage"), false);
  assert.equal(roleHasPermission("operator", "ticket:create"), true);
  assert.equal(roleHasPermission("operator", "ticket:manage"), true);
  assert.equal(roleHasPermission("admin", "ticket:manage"), true);
});

test("viewer and operator can read billing but only admin can manage it", () => {
  assert.equal(roleHasPermission("viewer", "billing:read"), true);
  assert.equal(roleHasPermission("viewer", "billing:manage"), false);
  assert.equal(roleHasPermission("operator", "billing:read"), true);
  assert.equal(roleHasPermission("operator", "billing:manage"), false);
  assert.equal(roleHasPermission("admin", "billing:manage"), true);
});

test("assertPermission throws ForbiddenError with the permission attached", () => {
  assert.throws(
    () => assertPermission("viewer", "org:create"),
    (err: unknown) => err instanceof ForbiddenError && err.permission === "org:create",
  );
});

test("assertPermission does not throw when the role has the permission", () => {
  assert.doesNotThrow(() => assertPermission("admin", "staff:manage"));
});

test("ALL_PERMISSIONS matches exactly what admin's role actually grants -- regression guard for a real bug", () => {
  // serviceAccountAdmin.ts's scope-validation schema is built from
  // ALL_PERMISSIONS specifically so it can't independently drift out of
  // sync the way it once did (event:publish/event:read were valid
  // staff permissions but rejected as service-account scopes, caught
  // by a real E2E run, not a unit test -- because there wasn't one).
  // This is that unit test: if a permission is ever added to the
  // Permission type without also adding it here, admin won't actually
  // have it (roleHasPermission returns false), which is a much louder,
  // faster failure than a 400 several layers away in an HTTP request
  // body a real caller sent.
  for (const permission of ALL_PERMISSIONS) {
    assert.equal(roleHasPermission("admin", permission), true, `admin should have ${permission}`);
  }
});
