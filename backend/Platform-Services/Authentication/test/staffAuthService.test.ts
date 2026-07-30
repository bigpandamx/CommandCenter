import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createStaffUser,
  login,
  verifySession,
  logout,
  AuthError,
} from "../src/staffAuthService.js";
import { FakeStaffAuthRepository } from "./fakeStaffAuthRepository.js";

async function registeredUser(repo: FakeStaffAuthRepository, overrides: Partial<{ email: string; password: string; role: "viewer" | "operator" | "admin" }> = {}) {
  return createStaffUser(repo, {
    email: overrides.email ?? "alice@aegis.example",
    password: overrides.password ?? "correct horse battery staple",
    role: overrides.role ?? "operator",
  });
}

test("createStaffUser rejects a duplicate email", async () => {
  const repo = new FakeStaffAuthRepository();
  await registeredUser(repo);
  await assert.rejects(
    () => registeredUser(repo),
    (err: unknown) => err instanceof AuthError && err.code === "email_already_registered",
  );
});

test("createStaffUser lowercases and trims email, and never returns the password hash", async () => {
  const repo = new FakeStaffAuthRepository();
  const user = await createStaffUser(repo, {
    email: "  Bob@Aegis.Example  ",
    password: "hunter222222",
    role: "viewer",
  });
  assert.equal(user.email, "bob@aegis.example");
  assert.ok(!("passwordHash" in user));
});

test("login succeeds with correct credentials and issues a session token", async () => {
  const repo = new FakeStaffAuthRepository();
  await registeredUser(repo, { email: "alice@aegis.example", password: "correct-password-123" });

  const result = await login(repo, "alice@aegis.example", "correct-password-123");
  assert.ok(result.sessionToken.startsWith("sess_"));
  assert.equal(result.staffUser.email, "alice@aegis.example");
  assert.ok(!("passwordHash" in result.staffUser));
});

test("login is case-insensitive on email", async () => {
  const repo = new FakeStaffAuthRepository();
  await registeredUser(repo, { email: "alice@aegis.example", password: "correct-password-123" });
  const result = await login(repo, "ALICE@Aegis.Example", "correct-password-123");
  assert.equal(result.staffUser.email, "alice@aegis.example");
});

test("login rejects a wrong password", async () => {
  const repo = new FakeStaffAuthRepository();
  await registeredUser(repo, { email: "alice@aegis.example", password: "correct-password-123" });
  await assert.rejects(
    () => login(repo, "alice@aegis.example", "wrong-password"),
    (err: unknown) => err instanceof AuthError && err.code === "invalid_credentials",
  );
});

test("login rejects an unknown email with the same error code as a wrong password (no user enumeration)", async () => {
  const repo = new FakeStaffAuthRepository();
  await assert.rejects(
    () => login(repo, "nobody@aegis.example", "whatever"),
    (err: unknown) => err instanceof AuthError && err.code === "invalid_credentials",
  );
});

test("login rejects a disabled account even with the correct password", async () => {
  const repo = new FakeStaffAuthRepository();
  const user = await registeredUser(repo, { email: "alice@aegis.example", password: "correct-password-123" });
  await repo.setStaffUserStatus(user.id, "disabled");

  await assert.rejects(
    () => login(repo, "alice@aegis.example", "correct-password-123"),
    (err: unknown) => err instanceof AuthError && err.code === "account_disabled",
  );
});

test("verifySession accepts a freshly issued token and returns the staff user", async () => {
  const repo = new FakeStaffAuthRepository();
  await registeredUser(repo, { email: "alice@aegis.example", password: "correct-password-123" });
  const { sessionToken } = await login(repo, "alice@aegis.example", "correct-password-123");

  const user = await verifySession(repo, sessionToken);
  assert.equal(user.email, "alice@aegis.example");
});

test("verifySession rejects a malformed token", async () => {
  const repo = new FakeStaffAuthRepository();
  await assert.rejects(
    () => verifySession(repo, "not-a-real-session-token"),
    (err: unknown) => err instanceof AuthError && err.code === "invalid_session",
  );
});

test("verifySession rejects a token whose session id exists but secret doesn't match", async () => {
  const repo = new FakeStaffAuthRepository();
  await registeredUser(repo, { email: "alice@aegis.example", password: "correct-password-123" });
  const { sessionToken } = await login(repo, "alice@aegis.example", "correct-password-123");

  const [prefix, sessionId] = sessionToken.split("_");
  const forged = `${prefix}_${sessionId}_totallyWrongSecretValueHereNotReal`;

  await assert.rejects(
    () => verifySession(repo, forged),
    (err: unknown) => err instanceof AuthError && err.code === "invalid_session",
  );
});

test("verifySession rejects an expired session", async () => {
  const repo = new FakeStaffAuthRepository();
  await registeredUser(repo, { email: "alice@aegis.example", password: "correct-password-123" });
  const loginTime = new Date("2026-01-01T00:00:00Z");
  const { sessionToken } = await login(repo, "alice@aegis.example", "correct-password-123", loginTime);

  const wayLater = new Date("2026-01-02T00:00:00Z"); // >12h TTL later
  await assert.rejects(
    () => verifySession(repo, sessionToken, wayLater),
    (err: unknown) => err instanceof AuthError && err.code === "session_expired",
  );
});

test("logout revokes the session so it can no longer be verified", async () => {
  const repo = new FakeStaffAuthRepository();
  await registeredUser(repo, { email: "alice@aegis.example", password: "correct-password-123" });
  const { sessionToken } = await login(repo, "alice@aegis.example", "correct-password-123");

  await logout(repo, sessionToken);

  await assert.rejects(
    () => verifySession(repo, sessionToken),
    (err: unknown) => err instanceof AuthError && err.code === "invalid_session",
  );
});

test("verifySession rejects a session for an account disabled after login", async () => {
  const repo = new FakeStaffAuthRepository();
  const user = await registeredUser(repo, { email: "alice@aegis.example", password: "correct-password-123" });
  const { sessionToken } = await login(repo, "alice@aegis.example", "correct-password-123");

  await repo.setStaffUserStatus(user.id, "disabled");

  await assert.rejects(
    () => verifySession(repo, sessionToken),
    (err: unknown) => err instanceof AuthError && err.code === "account_disabled",
  );
});
