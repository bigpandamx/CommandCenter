/**
 * Core E2E flows. Real HTTP, real server, real Postgres -- see
 * serverHarness.ts's doc comment for why this can't run in this
 * sandbox and what it proves that the fake-based test suites elsewhere
 * in this repo don't.
 *
 * Sequenced deliberately (bootstrap -> login -> create service account
 * -> use both credential types) rather than independent tests, since
 * each step's output is the next step's input, same as a real
 * operator's actual first-run experience would be. node:test runs
 * tests within a file in definition order by default, which this
 * relies on.
 *
 * Run with (after `npx tsx backend/scripts/run-migrations.ts` against a
 * real, empty Postgres):
 *   DATABASE_URL=postgres://... npx tsx --test backend/test/test-e2e/*.e2e.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startE2EServer, stopE2EServer, type E2EServer } from "./serverHarness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(__dirname, "..", "..");

const BOOTSTRAP_EMAIL = "e2e-admin@example.com";
const BOOTSTRAP_PASSWORD = "e2e-test-password-not-real-Aa1";

let server: E2EServer;
let adminSessionToken: string;
let serviceAccountKey: string;

/** response.json() is deliberately typed `unknown` by the offline fetch shim (see types/node-shims.d.ts) -- this is the one place that gets cast, rather than scattering `as any` across every call site below. */
async function json(response: Response): Promise<any> {
  return response.json();
}

before(async () => {
  // Real deployment tooling, not a shortcut -- see bootstrap-staff.ts's
  // own doc comment for why this is a CLI script and not an API route.
  //
  // timeout is deliberately explicit and generous-but-bounded (60s) --
  // execFileSync has NO default timeout (waits forever), and
  // bootstrap-staff.ts's own `new Pool(...)` also has no
  // connectionTimeoutMillis set, so without this, a stalled DB
  // connection anywhere in that chain would hang this step (and the
  // whole CI job) indefinitely rather than failing loudly. 60s is far
  // more than bootstrap should ever need against a healthy local
  // Postgres service container.
  execFileSync("npx", ["tsx", "scripts/bootstrap-staff.ts", BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD], {
    cwd: BACKEND_ROOT,
    env: process.env,
    stdio: "inherit",
    timeout: 60_000,
  });

  server = await startE2EServer();
}, { timeout: 90_000 }); // generous ceiling above bootstrap's own 60s timeout + server startup time -- a final backstop, not the primary fix (see the two timeouts above for the actual gaps)

after(async () => {
  if (server) await stopE2EServer(server);
});

test("GET /healthz returns ok", async () => {
  const response = await fetch(`${server.baseUrl}/healthz`);
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.equal(body.status, "ok");
});

test("an unauthenticated request to a staff admin route is rejected (401), through the real router", async () => {
  const response = await fetch(`${server.baseUrl}/v1/admin/feature-flags`);
  assert.equal(response.status, 401);
});

test("POST /v1/staff/login with the bootstrapped admin succeeds and returns a session token", async () => {
  const response = await fetch(`${server.baseUrl}/v1/staff/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: BOOTSTRAP_EMAIL, password: BOOTSTRAP_PASSWORD }),
  });
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.ok(body.sessionToken);
  adminSessionToken = body.sessionToken;
});

test("POST /v1/staff/login with the wrong password is rejected (401), not a crash", async () => {
  const response = await fetch(`${server.baseUrl}/v1/staff/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: BOOTSTRAP_EMAIL, password: "definitely-wrong" }),
  });
  assert.equal(response.status, 401);
});

test("an authenticated admin session can create a service account with scopes", async () => {
  const response = await fetch(`${server.baseUrl}/v1/admin/service-accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminSessionToken}` },
    body: JSON.stringify({ name: "e2e-test-service", scopes: ["event:publish", "event:read"] }),
  });
  assert.equal(response.status, 201);
  const body = await json(response);
  assert.ok(body.apiKey);
  serviceAccountKey = body.apiKey;
});

