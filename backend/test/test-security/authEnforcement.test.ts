/**
 * Security suite: directly exercises the functions that actually gate
 * access to every staff and service-account route in this API
 * (requireServiceScope, requireStaffSession, requirePermission) --
 * not the Fastify route registration around them (see
 * backend/test/test-e2e/ for that; testing a route's *wiring* -- did the
 * developer actually attach the right preHandler with the right scope
 * string -- needs a real booted server, which is what the E2E suite is
 * for). This suite tests the enforcement logic itself: given a request
 * with these headers, does the right thing happen.
 *
 * No real Fastify instance needed -- these preHandler functions only
 * read request.headers and call reply.status()/.send(), so a plain
 * mock object satisfying that shape is enough to exercise them for
 * real, without needing the real `fastify` package installed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createServiceAccount } from "../../Platform-Services/Authentication/src/serviceAccountService.js";
import { FakeServiceAccountRepository } from "../../Platform-Services/Authentication/test/fakeServiceAccountRepository.js";
import { requireServiceScope, getAuthenticatedServiceAccount } from "../../api/src/routes/serviceAuth.js";
import { createStaffUser, login } from "../../Platform-Services/Authentication/src/staffAuthService.js";
import { FakeStaffAuthRepository } from "../../Platform-Services/Authentication/test/fakeStaffAuthRepository.js";
import { requireStaffSession, requirePermission, getAuthenticatedStaffUser } from "../../api/src/routes/staffAuth.js";

interface MockReply {
  reply: FastifyReply;
  statusCode: number | null;
  body: unknown;
}

function makeMockReply(): MockReply {
  const state: MockReply = { reply: null as unknown as FastifyReply, statusCode: null, body: null };
  const reply = {
    status(code: number) {
      state.statusCode = code;
      return reply;
    },
    send(payload?: unknown) {
      state.body = payload;
      return reply;
    },
  } as unknown as FastifyReply;
  state.reply = reply;
  return state;
}

function makeMockRequest(headers: Record<string, string> = {}): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

// ---------------------------------------------------------------------
// requireServiceScope
// ---------------------------------------------------------------------

test("requireServiceScope rejects a request with no Authorization header (401)", async () => {
  const repo = new FakeServiceAccountRepository();
  const preHandler = requireServiceScope(repo, "event:publish");

  const request = makeMockRequest();
  const mock = makeMockReply();
  await preHandler(request, mock.reply);

  assert.equal(mock.statusCode, 401);
});

test("requireServiceScope rejects a non-Bearer Authorization header (401)", async () => {
  const repo = new FakeServiceAccountRepository();
  const preHandler = requireServiceScope(repo, "event:publish");

  const request = makeMockRequest({ authorization: "Basic dXNlcjpwYXNz" });
  const mock = makeMockReply();
  await preHandler(request, mock.reply);

  assert.equal(mock.statusCode, 401);
});

test("requireServiceScope rejects a malformed/unparseable key (401)", async () => {
  const repo = new FakeServiceAccountRepository();
  const preHandler = requireServiceScope(repo, "event:publish");

  const request = makeMockRequest({ authorization: "Bearer not-a-real-key-at-all" });
  const mock = makeMockReply();
  await preHandler(request, mock.reply);

  assert.equal(mock.statusCode, 401);
});

test("requireServiceScope rejects a revoked account's key (401), even though the key itself is valid", async () => {
  const repo = new FakeServiceAccountRepository();
  const created = await createServiceAccount(repo, { name: "test-svc", scopes: ["event:publish"] });
  const stored = await repo.getServiceAccountById(created.accountId);
  await repo.updateServiceAccount({ ...stored!, status: "revoked" });

  const preHandler = requireServiceScope(repo, "event:publish");
  const request = makeMockRequest({ authorization: `Bearer ${created.apiKey}` });
  const mock = makeMockReply();
  await preHandler(request, mock.reply);

  assert.equal(mock.statusCode, 401);
});

test("requireServiceScope rejects a valid, active account that lacks the required scope (403, not 401)", async () => {
  const repo = new FakeServiceAccountRepository();
  const created = await createServiceAccount(repo, { name: "test-svc", scopes: ["event:read"] }); // no event:publish

  const preHandler = requireServiceScope(repo, "event:publish");
  const request = makeMockRequest({ authorization: `Bearer ${created.apiKey}` });
  const mock = makeMockReply();
  await preHandler(request, mock.reply);

  // Specifically 403, not 401 -- the credential itself is valid, it's
  // just not authorized for this action. Conflating the two would leak
  // less useful information to a legitimate caller debugging a scope
  // problem, and there's no security reason to hide "which failure mode"
  // for an already-authenticated caller the way there is for an
  // unauthenticated one.
  assert.equal(mock.statusCode, 403);
});

test("requireServiceScope succeeds and attaches the account when the key and scope are both valid", async () => {
  const repo = new FakeServiceAccountRepository();
  const created = await createServiceAccount(repo, { name: "test-svc", scopes: ["event:publish"] });

  const preHandler = requireServiceScope(repo, "event:publish");
  const request = makeMockRequest({ authorization: `Bearer ${created.apiKey}` });
  const mock = makeMockReply();
  await preHandler(request, mock.reply);

  assert.equal(mock.statusCode, null); // never rejected
  const account = getAuthenticatedServiceAccount(request);
  assert.equal(account.name, "test-svc");
});

test("getAuthenticatedServiceAccount throws if called without requireServiceScope having run first", () => {
  const request = makeMockRequest();
  assert.throws(() => getAuthenticatedServiceAccount(request));
});

// ---------------------------------------------------------------------
// requireStaffSession / requirePermission
// ---------------------------------------------------------------------

test("requireStaffSession rejects a request with no Authorization header (401)", async () => {
  const repo = new FakeStaffAuthRepository();
  const preHandler = requireStaffSession(repo);

  const request = makeMockRequest();
  const mock = makeMockReply();
  await preHandler(request, mock.reply);

  assert.equal(mock.statusCode, 401);
});

test("requireStaffSession rejects a well-formed but nonexistent session token (401)", async () => {
  const repo = new FakeStaffAuthRepository();
  const preHandler = requireStaffSession(repo);

  const request = makeMockRequest({ authorization: "Bearer sess_00000000000000000000000000000000000000000000000000" });
  const mock = makeMockReply();
  await preHandler(request, mock.reply);

  assert.equal(mock.statusCode, 401);
});

test("requireStaffSession rejects a disabled user's otherwise-valid session (401)", async () => {
  const repo = new FakeStaffAuthRepository();
  await createStaffUser(repo, { email: "viewer@example.com", password: "correct horse battery staple", role: "viewer" });
  const loginResult = await login(repo, "viewer@example.com", "correct horse battery staple");

  const user = await repo.getStaffUserByEmail("viewer@example.com");
  await repo.setStaffUserStatus(user!.id, "disabled");

  const preHandler = requireStaffSession(repo);
  const request = makeMockRequest({ authorization: `Bearer ${loginResult.sessionToken}` });
  const mock = makeMockReply();
  await preHandler(request, mock.reply);

  assert.equal(mock.statusCode, 401);
});

test("requirePermission rejects a valid session whose role lacks the permission (403)", async () => {
  const repo = new FakeStaffAuthRepository();
  await createStaffUser(repo, { email: "viewer@example.com", password: "correct horse battery staple", role: "viewer" });
  const loginResult = await login(repo, "viewer@example.com", "correct horse battery staple");

  const request = makeMockRequest({ authorization: `Bearer ${loginResult.sessionToken}` });
  const sessionMock = makeMockReply();
  await requireStaffSession(repo)(request, sessionMock.reply);
  assert.equal(sessionMock.statusCode, null); // session itself is valid

  // viewer can read feature flags but not manage them (see rbac.ts) --
  // the actual boundary this test is about.
  const permissionMock = makeMockReply();
  await requirePermission("feature_flag:manage")(request, permissionMock.reply);

  assert.equal(permissionMock.statusCode, 403);
});

test("requirePermission succeeds for a role that genuinely has the permission", async () => {
  const repo = new FakeStaffAuthRepository();
  await createStaffUser(repo, { email: "admin@example.com", password: "correct horse battery staple", role: "admin" });
  const loginResult = await login(repo, "admin@example.com", "correct horse battery staple");

  const request = makeMockRequest({ authorization: `Bearer ${loginResult.sessionToken}` });
  await requireStaffSession(repo)(request, makeMockReply().reply);

  const permissionMock = makeMockReply();
  await requirePermission("feature_flag:manage")(request, permissionMock.reply);

  assert.equal(permissionMock.statusCode, null);
  const user = getAuthenticatedStaffUser(request);
  assert.equal(user.role, "admin");
});

test("a revoked session cannot be reused after an admin-initiated logout", async () => {
  const repo = new FakeStaffAuthRepository();
  await createStaffUser(repo, { email: "user@example.com", password: "correct horse battery staple", role: "operator" });
  const loginResult = await login(repo, "user@example.com", "correct horse battery staple");

  const sessions = [...repo.sessions.values()];
  const session = sessions[0];
  assert.ok(session, "expected a session to exist after login");
  session!.revokedAt = new Date();

  const preHandler = requireStaffSession(repo);
  const request = makeMockRequest({ authorization: `Bearer ${loginResult.sessionToken}` });
  const mock = makeMockReply();
  await preHandler(request, mock.reply);

  assert.equal(mock.statusCode, 401);
});
