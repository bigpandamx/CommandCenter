import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createServiceAccount,
  authenticateServiceAccount,
  assertServiceScope,
  rotateServiceAccountKey,
  revokeServiceAccount,
  ServiceAccountError,
} from "../src/serviceAccountService.js";
import { FakeServiceAccountRepository } from "./fakeServiceAccountRepository.js";

test("createServiceAccount creates an active account with the requested scopes and a usable key", async () => {
  const repo = new FakeServiceAccountRepository();
  const result = await createServiceAccount(repo, {
    name: "aegis-backend",
    description: "Aegis's own backend, pulling compliance updates",
    scopes: ["compliance:read"],
  });

  assert.ok(result.apiKey.startsWith("svc_"));
  assert.deepEqual(result.scopes, ["compliance:read"]);

  const stored = await repo.getServiceAccountById(result.accountId);
  assert.equal(stored?.status, "active");
  assert.notEqual(stored?.apiKeyHash, result.apiKey, "plaintext key must never equal the stored hash");
});

test("authenticateServiceAccount succeeds with the correct key and updates lastUsedAt", async () => {
  const repo = new FakeServiceAccountRepository();
  const created = await createServiceAccount(repo, { name: "svc", scopes: ["compliance:read"] });
  const now = new Date("2026-07-20T12:00:00Z");

  const account = await authenticateServiceAccount(repo, created.apiKey, now);

  assert.equal(account.id, created.accountId);
  assert.equal(account.lastUsedAt?.toISOString(), now.toISOString());
});

test("authenticateServiceAccount rejects a wrong key", async () => {
  const repo = new FakeServiceAccountRepository();
  const created = await createServiceAccount(repo, { name: "svc", scopes: [] });
  await assert.rejects(
    () => authenticateServiceAccount(repo, `svc_${created.accountId}_wrongsecretvaluehere`),
    (err: unknown) => err instanceof ServiceAccountError && err.code === "unauthorized",
  );
});

test("authenticateServiceAccount rejects a malformed token", async () => {
  const repo = new FakeServiceAccountRepository();
  await assert.rejects(
    () => authenticateServiceAccount(repo, "not-a-real-token"),
    (err: unknown) => err instanceof ServiceAccountError && err.code === "unauthorized",
  );
});

test("authenticateServiceAccount rejects an unknown account id embedded in an otherwise well-formed token", async () => {
  const repo = new FakeServiceAccountRepository();
  await assert.rejects(
    () => authenticateServiceAccount(repo, "svc_00000000-0000-4000-8000-000000000000_somesecretvalue"),
    (err: unknown) => err instanceof ServiceAccountError && err.code === "account_not_found",
  );
});

test("authenticateServiceAccount rejects a revoked account even with the correct key", async () => {
  const repo = new FakeServiceAccountRepository();
  const created = await createServiceAccount(repo, { name: "svc", scopes: [] });
  await revokeServiceAccount(repo, created.accountId);

  await assert.rejects(
    () => authenticateServiceAccount(repo, created.apiKey),
    (err: unknown) => err instanceof ServiceAccountError && err.code === "account_revoked",
  );
});

test("assertServiceScope passes when the account has the required scope", async () => {
  const repo = new FakeServiceAccountRepository();
  const created = await createServiceAccount(repo, { name: "svc", scopes: ["compliance:read", "billing:read"] });
  const account = await authenticateServiceAccount(repo, created.apiKey);
  assert.doesNotThrow(() => assertServiceScope(account, "compliance:read"));
});

test("assertServiceScope throws when the account lacks the required scope", async () => {
  const repo = new FakeServiceAccountRepository();
  const created = await createServiceAccount(repo, { name: "svc", scopes: ["billing:read"] });
  const account = await authenticateServiceAccount(repo, created.apiKey);
  assert.throws(
    () => assertServiceScope(account, "compliance:read"),
    (err: unknown) => err instanceof ServiceAccountError && err.code === "missing_scope",
  );
});

test("rotateServiceAccountKey issues a new key and immediately invalidates the old one", async () => {
  const repo = new FakeServiceAccountRepository();
  const created = await createServiceAccount(repo, { name: "svc", scopes: [] });

  const rotated = await rotateServiceAccountKey(repo, created.accountId);

  assert.notEqual(rotated.apiKey, created.apiKey);
  await assert.rejects(
    () => authenticateServiceAccount(repo, created.apiKey),
    (err: unknown) => err instanceof ServiceAccountError && err.code === "unauthorized",
  );
  const account = await authenticateServiceAccount(repo, rotated.apiKey);
  assert.equal(account.id, created.accountId);
});

test("rotateServiceAccountKey throws for an unknown account", async () => {
  const repo = new FakeServiceAccountRepository();
  await assert.rejects(
    () => rotateServiceAccountKey(repo, "00000000-0000-4000-8000-000000000000"),
    (err: unknown) => err instanceof ServiceAccountError && err.code === "account_not_found",
  );
});

test("revokeServiceAccount stamps revokedAt and sets status to revoked", async () => {
  const repo = new FakeServiceAccountRepository();
  const created = await createServiceAccount(repo, { name: "svc", scopes: [] });
  const now = new Date("2026-07-20T12:00:00Z");

  await revokeServiceAccount(repo, created.accountId, now);

  const stored = await repo.getServiceAccountById(created.accountId);
  assert.equal(stored?.status, "revoked");
  assert.equal(stored?.revokedAt?.toISOString(), now.toISOString());
});
