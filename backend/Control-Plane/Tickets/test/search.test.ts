import { test } from "node:test";
import assert from "node:assert/strict";
import { createTicket, assignTicket, changeTicketStatus } from "../src/ticketService.js";
import { FakeTicketsRepository } from "./fakeRepository.js";
import { FakeIdentityRepository } from "../../../Platform-Services/Identity/test/fakeIdentityRepository.js";

async function seedThreeTickets(repo: FakeTicketsRepository) {
  const identityRepo = new FakeIdentityRepository();
  const seedTime = new Date("2026-01-01T00:00:00Z");
  const bug = await createTicket(
    repo,
    identityRepo,
    {
      subject: "Login fails on staging",
      description: "Users cannot log in after the last deploy.",
      category: "bug",
      priority: "high",
      organizationId: "org-1",
      source: "customer",
    },
    seedTime,
  );
  const billing = await createTicket(
    repo,
    identityRepo,
    {
      subject: "Invoice discrepancy",
      description: "Last invoice total doesn't match the usage dashboard.",
      category: "billing",
      organizationId: "org-2",
      source: "customer",
    },
    seedTime,
  );
  const internal = await createTicket(
    repo,
    identityRepo,
    {
      subject: "Refactor telemetry ingestion",
      description: "Tech debt cleanup, no customer impact.",
      category: "feature_request",
      source: "staff",
    },
    seedTime,
  );
  return { bug, billing, internal };
}

test("searchTickets with no filters returns everything", async () => {
  const repo = new FakeTicketsRepository();
  await seedThreeTickets(repo);
  const results = await repo.searchTickets({});
  assert.equal(results.length, 3);
});

test("searchTickets filters by team", async () => {
  const repo = new FakeTicketsRepository();
  await seedThreeTickets(repo);
  const engineering = await repo.searchTickets({ team: "engineering" });
  assert.equal(engineering.length, 2); // bug + feature_request
  const support = await repo.searchTickets({ team: "support" });
  assert.equal(support.length, 1); // billing
});

test("searchTickets filters by organizationId", async () => {
  const repo = new FakeTicketsRepository();
  const { bug } = await seedThreeTickets(repo);
  const results = await repo.searchTickets({ organizationId: "org-1" });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.id, bug.id);
});

test("searchTickets filters unassigned tickets", async () => {
  const repo = new FakeTicketsRepository();
  const { bug } = await seedThreeTickets(repo);
  await assignTicket(repo, bug.id, "staff-1");

  const unassigned = await repo.searchTickets({ unassigned: true });
  assert.equal(unassigned.length, 2);
  assert.ok(!unassigned.some((t) => t.id === bug.id));
});

test("searchTickets filters by status", async () => {
  const repo = new FakeTicketsRepository();
  const { bug } = await seedThreeTickets(repo);
  await changeTicketStatus(repo, bug.id, "resolved");

  const resolved = await repo.searchTickets({ status: "resolved" });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.id, bug.id);
});

test("searchTickets text search matches subject or description, case-insensitively", async () => {
  const repo = new FakeTicketsRepository();
  await seedThreeTickets(repo);

  const bySubject = await repo.searchTickets({ text: "INVOICE" });
  assert.equal(bySubject.length, 1);

  const byDescription = await repo.searchTickets({ text: "deploy" });
  assert.equal(byDescription.length, 1);
});

test("searchTickets combines filters with AND semantics", async () => {
  const repo = new FakeTicketsRepository();
  await seedThreeTickets(repo);

  const results = await repo.searchTickets({ team: "engineering", priority: "high" });
  assert.equal(results.length, 1); // only the bug ticket is both engineering AND high priority
});

test("searchTickets sorts by most recently updated first", async () => {
  const repo = new FakeTicketsRepository();
  const { bug, billing } = await seedThreeTickets(repo);
  await changeTicketStatus(repo, bug.id, "in_progress", new Date("2026-07-20T09:00:00Z"));
  await changeTicketStatus(repo, billing.id, "in_progress", new Date("2026-07-20T15:00:00Z"));

  const results = await repo.searchTickets({});
  assert.equal(results[0]?.id, billing.id, "most recently updated ticket should be first");
});
