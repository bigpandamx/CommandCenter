import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveServiceFromRoutePattern } from "../src/requestLatencyTracking.js";

test("deriveServiceFromRoutePattern extracts the service name from an admin route", () => {
  assert.equal(deriveServiceFromRoutePattern("/v1/admin/tickets/:ticketId"), "tickets");
});

test("deriveServiceFromRoutePattern extracts the service name from a service-to-service route", () => {
  assert.equal(deriveServiceFromRoutePattern("/v1/service/compliance/updates"), "compliance");
});

test("deriveServiceFromRoutePattern extracts the service name from a device-facing route", () => {
  assert.equal(deriveServiceFromRoutePattern("/v1/desktop/chat/messages"), "chat");
});

test("deriveServiceFromRoutePattern groups every ticket id under the same 'tickets' service, not one service per id", () => {
  const a = deriveServiceFromRoutePattern("/v1/admin/tickets/8f3a2c91-1111-1111-1111-111111111111");
  const b = deriveServiceFromRoutePattern("/v1/admin/tickets/8f3a2c91-2222-2222-2222-222222222222");
  assert.equal(a, "tickets");
  assert.equal(a, b);
});

test("deriveServiceFromRoutePattern falls back to 'unknown' for a path with fewer than 3 segments, rather than throwing", () => {
  assert.equal(deriveServiceFromRoutePattern("/health"), "unknown");
  assert.equal(deriveServiceFromRoutePattern("/"), "unknown");
  assert.equal(deriveServiceFromRoutePattern(""), "unknown");
});