test("full feature flag lifecycle over real HTTP: create, evaluate (off), enable, evaluate (on)", async () => {
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${adminSessionToken}` };

  const createResponse = await fetch(`${server.baseUrl}/v1/admin/feature-flags`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ key: "e2e-test-flag", description: "created by the E2E suite" }),
  });
  assert.equal(createResponse.status, 201);

  const beforeEval = await fetch(`${server.baseUrl}/v1/admin/feature-flags/e2e-test-flag/evaluate`, {
    headers: authHeaders,
  });
  const beforeBody = await json(beforeEval);
  assert.equal(beforeBody.enabled, false); // new flags start disabled

  const enableResponse = await fetch(`${server.baseUrl}/v1/admin/feature-flags/e2e-test-flag/enabled`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enableResponse.status, 200);

  const afterEval = await fetch(`${server.baseUrl}/v1/admin/feature-flags/e2e-test-flag/evaluate`, {
    headers: authHeaders,
  });
  const afterBody = await json(afterEval);
  assert.equal(afterBody.enabled, true);
});

test("a service account with the right scope can publish an event over real HTTP", async () => {
  const response = await fetch(`${server.baseUrl}/v1/service/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceAccountKey}` },
    body: JSON.stringify({
      eventId: "should-not-matter",
      type: "e2e.test_event",
      source: "e2e-suite",
      occurredAt: new Date().toISOString(),
    }),
  });
  assert.equal(response.status, 201);
});

test("a service account WITHOUT the required scope is rejected (403) over real HTTP", async () => {
  const createResponse = await fetch(`${server.baseUrl}/v1/admin/service-accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminSessionToken}` },
    body: JSON.stringify({ name: "e2e-scopeless-service", scopes: ["event:read"] }), // no event:publish
  });
  const created = await json(createResponse);

  const response = await fetch(`${server.baseUrl}/v1/service/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${created.apiKey}` },
    body: JSON.stringify({
      eventId: "should-be-rejected",
      type: "e2e.test_event",
      source: "e2e-suite",
      occurredAt: new Date().toISOString(),
    }),
  });
  assert.equal(response.status, 403);
});

test("full event bus lifecycle over real HTTP: publish, then list it back", async () => {
  const eventId = `e2e-${Date.now()}`;
  const publishResponse = await fetch(`${server.baseUrl}/v1/service/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceAccountKey}` },
    body: JSON.stringify({
      eventId,
      type: "e2e.lifecycle_test",
      source: "e2e-suite",
      occurredAt: new Date().toISOString(),
      payload: { marker: eventId },
    }),
  });
  assert.equal(publishResponse.status, 201);
  const published = await json(publishResponse);
  assert.equal(published.eventId, eventId);

  const listResponse = await fetch(
    `${server.baseUrl}/v1/service/events?type=e2e.lifecycle_test`,
    { headers: { Authorization: `Bearer ${serviceAccountKey}` } },
  );
  assert.equal(listResponse.status, 200);
  const listed = await json(listResponse);
  assert.ok(listed.events.some((e: { eventId: string }) => e.eventId === eventId));
});

test("publishing the same eventId twice is idempotent over real HTTP, not a duplicate", async () => {
  const eventId = `e2e-idempotency-${Date.now()}`;
  const body = JSON.stringify({
    eventId,
    type: "e2e.idempotency_test",
    source: "e2e-suite",
    occurredAt: new Date().toISOString(),
  });
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${serviceAccountKey}` };

  const first = await fetch(`${server.baseUrl}/v1/service/events`, { method: "POST", headers, body });
  const second = await fetch(`${server.baseUrl}/v1/service/events`, { method: "POST", headers, body });

  const firstBody = await json(first);
  const secondBody = await json(second);
  assert.equal(firstBody.sequence, secondBody.sequence); // same row, not a new one
});
