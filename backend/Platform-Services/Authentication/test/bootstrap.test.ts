import { test } from "node:test";
import assert from "node:assert/strict";
import { bootstrapFirstStaffUser, BootstrapError } from "../src/bootstrap.js";
import { FakeStaffAuthRepository } from "./fakeStaffAuthRepository.js";

const VALID_PASSWORD = "correct-horse-battery-staple"; // 28 chars, well over the 12-char minimum

test("bootstrapFirstStaffUser creates an admin when no staff users exist", async () => {
  const repo = new FakeStaffAuthRepository();
  const user = await bootstrapFirstStaffUser(repo, { email: "founder@aegis.example", password: VALID_PASSWORD });

  assert.equal(user.email, "founder@aegis.example");
  assert.equal(user.role, "admin", "the bootstrap account must always be admin -- it needs to create every other staff account");
  assert.equal(user.status, "active");
});

test("bootstrapFirstStaffUser never returns the password hash", async () => {
  const repo = new FakeStaffAuthRepository();
  const user = await bootstrapFirstStaffUser(repo, { email: "founder@aegis.example", password: VALID_PASSWORD });
  assert.equal((user as Record<string, unknown>).passwordHash, undefined);
});

test("bootstrapFirstStaffUser refuses when even one staff user already exists -- the actual safety property this script exists for", async () => {
  const repo = new FakeStaffAuthRepository();
  await bootstrapFirstStaffUser(repo, { email: "first@aegis.example", password: VALID_PASSWORD });

  await assert.rejects(
    () => bootstrapFirstStaffUser(repo, { email: "second@aegis.example", password: VALID_PASSWORD }),
    (err: unknown) => err instanceof BootstrapError && err.code === "staff_users_already_exist",
  );
});

test("bootstrapFirstStaffUser refuses even if the existing staff user is disabled -- 'any row exists' is the bar, not 'any active row'", async () => {
  const repo = new FakeStaffAuthRepository();
  const created = await bootstrapFirstStaffUser(repo, { email: "first@aegis.example", password: VALID_PASSWORD });
  await repo.setStaffUserStatus(created.id, "disabled");

  await assert.rejects(
    () => bootstrapFirstStaffUser(repo, { email: "second@aegis.example", password: VALID_PASSWORD }),
    (err: unknown) => err instanceof BootstrapError && err.code === "staff_users_already_exist",
  );
});

test("bootstrapFirstStaffUser rejects a malformed email before touching the repository", async () => {
  const repo = new FakeStaffAuthRepository();
  await assert.rejects(
    () => bootstrapFirstStaffUser(repo, { email: "not-an-email", password: VALID_PASSWORD }),
    (err: unknown) => err instanceof BootstrapError && err.code === "invalid_input",
  );
  assert.equal((await repo.listStaffUsers()).length, 0, "nothing should be created when validation fails");
});

test("bootstrapFirstStaffUser rejects a password under the 12-character minimum", async () => {
  const repo = new FakeStaffAuthRepository();
  await assert.rejects(
    () => bootstrapFirstStaffUser(repo, { email: "founder@aegis.example", password: "short" }),
    (err: unknown) => err instanceof BootstrapError && err.code === "invalid_input",
  );
});

test("bootstrapFirstStaffUser accepts a password at exactly the 12-character minimum", async () => {
  const repo = new FakeStaffAuthRepository();
  const user = await bootstrapFirstStaffUser(repo, { email: "founder@aegis.example", password: "123456789012" });
  assert.equal(user.email, "founder@aegis.example");
});
